import { DT, PADDLER_COUNT, PHYS_HZ, RACE_BOAT_COUNT, TELEMETRY_HZ } from './constants.js';
import { Rng } from './rng.js';
import { FlowField } from './flow.js';
import { createBoat, schedulePlayerBeat, stepBoat } from './boat.js';
import type { BoatConfig, BoatRuntime, RaceResult, RaceResultEntry, RaceSnapshot, RiverSpec } from './types.js';

export class RaceWorld {
  readonly boats: BoatRuntime[];
  readonly flow: FlowField;
  time = 0;
  private readonly rngs: Rng[];
  private readonly telemetryEvery = PHYS_HZ / TELEMETRY_HZ;
  private tickCount = 0;
  private snapshots: RaceSnapshot[] = [];
  private syncSeries: RaceResult['playerSyncSeries'] = [];
  private syncAccum = { sigma: 0, sync: 0, spm: 0, n: 0 };
  finished = false;
  playerTeamId: string | null = null;

  constructor(configs: BoatConfig[], river: RiverSpec) {
    if (configs.length > RACE_BOAT_COUNT) throw new Error('最多六条船同赛');
    if (configs.some((c) => c.team.paddlers.length !== PADDLER_COUNT)) {
      throw new Error('每条船必须 20 名划手');
    }
    this.boats = configs.map(createBoat);
    this.flow = new FlowField(river);
    this.rngs = configs.map((c) => new Rng(c.seed ^ 0x51f15e));
    this.playerTeamId = configs.find((c) => c.isPlayer)?.team.id ?? null;
  }

  /** 玩家/外部输入：敲鼓。两次敲击间隔换算为目标桨频，过短连击被拒绝。每次有效敲击都是真实鼓点，会调度全船划手 */
  playerBeat(): boolean {
    const b = this.boats.find((x) => x.config.isPlayer);
    if (!b) return false;
    const d = b.drummer;
    d.manual = true;
    if (d.beats > 0) {
      const interval = this.time - d.lastBeatTime;
      if (interval < 60 / 132) return false;
      d.targetSpm = Math.min(132, Math.max(48, 60 / interval));
    }
    d.lastBeatTime = this.time;
    d.beats++;
    d.timeToBeat = 0;
    d.playerDriven = true;
    // 立即为全船划手调度这一拍（与 stepBoat 中 AI 鼓点走同一套 scheduleStroke）
    const idx = this.boats.indexOf(b);
    schedulePlayerBeat(b, this.rngs[idx]);
    return true;
  }

  private helmInput: number | null = 0;
  setHelmInput(v: number | null): void {
    this.helmInput = v === null ? null : Math.max(-1, Math.min(1, v));
  }

  /** 推进一个物理步（1/120s） */
  step(): void {
    if (this.finished) return;
    for (let i = 0; i < this.boats.length; i++) {
      const others = this.boats.filter((_, j) => j !== i);
      const helm = this.boats[i].config.isPlayer ? this.helmInput : null;
      stepBoat(
        this.boats[i],
        { dt: DT, time: this.time, raceLength: this.flow.river.length, flow: this.flow, others, helmInput: helm },
        this.rngs[i],
      );
    }
    this.time += DT;
    this.tickCount++;
    this.recordTelemetry();

    if (this.boats.every((b) => b.finishTime !== null)) {
      this.finished = true;
    }
    // 安全上限：4 分钟
    if (this.time > 240) this.finished = true;
  }

  private recordTelemetry(): void {
    const player = this.boats.find((b) => b.config.isPlayer);
    if (player) {
      this.syncAccum.sigma += player.lastSyncSigma;
      this.syncAccum.sync += player.lastSyncEfficiency;
      this.syncAccum.spm += player.drummer.currentSpm;
      this.syncAccum.n++;
    }
    if (this.tickCount % this.telemetryEvery !== 0) return;
    this.snapshots.push({
      time: this.time,
      boats: this.boats.map((b) => ({
        teamId: b.config.team.id,
        x: b.x,
        u: b.u,
        heading: b.heading,
        rudder: b.rudder,
        spm: b.drummer.currentSpm,
        sigma: b.lastSyncSigma,
        sync: b.lastSyncEfficiency,
        freshness: b.avgFreshness,
        strokes: b.paddlers[0].strokes,
      })),
    });
    if (player && this.syncAccum.n > 0) {
      this.syncSeries.push({
        t: this.time,
        sigma: this.syncAccum.sigma / this.syncAccum.n,
        sync: this.syncAccum.sync / this.syncAccum.n,
        spm: this.syncAccum.spm / this.syncAccum.n,
      });
      this.syncAccum = { sigma: 0, sync: 0, spm: 0, n: 0 };
    }
  }

  /** 当前按距离排序的名次 */
  rankings(): BoatRuntime[] {
    return [...this.boats].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.x - a.x;
    });
  }

  buildResult(): RaceResult {
    const ranked = this.rankings();
    const results: RaceResultEntry[] = ranked.map((b, idx) => {
      const snaps = this.snapshots.filter((s) => s.boats.some((sb) => sb.teamId === b.config.team.id));
      const boatSnaps = snaps.map((s) => s.boats.find((sb) => sb.teamId === b.config.team.id)!);
      return {
        rank: idx + 1,
        teamId: b.config.team.id,
        teamName: b.config.team.name,
        finishTime: b.finishTime ?? this.time,
        avgSync: boatSnaps.length ? mean(boatSnaps.map((s) => s.sync)) : b.lastSyncEfficiency,
        avgSpm: boatSnaps.length ? mean(boatSnaps.map((s) => s.spm)) : b.drummer.currentSpm,
        minFreshness: boatSnaps.length ? Math.min(...boatSnaps.map((s) => s.freshness)) : b.avgFreshness,
        strokes: b.paddlers[0].strokes,
      };
    });
    return {
      riverId: this.flow.river.id,
      length: this.flow.river.length,
      results,
      snapshots: this.snapshots,
      playerSyncSeries: this.syncSeries,
      playerTeamId: this.playerTeamId,
    };
  }
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
