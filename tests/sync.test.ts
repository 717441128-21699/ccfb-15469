import { describe, expect, it } from 'vitest';
import { analyticalEquilibriumSpeed, createBoat, stepBoat } from '../src/physics/boat.js';
import { Rng } from '../src/physics/rng.js';
import { FlowField } from '../src/physics/flow.js';
import { RIVERS } from '../src/physics/rivers.js';
import { buildAllTeams } from '../src/physics/teams.js';
import { DT, PADDLER_COUNT, SYNERGY_BONUS } from '../src/physics/constants.js';
import type { BoatConfig, BoatRuntime, TeamSpec } from '../src/physics/types.js';

const STILL_WATER = { ...RIVERS[0], baseFlow: 0, meanderAmplitude: 0, turbulence: 0, adverseZones: [] };

/**
 * 零误差 + 满体力队伍：反应均值/技术误差全统一，stamina=1.35 使每桨疲劳消耗恰好为 0，
 * 从而在整个对照实验中 powerFactor 恒为 1，隔离“同步度”这一个变量。
 */
function perfectTeam(base: TeamSpec): TeamSpec {
  return {
    ...base,
    paddlers: base.paddlers.map((p) => ({
      ...p,
      reactionMean: 0.15,
      reactionJitter: 0,
      technique: 0,
      strength: 1,
      stamina: 1.35,
    })),
  };
}

function makeConfig(team: TeamSpec, seed = 42, lane = 2, manual = false): BoatConfig {
  // manual=false：AI 自动鼓手（SPM 由测试通过 targetSpm 指定），用于受控物理对照
  return { team, lane, isPlayer: manual, seed };
}

function runOpenWater(boat: BoatRuntime, ticks: number, spm = 80, seed = 7): number {
  const flow = new FlowField(STILL_WATER);
  const rng = new Rng(seed);
  // 返回末段 10 秒的时间平均船速，避免单 tick 末点落在划桨周期不同相位造成的采样偏差
  const warmup = Math.max(0, ticks - 120 * 10);
  let sumU = 0;
  let cnt = 0;
  for (let i = 0; i < ticks; i++) {
    // AI 规划器会按赛程改 SPM；受控实验直接钉住目标桨频
    boat.drummer.targetSpm = spm;
    boat.drummer.currentSpm = spm;
    stepBoat(boat, { dt: DT, time: i * DT, raceLength: 100000, flow, others: [], helmInput: null }, rng);
    if (i >= warmup) {
      sumU += boat.u;
      cnt++;
    }
  }
  return sumU / cnt;
}

describe('验收指标 1：同步度决定船速', () => {
  it('全队完全同步时，仿真稳态速度与推力减阻力解析平衡速度相差不超过 3%', () => {
    const team = perfectTeam(buildAllTeams()[0]);
    const boat = createBoat(makeConfig(team));
    const period = 60 / 80;
    const simMeanSpeed = runOpenWater(boat, 120 * 60, 80);

    // 无疲劳、满力量；完美同步 σ=0 时仿真的同步效率 = 1 + 协同增益，解析基准采用同一效率
    const expectedSync = 1 + SYNERGY_BONUS;
    const analytic = analyticalEquilibriumSpeed(1, period, expectedSync);
    const err = Math.abs(simMeanSpeed - analytic) / analytic;

    console.log(`完全同步(η=${boat.lastSyncEfficiency.toFixed(3)}): 仿真时间平均=${simMeanSpeed.toFixed(4)} m/s, 解析=${analytic.toFixed(4)} m/s, 偏差=${(err * 100).toFixed(2)}%`);
    expect(boat.avgFreshness).toBe(1);
    expect(boat.lastSyncSigma).toBeLessThan(1e-9);
    expect(err).toBeLessThanOrEqual(0.03);
  });

  it('划水下桨时间离散程度越大，船速越低（严格单调，确定性相位偏移）', () => {
    const base = perfectTeam(buildAllTeams()[1]);
    // 用确定的反应均值差异制造入水离散，零随机噪声，避免抽样误差混淆
    const spreads = [0, 0.04, 0.1, 0.18];
    const speeds: number[] = [];
    const measuredSigmas: number[] = [];
    for (const spread of spreads) {
      const team: TeamSpec = {
        ...base,
        // 鼓手稳定性设为 0 以关闭节奏收拢，让入水离散完全来自划手个体差异
        drummer: { ...base.drummer, stability: 0 },
        paddlers: base.paddlers.map((p, i) => ({
          ...p,
          reactionMean: 0.15 + (i % 5) * spread * 0.25 - spread * 0.5,
          reactionJitter: 0,
          technique: 0,
        })),
      };
      const boat = createBoat(makeConfig(team, 999));
      const meanSpeed = runOpenWater(boat, 120 * 45, 80, 7);
      speeds.push(meanSpeed);
      measuredSigmas.push(boat.lastSyncSigma);
    }
    console.log(
      '离散度→稳态速度:',
      spreads.map((s, i) => `spread=${s}s(σ实测=${measuredSigmas[i].toFixed(3)}) → ${speeds[i].toFixed(3)}m/s`).join(' | '),
    );
    for (let i = 1; i < speeds.length; i++) {
      expect(measuredSigmas[i]).toBeGreaterThan(measuredSigmas[i - 1]);
      expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    }
    expect(speeds[0] - speeds[speeds.length - 1]).toBeGreaterThan(speeds[0] * 0.08);
  });

  it('左右舷发力不平衡会产生持续偏航', () => {
    const team = perfectTeam(buildAllTeams()[0]);
    const weakened: TeamSpec = {
      ...team,
      paddlers: team.paddlers.map((p) => (p.side === 'port' ? { ...p, strength: 0.5 } : p)),
    };
    const boat = createBoat(makeConfig(weakened));
    runOpenWater(boat, 120 * 20, 80);
    expect(boat.heading).not.toBe(0);
    expect(Math.abs(boat.heading)).toBeGreaterThan(0.02);
  });

  it('船速越快水阻力越大：稳态推力随 SPM 上升，但船速呈边际递减', () => {
    const team = perfectTeam(buildAllTeams()[0]);
    const observations: { spm: number; meanU: number }[] = [];
    for (const spm of [60, 75, 90, 110]) {
      const boat = createBoat(makeConfig(team, spm));
      const meanU = runOpenWater(boat, 120 * 40, spm, 11);
      observations.push({ spm, meanU });
    }
    console.log(observations.map((o) => `SPM=${o.spm} → ${o.meanU.toFixed(3)}m/s`).join(' | '));
    for (let i = 1; i < observations.length; i++) {
      expect(observations[i].meanU).toBeGreaterThan(observations[i - 1].meanU);
    }
    // SPM 从 60→110 接近翻倍，船速增量远小于线性（二次阻力 + 赶拍）
    const ratio = observations[3].meanU / observations[0].meanU;
    expect(ratio).toBeLessThan(1.45);
  });
});
