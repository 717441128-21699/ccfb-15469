/** 极简 DOM 构建辅助（支持 HTML 与 SVG 标签） */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K];
export function el(tag: string, attrs?: Record<string, string>, children?: (Node | string)[]): SVGElement;
export function el(
  tag: string,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): Element {
  const isSvg = ['svg', 'line', 'text', 'path', 'circle', 'rect', 'g', 'polyline'].includes(tag);
  const node = isSvg
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.setAttribute('class', v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.innerHTML = '';
}

export function bar(value: number, cls = ''): HTMLElement {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return el('div', { class: `bar ${cls}` }, [el('i', { style: `width:${pct}%` })]);
}

export function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}
