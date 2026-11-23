import type { RaceWorld } from '../physics/race.js';

/**
 * 输入映射：
 * - 空格 / 鼠标左键 / 触屏：敲鼓（玩家当鼓手定节奏）
 * - A/D 或 ←/→：打舵
 * - ↑/↓：微调目标桨频（自动鼓手辅助）
 */
export class InputController {
  private helm = 0;
  private disposed: (() => void)[] = [];

  constructor(
    private world: RaceWorld,
    private canvas: HTMLCanvasElement,
    private onBeat?: () => void,
  ) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.world.playerBeat()) this.onBeat?.();
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.helm = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.helm = 1;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.adjustSpm(4);
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.adjustSpm(-4);
      this.world.setHelmInput(this.helm);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && this.helm === -1) this.helm = 0;
      if ((e.code === 'ArrowRight' || e.code === 'KeyD') && this.helm === 1) this.helm = 0;
      this.world.setHelmInput(this.helm);
    };
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (this.world.playerBeat()) this.onBeat?.();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointer);
    this.disposed.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointer);
    });
  }

  private adjustSpm(delta: number): void {
    const player = this.world.boats.find((b) => b.config.isPlayer);
    if (!player) return;
    const d = player.drummer;
    d.targetSpm = Math.min(132, Math.max(48, d.targetSpm + delta));
  }

  dispose(): void {
    this.disposed.forEach((fn) => fn());
  }
}
