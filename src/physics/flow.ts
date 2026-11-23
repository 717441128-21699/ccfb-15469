import type { FlowSample, RiverSpec } from './types.js';
import { Rng } from './rng.js';

/**
 * 河道水流场。
 * - 纵向：基础顺流 + 弯道回水（逆流区）
 * - 横向：正弦摆动的主流线 + 低频湍流
 * 同一条船用固定种子做湍流，保证可复现；不同船种子不同。
 */
export class FlowField {
  readonly river: RiverSpec;

  constructor(river: RiverSpec) {
    this.river = river;
  }

  sample(x: number, y: number, rng: Rng): FlowSample {
    const r = this.river;
    // 主流线横向摆动：沿 x 正弦变化
    const centerline = r.meanderAmplitude * Math.sin((2 * Math.PI * x) / r.meanderWavelength);
    // 横向流速近似为主流线的“坡度”
    const slope =
      r.meanderAmplitude * (2 * Math.PI / r.meanderWavelength) * Math.cos((2 * Math.PI * x) / r.meanderWavelength);
    let vy = r.baseFlow * slope;

    let vx = r.baseFlow;
    for (const zone of r.adverseZones) {
      if (x >= zone.x0 && x <= zone.x1) {
        const t = (x - zone.x0) / (zone.x1 - zone.x0);
        const envelope = Math.sin(Math.PI * t); // 区段两头平滑过渡
        // 逆流区中心在 laneBias 航道，横向 6m 内高斯衰减
        const zy = zone.laneBias * r.laneWidth;
        const lateral = Math.exp(-((y - zy) ** 2) / (2 * 3 * 3));
        vx -= zone.strength * envelope * lateral;
        // 回水把船往逆流区外推
        vy += zone.strength * 0.4 * envelope * Math.sign(y - zy || 1) * lateral;
      }
    }

    vx += rng.gauss(0, r.turbulence);
    vy += rng.gauss(0, r.turbulence * 0.6);
    return { vx, vy };
  }
}
