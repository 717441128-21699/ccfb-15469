import {
  BOAT_LENGTH,
  BOAT_MASS,
  DRAG_LINEAR,
  DRAG_QUADRATIC,
  PADDLE_F_MAX,
  PADDLE_LATERAL_OFFSET,
  PULL_FRACTION,
  PADDLER_COUNT,
  RUDDER_DRAG_COEF,
  RUDDER_GAIN,
  RUDDER_MAX_ANGLE,
  SIGMA_REF,
  SWAY_DRAG,
  SYNERGY_BONUS,
  SYNERGY_REF,
  WAKE_AHEAD_DIST,
  WAKE_DRAG,
  WAKE_HALF_WIDTH,
  WAKE_LATERAL_FORCE,
  WAKE_YAW_MOMENT,
  YAW_DRAG_LINEAR,
  YAW_DRAG_QUADRATIC,
  YAW_INERTIA,
} from './constants.js';
import { Rng } from './rng.js';
import { createPaddler, scheduleStroke, stepPaddler } from './paddler.js';
import { createDrummer, planAiDrummer, tickDrummer } from './drummer.js';
import { FlowField } from './flow.js';
import type { BoatConfig, BoatRuntime } from './types.js';

export function createBoat(config: BoatConfig): BoatRuntime {
  const startY = (config.lane - 2.5) * 9; // 6 条航道，中线对称
  const anchor =
    config.team.paddlers.reduce((sum, spec) => sum + spec.reactionMean, 0) / config.team.paddlers.length;
  const boat: BoatRuntime = {
    config,
    paddlers: config.team.paddlers.map(createPaddler),
    drummer: createDrummer(config.team.drummer, config.isPlayer, anchor),
    x: 0,
    y: startY,
    heading: 0,
    u: 0,
    v: 0,
    r: 0,
    rudder: 0,
    lastSyncSigma: 0,
    lastSyncEfficiency: 1,
    lastMeanOffset: 0,
    distance: 0,
    finishTime: null,
    avgFreshness: 1,
    rawThrust: 0,
    netThrust: 0,
    lateralForce: 0,
    yawMoment: 0,
  };
  return boat;
}

/** 按鼓点批次归集的入水样本（挂在 boat 上的内部工作区） */
interface SyncWorkspace {
  /** beatId → 该拍下所有桨手的实际入水延迟 */
  batches: Map<number, number[]>;
  /** 已完成统计的最大批次 */
  settledBeat: number;
  /** 已执行 scheduleStroke 的最大拍号，防止手动鼓点在同帧被重复调度 */
  lastScheduledBeat: number;
}
const syncWorkspace = new WeakMap<BoatRuntime, SyncWorkspace>();
function ws(boat: BoatRuntime): SyncWorkspace {
  let s = syncWorkspace.get(boat);
  if (!s) {
    s = { batches: new Map(), settledBeat: -1, lastScheduledBeat: -1 };
    syncWorkspace.set(boat, s);
  }
  return s;
}

/** 玩家手动敲鼓后调用：为全船划手调度该拍，并记录拍号防止 stepBoat 同帧重复调度 */
export function schedulePlayerBeat(boat: BoatRuntime, rng: Rng): void {
  const workspace = ws(boat);
  const beatId = boat.drummer.beats;
  if (workspace.lastScheduledBeat >= beatId) return;
  for (const p of boat.paddlers) scheduleStroke(p, boat.drummer, rng);
  workspace.lastScheduledBeat = beatId;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * 船浪互扰：当前船处在另一艘船尾后方的锥形浪区时，
 * 受到横向推偏、偏航力矩与附加阻力。两船靠越近作用越强。
 */
export function wakeEffect(self: BoatRuntime, other: BoatRuntime): { fx: number; fy: number; mz: number } {
  const dx = other.x - self.x;
  if (dx <= 0 || dx > WAKE_AHEAD_DIST) return { fx: 0, fy: 0, mz: 0 };
  const dy = other.y - self.y;
  if (Math.abs(dy) > WAKE_HALF_WIDTH) return { fx: 0, fy: 0, mz: 0 };
  const along = Math.exp(-dx / (WAKE_AHEAD_DIST * 0.7));
  const across = Math.exp(-(dy * dy) / (2 * 1.6 * 1.6));
  const k = along * across;
  // 浪把后船推离前车中线（dy>0 表示前车在左，力把本船往右推 → fy 取负）
  const fy = -Math.sign(dy || 1) * WAKE_LATERAL_FORCE * k;
  const mz = -Math.sign(dy || 1) * WAKE_YAW_MOMENT * k * 0.8;
  const fx = -WAKE_DRAG * self.u * k;
  return { fx, fy, mz };
}

export interface StepContext {
  dt: number;
  time: number;
  raceLength: number;
  flow: FlowField;
  others: BoatRuntime[];
  /** 玩家舵输入 -1..1（左满舵..右满舵），AI 船传 null */
  helmInput: number | null;
}

/**
 * 单船推进一个 120Hz 物理步。
 * 顺序：鼓手出拍 → 划手调度/推进 → 同步统计 → 力合成（桨/阻力/舵/水流/船浪）→ 半隐式欧拉积分。
 */
export function stepBoat(boat: BoatRuntime, ctx: StepContext, rng: Rng): void {
  const { dt, time } = ctx;
  if (boat.finishTime !== null) {
    // 完赛后滑行减速，不影响名次
    integrateCoasting(boat, ctx, rng);
    return;
  }

  // 1. 鼓手
  if (!boat.config.isPlayer) {
    planAiDrummer(boat, ctx.raceLength, time, rng);
  }
  const beat = tickDrummer(boat.drummer, dt);
  const beatId = boat.drummer.beats;
  const workspace = ws(boat);
  if (beat && workspace.lastScheduledBeat < beatId) {
    for (const p of boat.paddlers) scheduleStroke(p, boat.drummer, rng);
    workspace.lastScheduledBeat = beatId;
  }
  // 手动鼓点由 schedulePlayerBeat 标记；AI 鼓点在上面标记。检测到新拍号即结算上一批的同步度
  const newBeatScheduled = workspace.lastScheduledBeat > workspace.settledBeat && workspace.lastScheduledBeat >= 0;

  // 2. 划手推进，按鼓点批次归集入水延迟（划手用自身记录的拍号，手动/AI 通用）
  let rawThrust = 0;
  let freshnessSum = 0;
  for (const p of boat.paddlers) {
    const res = stepPaddler(p, dt, beatId);
    rawThrust += res.force;
    if (res.caught) {
      const key = p.lastCatchBeat;
      let batch = workspace.batches.get(key);
      if (!batch) {
        batch = [];
        workspace.batches.set(key, batch);
      }
      batch.push(p.catchOffset);
    }
    freshnessSum += p.freshness;
  }
  boat.avgFreshness = freshnessSum / boat.paddlers.length;

  // 当新鼓点已调度、上一批次不再可能有新入水时，结算上一批的同步度
  if (newBeatScheduled) {
    const prevId = workspace.lastScheduledBeat - 1;
    const batch = workspace.batches.get(prevId);
    if (batch && batch.length >= 2) {
      const sigma = std(batch);
      boat.lastSyncSigma = sigma;
      boat.lastMeanOffset = mean(batch);
      // 基础折减：离散越大推力抵消越多
      const base = Math.exp(-((sigma / SIGMA_REF) ** 2));
      // 协同增益：极度齐整时水动力耦合加成
      const synergy = SYNERGY_BONUS * Math.exp(-((sigma / SYNERGY_REF) ** 2));
      boat.lastSyncEfficiency = base + synergy;
    }
    workspace.batches.delete(prevId);
    // 清理更老的残留批次
    for (const key of workspace.batches.keys()) {
      if (key <= prevId) workspace.batches.delete(key);
    }
    workspace.settledBeat = workspace.lastScheduledBeat;
  }

  // 3. 推力：同步折减 + 左右舷不平衡产生偏航
  const sync = boat.lastSyncEfficiency;
  const netThrust = rawThrust * sync;
  let portForce = 0;
  let starboardForce = 0;
  for (const p of boat.paddlers) {
    const f = p.instantForce * sync;
    if (p.spec.side === 'port') portForce += f;
    else starboardForce += f;
  }
  // 左舷桨在船中线左侧（+y），推力向前但两侧差产生艏摇力矩
  const paddleYaw = (portForce - starboardForce) * PADDLE_LATERAL_OFFSET;

  // 4. 水流（世界系 → 船体系相对速度）
  const flow = ctx.flow.sample(boat.x, boat.y, rng);
  const cosH = Math.cos(boat.heading);
  const sinH = Math.sin(boat.heading);
  // 世界系流速转船体系
  const flowU = flow.vx * cosH + flow.vy * sinH;
  const flowV = -flow.vx * sinH + flow.vy * cosH;
  const relU = boat.u - flowU;
  const relV = boat.v - flowV;

  // 阻力（相对水）
  const dragU = -(DRAG_LINEAR * relU + DRAG_QUADRATIC * relU * Math.abs(relU));
  const dragV = -SWAY_DRAG * relV;

  // 5. 舵
  let targetRudder: number;
  if (ctx.helmInput !== null) {
    targetRudder = ctx.helmInput * RUDDER_MAX_ANGLE;
  } else {
    // AI 舵手：抵消偏航 + 顺着水流把船留在航道中线
    const laneCenterY = (boat.config.lane - 2.5) * 9;
    const aim = (laneCenterY - boat.y) * 0.25 - boat.r * 1.2 + flow.vy * 0.6;
    targetRudder = Math.max(-RUDDER_MAX_ANGLE, Math.min(RUDDER_MAX_ANGLE, aim * boat.config.team.helm.skill));
  }
  boat.rudder += (targetRudder - boat.rudder) * Math.min(1, dt * 6);
  // 舵产生横向力（需有船速才生效）与附加阻力
  const rudderFy = RUDDER_GAIN * boat.rudder * Math.min(1, boat.u / 3);
  const rudderDrag = -RUDDER_DRAG_COEF * boat.rudder * boat.rudder * boat.u;

  // 6. 船浪
  let wakeFx = 0;
  let wakeFy = 0;
  let wakeMz = 0;
  for (const o of ctx.others) {
    const w = wakeEffect(boat, o);
    wakeFx += w.fx;
    wakeFy += w.fy;
    wakeMz += w.mz;
  }

  // 7. 力合成与积分（船体系）
  const fx = netThrust + dragU + rudderDrag + wakeFx;
  const fy = dragV + rudderFy + wakeFy;
  const mz =
    paddleYaw +
    -(YAW_DRAG_LINEAR * boat.r + YAW_DRAG_QUADRATIC * boat.r * Math.abs(boat.r)) +
    rudderFy * BOAT_LENGTH * 0.42 +
    wakeMz;

  boat.rawThrust = rawThrust;
  boat.netThrust = netThrust;
  boat.lateralForce = fy;
  boat.yawMoment = mz;

  boat.u += (fx / BOAT_MASS) * dt;
  boat.v += (fy / BOAT_MASS) * dt;
  boat.r += (mz / YAW_INERTIA) * dt;
  if (boat.u < 0) boat.u = 0; // 不允许倒漂冲过起点

  // 运动学：船体系速度转世界系
  boat.x += (boat.u * cosH - boat.v * sinH) * dt;
  boat.y += (boat.u * sinH + boat.v * cosH) * dt;
  boat.heading += boat.r * dt;
  boat.distance = Math.max(boat.distance, boat.x);

  if (boat.distance >= ctx.raceLength && boat.finishTime === null) {
    boat.finishTime = time;
  }
}

/** 完赛后只受水阻力滑行 */
function integrateCoasting(boat: BoatRuntime, ctx: StepContext, rng: Rng): void {
  const flow = ctx.flow.sample(boat.x, boat.y, rng);
  const relU = boat.u - flow.vx;
  boat.u += (-(DRAG_LINEAR * relU + DRAG_QUADRATIC * relU * Math.abs(relU)) / BOAT_MASS) * ctx.dt;
  boat.r += (-(YAW_DRAG_LINEAR * boat.r) / YAW_INERTIA) * ctx.dt;
  boat.heading += boat.r * ctx.dt;
  boat.x += boat.u * Math.cos(boat.heading) * ctx.dt;
  boat.y += boat.u * Math.sin(boat.heading) * ctx.dt;
}

/**
 * 解析平衡速度：单桨半正弦冲量在整个划桨周期上平均后的稳态推力，
 * 与水阻力 D1·v + D2·v² 平衡时的船速（静水），供验收指标 1 对照。
 * @param thrustScale 发力缩放（力量×体力），完全同步满状态时为 1
 * @param period 划桨周期 s（默认按 80 SPM 巡航）
 * @param syncEfficiency 同步效率，完美同步且含协同增益时为 1+SYNERGY_BONUS，纯 η=1 对照传 1
 */
export function analyticalEquilibriumSpeed(
  thrustScale: number,
  period = 60 / 80,
  syncEfficiency = 1,
): number {
  const pull = period * PULL_FRACTION;
  // 与仿真一致的桨频修正：快桨峰值略低
  const rateFactor = Math.min(1.15, Math.max(0.78, Math.sqrt((60 / 80) / period)));
  // 单桨冲量 = ∫F·dt = 2/π·F_MAX·rateFactor·pull；全队平均推力 = N·冲量/周期 × 同步效率
  const meanThrust =
    (PADDLER_COUNT * PADDLE_F_MAX * thrustScale * rateFactor * (2 / Math.PI) * pull * syncEfficiency) / period;
  const disc = DRAG_LINEAR * DRAG_LINEAR + 4 * DRAG_QUADRATIC * meanThrust;
  return (-DRAG_LINEAR + Math.sqrt(disc)) / (2 * DRAG_QUADRATIC);
}
