import { el, clear, bar } from './dom.js';
import { buildAllTeams } from '../physics/teams.js';
import type { SaveData } from '../game/storage.js';

interface TrainResult {
  score: number; // 0..1
  hits: number;
  total: number;
  avgErrorMs: number;
}

/**
 * 节奏训练：节拍器以固定 SPM 发声发光，玩家在判定窗口内敲鼓。
 * 命中误差越小、连击越高，结算的训练强度越大（训练降低全队技术误差与反应抖动）。
 */
export function renderTraining(
  root: HTMLElement,
  save: SaveData,
  teamId: string,
  onComplete: (gain: number) => void,
  onBack: () => void,
): void {
  clear(root);
  const team = buildAllTeams().find((t) => t.id === teamId)!;
  const currentTraining = save.training[teamId] ?? 0;

  const state = {
    running: false,
    spm: 76,
    beats: 0,
    targetBeats: 24,
    nextBeatAt: 0,
    interval: 60 / 76,
    errors: [] as number[],
    hits: 0,
    raf: 0,
    pulse: false,
  };

  const dot = el('div', { class: 'metronome-dot' });
  const drum = el('div', { class: 'training-drum', text: '敲！' });
  const info = el('div', { class: 'center-text muted' }, [el('div', { text: '空格 / 点击鼓面，在闪光瞬间敲下' })]);
  const progressBar = bar(0, 'gold');
  const resultBox = el('div', { class: 'center-text mt' });
  const spmGroup = el('div', { class: 'radio-group', style: 'justify-content:center' },
    [64, 76, 88, 100].map((spm) => el('button', { class: `btn ${spm === 76 ? 'active' : ''}`, text: `${spm} SPM` })),
  );

  function setSpm(spm: number) {
    state.spm = spm;
    state.interval = 60 / spm;
    spmGroup.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', [64, 76, 88, 100][i] === spm));
  }
  spmGroup.querySelectorAll('button').forEach((b, i) => {
    b.onclick = () => setSpm([64, 76, 88, 100][i]);
  });

  function tick(ts: number) {
    if (!state.running) return;
    if (ts >= state.nextBeatAt) {
      state.beats++;
      state.nextBeatAt = ts + state.interval * 1000;
      state.pulse = true;
      dot.classList.add('pulse');
      setTimeout(() => { dot.classList.remove('pulse'); state.pulse = false; }, 120);
      progressBar.querySelector('i')!.setAttribute('style', `width:${(state.beats / state.targetBeats) * 100}%`);
      if (state.beats > state.targetBeats) return finish();
    }
    state.raf = requestAnimationFrame(tick);
  }

  function hit() {
    if (!state.running) return;
    drum.classList.add('hit');
    setTimeout(() => drum.classList.remove('hit'), 90);
    const now = performance.now();
    const errorSec = Math.abs(now - state.nextBeatAt + state.interval * 1000) / 1000;
    // 与最近一拍的误差
    const toCurrent = Math.abs(now - (state.nextBeatAt - state.interval * 1000));
    const toNext = Math.abs(now - state.nextBeatAt);
    const errMs = Math.min(toCurrent, toNext);
    state.errors.push(errMs);
    if (errMs < 180) state.hits++;
    info.textContent = `第 ${state.errors.length} 拍 · 误差 ${errMs.toFixed(0)} ms ${errMs < 90 ? '✓ 精准' : errMs < 180 ? '~ 良好' : '✗ 偏离'}`;
  }

  function finish() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    const avgErr = state.errors.length ? state.errors.reduce((a, b) => a + b, 0) / state.errors.length : 999;
    const accuracy = Math.max(0, 1 - avgErr / 250);
    const hitRate = state.hits / Math.max(1, state.errors.length);
    const score = Math.round(accuracy * hitRate * 100);
    const gain = Math.min(0.15, (accuracy * hitRate * 0.12));
    const result: TrainResult = { score: accuracy * hitRate, hits: state.hits, total: state.errors.length, avgErrorMs: avgErr };
    resultBox.innerHTML = '';
    resultBox.append(
      el('h2', { text: `训练评分 ${score} 分` }),
      el('div', { class: 'muted', text: `命中 ${result.hits}/${result.total} 拍 · 平均误差 ${result.avgErrorMs.toFixed(0)} ms` }),
      el('div', { class: 'mt', style: 'color:var(--gold)', text: `全队技术误差与反应抖动下降，训练强度 +${(gain * 100).toFixed(1)}%` }),
      el('button', { class: 'btn primary mt', text: '保存训练成果' }, []),
    );
    (resultBox.querySelector('button') as HTMLElement).onclick = () => onComplete(gain);
  }

  function start() {
    state.running = true;
    state.beats = 0;
    state.errors = [];
    state.hits = 0;
    state.nextBeatAt = performance.now() + 1200;
    resultBox.innerHTML = '';
    info.textContent = '准备……听鼓点！';
    state.raf = requestAnimationFrame(tick);
  }

  drum.onclick = hit;
  const keyHandler = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); hit(); } };
  window.addEventListener('keydown', keyHandler);

  const startBtn = el('button', { class: 'btn primary', text: '开始训练' }, []);
  startBtn.onclick = start;

  root.append(
    el('div', { class: 'topbar' }, [
      el('h2', { text: `节奏训练 · ${team.name}` }),
      el('button', { class: 'btn ghost', text: '← 返回' }, []),
    ]),
    el('div', { class: 'card', style: 'max-width:640px;margin:0 auto;width:100%' }, [
      el('div', { class: 'stat-row' }, [el('span', { text: '当前训练强度' }), el('b', { text: `${Math.round(currentTraining * 100)}%` })]),
      bar(currentTraining, 'gold'),
      el('div', { class: 'section-title center-text', text: '选择训练桨频' }),
      spmGroup,
      dot,
      drum,
      progressBar,
      info,
      el('div', { style: 'display:flex;gap:12px;justify-content:center;margin-top:14px' }, [startBtn]),
      resultBox,
    ]),
  );
  (root.querySelector('.ghost') as HTMLElement).onclick = () => {
    state.running = false;
    cancelAnimationFrame(state.raf);
    window.removeEventListener('keydown', keyHandler);
    onBack();
  };
}
