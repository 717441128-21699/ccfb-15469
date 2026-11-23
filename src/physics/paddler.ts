import {
  FATIGUE_PER_STROKE,
  MIN_POWER_FACTOR,
  MIN_STROKE_PERIOD,
  PADDLE_F_MAX,
  PULL_FRACTION,
} from './constants.js';
import { Rng } from './rng.js';
import type { DrummerState, PaddlerSpec, PaddlerState } from './types.js';

export function createPaddler(spec: PaddlerSpec): PaddlerState {
  return {
    spec,
    phase: 'wait',
    cycleTime: 0,
    strokePeriod: 1,
    pullDuration: PULL_FRACTION,
    catchOffset: 0,
    powerFactor: 1,
    instantForce: 0,
    strokes: 0,
    freshness: 1,
    missed: 0,
    lastCatchBeat: -1,
  };
}

/** 疲劳带来的反应迟滞（秒），体力越低越跟不上 */
function fatigueLag(p: PaddlerState): number {
  return (1 - p.freshness) * 0.22;
}

function finishStroke(p: PaddlerState): void {
  p.strokes++;
  // 高桨频单位时间划桨更多 → 疲劳更快；耐力高的人消耗慢
  const rate = FATIGUE_PER_STROKE * (1.35 - p.spec.stamina) * (60 / p.strokePeriod / 80);
  p.freshness = Math.max(MIN_POWER_FACTOR - 0.02, p.freshness - rate);
}

/**
 * 鼓手敲下一个鼓点（每个鼓点只调度一次）。
 * 划手根据自身反应均值、抖动、技术误差决定本拍入水延迟；
 * 体力下降会进一步拉长反应；周期短于生理极限则漏拍。
 * 若上一桨回桨尚未结束（赶拍），先结算上一桨再开始新周期。
 */
export function scheduleStroke(p: PaddlerState, drummer: DrummerState, rng: Rng): void {
  const idealPeriod = 60 / drummer.currentSpm;
  const pullDur = idealPeriod * PULL_FRACTION;
  const minPeriod = Math.max(MIN_STROKE_PERIOD, pullDur + 0.12);

  if (p.phase === 'drive') {
    // 拉桨中收到新鼓点：生理上做不到，漏拍并继续完成当前拉桨
    p.missed++;
    return;
  }

  if (idealPeriod < MIN_STROKE_PERIOD) {
    p.missed++;
    return;
  }

  // 赶拍：上一桨回桨未做完就被新鼓点追上，先把上一桨结算掉
  if (p.phase === 'recover') {
    finishStroke(p);
  }

  // 鼓手收拢效应：把个体反应均值向全队锚点压缩，模拟好鼓点统一全船节奏
  const c = drummer.cohesion;
  const anchoredReaction = p.spec.reactionMean * (1 - c) + drummer.reactionAnchor * c;
  const anchoredJitter = p.spec.reactionJitter * (1 - c * 0.7);
  const anchoredTechnique = p.spec.technique * (1 - c * 0.7);

  const delay = Math.max(
    0.02,
    anchoredReaction +
      rng.gauss(0, anchoredJitter) +
      rng.gauss(0, anchoredTechnique) +
      fatigueLag(p),
  );

  const effectivePeriod = Math.max(idealPeriod * (1 + fatigueLag(p) * 0.9), minPeriod);

  p.strokePeriod = effectivePeriod;
  p.pullDuration = pullDur;
  p.catchOffset = delay;
  p.powerFactor = p.spec.strength * (MIN_POWER_FACTOR + (1 - MIN_POWER_FACTOR) * p.freshness);
  // cycleTime 负值 = 距入水的倒计时；0 = 入水时刻
  p.phase = 'wait';
  p.cycleTime = -delay;
}

export interface StrokeStepResult {
  /** 本 tick 是否发生入水（用于全队同步统计） */
  caught: boolean;
  /** 本 tick 的时间平均桨力 N（船体系纵向，tick 内解析积分） */
  force: number;
  /** 本 tick 是否完成一次完整划桨（用于体力结算） */
  completed: boolean;
  /** 入水时对应的鼓点批次号 */
  beatId: number;
}

/** 半正弦力 F(t)=Fpk·sin(π·t/pull) 在 [a,b] 区间对时间的积分，clamp 到拉桨区间内 */
function sineIntegral(a: number, b: number, pull: number, fpk: number): number {
  const lo = Math.max(0, a);
  const hi = Math.min(pull, b);
  if (hi <= lo) return 0;
  const k = Math.PI / pull;
  // ∿sin(k t)dt 的原函数 = -cos(k t)/k
  return (fpk / k) * (Math.cos(k * lo) - Math.cos(k * hi));
}

/**
 * 推进单个划手 dt。
 * 时间线：cycleTime ∈ [-catchOffset, 0) 等待入水；[0, pullDuration) 拉桨；[pullDuration, period) 回桨。
 * 桨力采用 tick 内解析积分后取时间平均，消除 120Hz 离散点采样的系统偏差。
 */
export function stepPaddler(p: PaddlerState, dt: number, beatId: number): StrokeStepResult {
  const result: StrokeStepResult = { caught: false, force: 0, completed: false, beatId: -1 };
  const prev = p.cycleTime;
  const next = prev + dt;
  p.cycleTime = next;

  if (p.phase === 'wait') {
    if (prev < 0 && next >= 0) {
      p.phase = 'drive';
      result.caught = true;
      result.beatId = beatId;
      p.lastCatchBeat = beatId;
    } else if (next < 0) {
      p.instantForce = 0;
      return result;
    }
  }

  if (p.phase === 'drive') {
    // 峰值力与拉桨时长挂钩：快速划桨时每桨拉水距离短、峰值略低，
    // 但桨频升高带来的单位时间冲量增益仍占主导（慢桨蓄力、快桨走频）
    const rateFactor = Math.sqrt((60 / 80) / p.strokePeriod);
    const fpk = PADDLE_F_MAX * p.powerFactor * Math.min(1.15, Math.max(0.78, rateFactor));
    // 本 tick 与拉桨区间的交集做解析积分
    const integral = sineIntegral(Math.max(prev, 0), next, p.pullDuration, fpk);
    result.force = integral / dt;
    // instantForce 记录 tick 末端的瞬时值供渲染/左右舷力矩使用
    const tNow = Math.min(Math.max(next, 0), p.pullDuration);
    p.instantForce = fpk * Math.sin(Math.PI * (tNow / p.pullDuration));
    if (next >= p.pullDuration) {
      p.phase = 'recover';
    }
  }

  if (p.phase === 'recover') {
    p.instantForce = 0;
    if (next >= p.strokePeriod) {
      finishStroke(p);
      result.completed = true;
      p.phase = 'wait';
    }
  }

  return result;
}

/** 训练/比赛间缓慢恢复体力 */
export function recoverPaddler(p: PaddlerState, amount: number): void {
  p.freshness = Math.min(1, p.freshness + amount);
}
