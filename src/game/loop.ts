import { DT, PHYS_HZ } from '../physics/constants.js';
import { RaceWorld } from '../physics/race.js';
import type { RaceResult } from '../physics/types.js';
import { RaceRenderer } from '../render/RaceRenderer.js';

export interface RaceHud {
  time: number;
  rank: number;
  total: number;
  spm: number;
  sync: number;
  sigma: number;
  freshness: number;
  distance: number;
  totalLength: number;
  speed: number;
  beatFlash: number; // 0..1 鼓点闪光
  finished: boolean;
}

export interface RaceCallbacks {
  onHud: (hud: RaceHud) => void;
  onFinish: (result: RaceResult) => void;
}

/**
 * 固定步长主循环：物理严格 120Hz，渲染跟随显示器刷新率。
 * 累加器保证物理确定性，渲染用上一状态与当前状态线性插值。
 */
export class GameLoop {
  private rafId = 0;
  private lastTs = 0;
  private accumulator = 0;
  private running = false;
  private beatFlash = 0;
  private lastBeats = 0;

  constructor(
    private world: RaceWorld,
    private renderer: RaceRenderer,
    private cb: RaceCallbacks,
  ) {}

  start(): void {
    this.running = true;
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (!this.running) return;
      const frameMs = Math.min(100, ts - this.lastTs);
      this.lastTs = ts;
      this.accumulator += frameMs / 1000;

      // 固定步长推进物理
      let steps = 0;
      while (this.accumulator >= DT && steps < 8) {
        this.world.step();
        this.accumulator -= DT;
        steps++;
      }
      if (steps === 8) this.accumulator = 0; // 掉帧保护，避免螺旋追赶

      const player = this.world.boats.find((b) => b.config.isPlayer);
      this.renderer.render(this.world.boats, this.world.flow.river, this.world.time, player);

      // 鼓点闪光衰减
      if (player && player.drummer.beats !== this.lastBeats) {
        this.lastBeats = player.drummer.beats;
        this.beatFlash = 1;
      }
      this.beatFlash = Math.max(0, this.beatFlash - frameMs / 250);

      const ranking = this.world.rankings();
      const rank = player ? ranking.indexOf(player) + 1 : 0;
      this.cb.onHud({
        time: this.world.time,
        rank,
        total: this.world.boats.length,
        spm: player?.drummer.currentSpm ?? 0,
        sync: player?.lastSyncEfficiency ?? 1,
        sigma: player?.lastSyncSigma ?? 0,
        freshness: player?.avgFreshness ?? 1,
        distance: player?.distance ?? 0,
        totalLength: this.world.flow.river.length,
        speed: player?.u ?? 0,
        beatFlash: this.beatFlash,
        finished: this.world.finished,
      });

      if (this.world.finished) {
        this.running = false;
        this.cb.onFinish(this.world.buildResult());
        return;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get elapsed(): number {
    return this.world.time;
  }
}

export { PHYS_HZ };
