/**
 * 带种子的确定性随机数：mulberry32 + Box-Muller 高斯。
 * 每条船一个独立 RNG，保证整场比赛可复现、单元测试可断言。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** [0,1) 均匀分布 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 高斯分布 N(mu, sigma²) */
  gauss(mu = 0, sigma = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
