import { el } from './dom.js';

export interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
}

/** 轻量 SVG 折线图（无第三方依赖），自动归一化坐标 */
export function lineChart(series: Series[], opts: { yLabel?: string; xLabel?: string; height?: number } = {}): HTMLElement {
  const W = 1000;
  const H = opts.height ?? 200;
  const padL = 48;
  const padB = 30;
  const padT = 14;
  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const sx = (x: number) => padL + ((x - minX) / Math.max(1e-6, maxX - minX)) * (W - padL - 10);
  const sy = (y: number) => padT + (1 - (y - minY) / Math.max(1e-6, maxY - minY)) * (H - padT - padB);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}` });
  // 网格与 y 轴刻度
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * (H - padT - padB);
    const val = maxY - (i / 4) * (maxY - minY);
    svg.append(el('line', { x1: String(padL), y1: String(y), x2: String(W - 10), y2: String(y), stroke: 'rgba(255,255,255,0.08)', 'stroke-width': '1' }));
    const label = el('text', { x: String(padL - 6), y: String(y + 4), 'text-anchor': 'end', fill: '#8aa2b0', 'font-size': '12' }, [val.toFixed(2)]);
    svg.append(label);
  }
  // x 轴刻度
  for (let i = 0; i <= 5; i++) {
    const x = padL + (i / 5) * (W - padL - 10);
    const val = minX + (i / 5) * (maxX - minX);
    svg.append(el('text', { x: String(x), y: String(H - 8), 'text-anchor': 'middle', fill: '#8aa2b0', 'font-size': '12' }, [`${val.toFixed(0)}s`]));
  }

  for (const s of series) {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    svg.append(el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': '2.5', 'stroke-linejoin': 'round' }));
  }

  const legend = el('div', { class: 'muted', style: 'display:flex;gap:16px;margin-top:6px;justify-content:center' },
    series.map((s) => el('span', {}, [el('i', { style: `display:inline-block;width:12px;height:12px;background:${s.color};border-radius:3px;margin-right:5px` }), s.label])),
  );
  return el('div', {}, [svg, legend]);
}
