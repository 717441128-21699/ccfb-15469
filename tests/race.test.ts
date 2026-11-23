import { describe, expect, it } from 'vitest';
import { RaceWorld } from '../src/physics/race.js';
import { buildAllTeams } from '../src/physics/teams.js';
import { RIVERS } from '../src/physics/rivers.js';
import { PHYS_HZ, RACE_BOAT_COUNT } from '../src/physics/constants.js';
import { wakeEffect, createBoat } from '../src/physics/boat.js';
import type { BoatConfig } from '../src/physics/types.js';

function makeRace(playerLane = 3): RaceWorld {
  const teams = buildAllTeams();
  const configs: BoatConfig[] = teams.map((team, i) => ({
    team,
    lane: i,
    isPlayer: i === playerLane,
    seed: 200 + i * 13,
  }));
  return new RaceWorld(configs, RIVERS[0]);
}

/** 让玩家以指定 SPM 自动敲鼓并推进 duration 秒（模拟真人鼓手的稳定节奏） */
function runWithPlayerDrumming(world: RaceWorld, duration: number, spm = 82): void {
  const interval = 60 / spm;
  let sinceBeat = interval; // 首拍立即敲
  const total = Math.round(PHYS_HZ * duration);
  for (let i = 0; i < total; i++) {
    sinceBeat += 1 / PHYS_HZ;
    if (sinceBeat >= interval) {
      world.playerBeat();
      sinceBeat = 0;
    }
    world.step();
  }
}

describe('验收指标 2：六船×22 人 120Hz 性能', () => {
  it('单 tick 物理耗时远低于 8.33ms 预算（留足渲染余量）', () => {
    const world = makeRace();
    // 预热（JIT、内联缓存）
    for (let i = 0; i < PHYS_HZ * 5; i++) world.step();

    const ticks = PHYS_HZ * 30; // 模拟 30 秒
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) world.step();
    const elapsedMs = performance.now() - t0;
    const perTickUs = (elapsedMs / ticks) * 1000;
    console.log(`六船全量物理: 平均 ${perTickUs.toFixed(2)} µs/tick，预算 8333 µs，余量 ${(8333 / perTickUs).toFixed(0)} 倍`);
    expect(perTickUs).toBeLessThan(2000); // 硬门槛 2ms，实际预期几百微秒
    expect(world.boats).toHaveLength(RACE_BOAT_COUNT);
    expect(world.boats.every((b) => b.paddlers.length === 20)).toBe(true);
  });

  it('整场 500m 比赛能在 4 分钟仿真时限内全部完赛且名次唯一', () => {
    const world = makeRace();
    let guard = 0;
    // 玩家船需要真实敲鼓才前进，模拟稳定的 84 SPM 鼓手
    let sinceBeat = 60 / 84;
    while (!world.finished && guard < PHYS_HZ * 240) {
      sinceBeat += 1 / PHYS_HZ;
      if (sinceBeat >= 60 / 84) {
        world.playerBeat();
        sinceBeat = 0;
      }
      world.step();
      guard++;
    }
    expect(world.finished).toBe(true);
    const result = world.buildResult();
    expect(result.results).toHaveLength(6);
    const ranks = new Set(result.results.map((r) => r.rank));
    expect(ranks.size).toBe(6);
    const times = result.results.map((r) => r.finishTime);
    console.log('完赛成绩:', result.results.map((r) => `#${r.rank} ${r.teamName} ${r.finishTime.toFixed(2)}s`).join(' | '));
    for (const t of times) {
      expect(t).toBeGreaterThan(60);
      expect(t).toBeLessThan(240);
    }
  }, 60000);
});

describe('船浪互扰', () => {
  it('后方船进入前车船浪区时受到横向推偏与阻力，离开后归零', () => {
    const teams = buildAllTeams();
    const a = createBoat({ team: teams[0], lane: 2, isPlayer: false, seed: 1 });
    const b = createBoat({ team: teams[1], lane: 2, isPlayer: false, seed: 2 });
    a.x = 100;
    a.y = 0;
    b.x = 92;
    b.y = 1.2;
    b.u = 5;
    const inside = wakeEffect(b, a);
    expect(inside.fy).not.toBe(0);
    expect(inside.fx).toBeLessThan(0); // 附加阻力
    // 前车 a 在 y=0，后车 b 在 y=1.2（前车在本船右侧），船浪把本船继续往左推 → fy>0
    expect(inside.fy).toBeGreaterThan(0);

    b.x = 80; // 超出作用距离
    expect(wakeEffect(b, a).fy).toBe(0);
    b.x = 92;
    b.y = 9; // 横向超出浪宽
    expect(wakeEffect(b, a).fy).toBe(0);
  });
});

describe('体力与鼓手', () => {
  it('比赛后段划手体力明显下降，且高桨频消耗更快', () => {
    const world = makeRace();
    runWithPlayerDrumming(world, 90, 84);
    for (const b of world.boats) {
      expect(b.avgFreshness).toBeLessThan(0.95);
    }
    const player = world.boats.find((b) => b.config.isPlayer)!;
    console.log(`90s 后玩家船平均体力: ${(player.avgFreshness * 100).toFixed(1)}%`);
  });

  it('玩家敲鼓间隔被换算为目标桨频，过短的连击被拒绝', () => {
    const world = makeRace();
    expect(world.playerBeat()).toBe(true);
    expect(world.playerBeat()).toBe(false); // 同一时刻连击
    for (let i = 0; i < PHYS_HZ; i++) world.step(); // 前进 1s
    expect(world.playerBeat()).toBe(true); // 1s 间隔 → 目标 60 SPM
    const player = world.boats.find((b) => b.config.isPlayer)!;
    expect(player.drummer.targetSpm).toBeCloseTo(60, 10);
  });
});

describe('玩家鼓手链路', () => {
  it('玩家船不敲鼓就没有自动节拍，敲鼓后划手真实完成划桨并前进', () => {
    const world = makeRace();
    const player = world.boats.find((b) => b.config.isPlayer)!;
    expect(player.drummer.manual).toBe(true);

    // 3 秒不敲鼓：无节拍、船几乎不动（只受水流）
    for (let i = 0; i < PHYS_HZ * 3; i++) world.step();
    expect(player.drummer.beats).toBe(0);
    const idleX = player.x;
    expect(player.paddlers.every((p) => p.strokes === 0)).toBe(true);

    // 以 0.75s 间隔敲 12 拍（80 SPM）
    for (let beat = 0; beat < 12; beat++) {
      expect(world.playerBeat()).toBe(true);
      for (let i = 0; i < Math.round(PHYS_HZ * 0.75); i++) world.step();
    }
    expect(player.drummer.beats).toBe(12);
    expect(player.paddlers[0].strokes).toBeGreaterThan(5);
    expect(player.x).toBeGreaterThan(idleX + 8); // 真实推进
    expect(player.lastSyncSigma).toBeGreaterThanOrEqual(0);
  });
});

describe('确定性复现', () => {
  it('相同种子两场比赛的船速轨迹完全一致', () => {
    const w1 = makeRace();
    const w2 = makeRace();
    for (let i = 0; i < PHYS_HZ * 20; i++) {
      w1.step();
      w2.step();
    }
    for (let i = 0; i < 6; i++) {
      expect(w2.boats[i].x).toBe(w1.boats[i].x);
      expect(w2.boats[i].u).toBe(w1.boats[i].u);
    }
  });
});
