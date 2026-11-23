import { MAX_SPM, MIN_SPM } from './constants.js';
import type { BoatRuntime, DrummerState, DrummerSpec } from './types.js';

/** 巡航桨频约 72~82，冲刺 100+；AI 根据赛程阶段与体力规划 */
const CRUISE_SPM = 76;
const START_SPM = 88;
const FINISH_SPM = 112;

export function createDrummer(spec: DrummerSpec, manual = false, reactionAnchor = 0.18): DrummerState {
  return {
    spec,
    targetSpm: START_SPM,
    currentSpm: START_SPM,
    timeToBeat: 0,
    beats: 0,
    lastBeatTime: 0,
    playerDriven: false,
    manual,
    reactionAnchor,
    // 好鼓手能把划手个体反应差异大幅收拢（稳定性 0→收拢 20%，0.95→收拢 77%）
    cohesion: 0.2 + spec.stability * 0.6,
  };
}

/**
 * AI 鼓手节奏规划：
 * - 出发 10s 高频起航；随后回落到巡航；
 * - 末段按队伍激进程度提前提速冲刺，体力越好提得越猛；
 * - 节奏稳定性高的鼓手波动小。
 */
export function planAiDrummer(boat: BoatRuntime, raceLength: number, time: number, rng: { gauss: (m: number, s: number) => number }): void {
  const d = boat.drummer;
  const progress = boat.distance / raceLength;
  const sprintStart = 0.78 - d.spec.aggression * 0.12; // 激进队 66% 处就开始冲
  let target: number;
  if (time < 10) {
    target = START_SPM;
  } else if (progress < sprintStart) {
    target = CRUISE_SPM;
  } else {
    const q = Math.min(1, (progress - sprintStart) / (1 - sprintStart));
    target = CRUISE_SPM + (FINISH_SPM - CRUISE_SPM) * q;
  }
  // 体力不足时 AI 会保守一点
  target *= 0.94 + boat.avgFreshness * 0.06;
  target += rng.gauss(0, (1 - d.spec.stability) * 2.2);
  d.targetSpm = clampSpm(target);
}

export function clampSpm(spm: number): number {
  return Math.min(MAX_SPM, Math.max(MIN_SPM, spm));
}

/**
 * 玩家敲鼓：把两次敲击间隔换算成目标桨频。
 * 返回是否构成有效鼓点（间隔过短会被拒绝，防止刷键）。
 */
export function playerBeat(d: DrummerState, now: number): boolean {
  if (d.beats > 0) {
    const interval = now - d.lastBeatTime;
    if (interval < 60 / MAX_SPM) return false;
    const spm = clampSpm(60 / interval);
    d.targetSpm = spm;
  }
  d.lastBeatTime = now;
  d.beats++;
  d.timeToBeat = 0;
  d.playerDriven = true;
  return true;
}

/** 每 tick 更新鼓手。AI 船倒计时自动出拍；玩家船只平滑桨频，鼓点完全由玩家敲出 */
export function tickDrummer(d: DrummerState, dt: number): boolean {
  // 桨频突变会让划手更难跟，做一阶平滑；时间常数 0.4s
  d.currentSpm += (d.targetSpm - d.currentSpm) * Math.min(1, dt / 0.4);
  if (d.manual) return false;
  if (d.beats === 0) {
    // 首拍立即触发
    d.timeToBeat = 60 / d.currentSpm;
    d.beats = 1;
    return true;
  }
  if (d.timeToBeat > 0) {
    d.timeToBeat -= dt;
    if (d.timeToBeat <= 0) {
      d.beats++;
      // 以当前实际桨频安排下一拍间隔，并把漂移清零，避免误差累积
      d.timeToBeat = 60 / d.currentSpm + d.timeToBeat;
      d.playerDriven = false;
      return true; // 本 tick 出鼓点
    }
  }
  return false;
}
