import { el, clear, bar, rgb, fmtTime } from './dom.js';
import type { RaceHud } from '../game/loop.js';
import type { BoatRuntime, RiverSpec } from '../physics/types.js';

export class Hud {
  private timeEl: HTMLElement;
  private rankEl: HTMLElement;
  private spmEl: HTMLElement;
  private syncEl: HTMLElement;
  private syncBar: HTMLElement;
  private freshBar: HTMLElement;
  private distBar: HTMLElement;
  private speedEl: HTMLElement;
  private sigmaEl: HTMLElement;
  private beatRing: HTMLElement;
  private leaderboard: HTMLElement;
  private hint: HTMLElement;
  private toastEl: HTMLElement | null = null;

  constructor(private root: HTMLElement, private boats: BoatRuntime[], private river: RiverSpec) {
    clear(root);
    this.timeEl = el('div', { class: 'hud-big', text: '0:00.00' });
    this.rankEl = el('div', { class: 'hud-big', text: '1/6' });
    this.spmEl = el('div', { class: 'hud-big', text: '—' });
    this.syncEl = el('b', { text: '100%' });
    this.sigmaEl = el('span', { class: 'muted', text: 'σ 0ms' });
    this.speedEl = el('b', { text: '0.0 m/s' });
    this.syncBar = bar(1, 'gold').querySelector('i') as HTMLElement;
    this.freshBar = bar(1).querySelector('i') as HTMLElement;
    this.distBar = bar(0).querySelector('i') as HTMLElement;
    this.beatRing = el('div', { id: 'beat-ring', text: '敲鼓' });
    this.leaderboard = el('div', {});
    this.hint = el('div', {
      style: 'position:absolute;top:38%;left:50%;transform:translateX(-50%);background:rgba(232,184,75,.92);color:#1a1206;padding:14px 26px;border-radius:12px;font-size:18px;font-weight:700;text-align:center;line-height:1.6',
      text: '你是鼓手！敲下第一鼓，整条船才会动\n空格 / 点击鼓面 / 触屏',
    });

    root.append(
      el('div', { class: 'hud-top' }, [
        el('div', { class: 'hud-panel' }, [el('div', { class: 'hud-label', text: '比赛时间' }), this.timeEl]),
        el('div', { class: 'hud-panel center-text' }, [el('div', { class: 'hud-label', text: '当前名次' }), this.rankEl]),
        el('div', { class: 'hud-panel leaderboard' }, [el('div', { class: 'hud-label mb', text: '实时排名' }), this.leaderboard]),
      ]),
      this.hint,
      this.beatRing,
      el('div', { class: 'hud-bottom' }, [
        el('div', { class: 'hud-panel mini-bars' }, [
          el('div', {}, [el('div', { class: 'stat-row' }, [el('span', { text: '同步效率' }), this.syncEl]), this.syncBar.parentElement!]),
          el('div', { class: 'stat-row' }, [el('span', { text: '入水离散度' }), this.sigmaEl]),
          el('div', {}, [el('div', { class: 'stat-row' }, [el('span', { text: '全队体力' }), el('b', { text: '' })]), this.freshBar.parentElement!]),
          el('div', {}, [el('div', { class: 'stat-row' }, [el('span', { text: '赛程进度' }), this.speedEl]), this.distBar.parentElement!]),
        ]),
        el('div', { class: 'hud-panel' }, [el('div', { class: 'hud-label', text: '当前桨频' }), this.spmEl, el('div', { class: 'muted', style: 'font-size:11px', text: '空格/点击敲鼓 · ↑↓ 微调' })]),
        el('div', { class: 'helm-controls' }, [
          el('button', { class: 'btn', id: 'helm-left', text: '◀ 左舵' }),
          el('button', { class: 'btn', id: 'helm-right', text: '右舵 ▶' }),
        ]),
      ]),
    );
  }

  get beatButton(): HTMLElement {
    return this.beatRing;
  }

  helmButtons(): { left: HTMLElement; right: HTMLElement } {
    return {
      left: this.root.querySelector('#helm-left') as HTMLElement,
      right: this.root.querySelector('#helm-right') as HTMLElement,
    };
  }

  toast(msg: string): void {
    this.toastEl?.remove();
    this.toastEl = el('div', { class: 'toast', text: msg });
    this.root.append(this.toastEl);
    setTimeout(() => this.toastEl?.remove(), 2200);
  }

  update(hud: RaceHud, playerBeats: number): void {
    this.timeEl.textContent = fmtTime(hud.time);
    // 玩家敲出第一鼓后隐藏引导
    this.hint.hidden = playerBeats > 0;
    this.rankEl.textContent = `${hud.rank}/${hud.total}`;
    this.spmEl.textContent = `${hud.spm.toFixed(0)}`;
    this.syncEl.textContent = `${Math.round(hud.sync * 100)}%`;
    this.sigmaEl.textContent = `σ ${(hud.sigma * 1000).toFixed(0)}ms`;
    this.speedEl.textContent = `${hud.speed.toFixed(1)} m/s · ${Math.round((hud.distance / hud.totalLength) * 100)}%`;
    this.syncBar.setAttribute('style', `width:${hud.sync * 100}%`);
    this.freshBar.setAttribute('style', `width:${hud.freshness * 100}%`);
    this.distBar.setAttribute('style', `width:${(hud.distance / hud.totalLength) * 100}%`);
    this.beatRing.classList.toggle('flash', hud.beatFlash > 0.6);

    // 排名
    const ranked = [...this.boats].sort((a, b) => b.x - a.x);
    this.leaderboard.innerHTML = '';
    ranked.forEach((b, i) => {
      const dot = el('span', { class: 'lb-dot', style: `background:${rgb(b.config.team.colors.hull)}` });
      const row = el('div', { class: `lb-row ${b.config.isPlayer ? 'me' : ''}` }, [
        el('span', {}, [dot, `${i + 1}. ${b.config.team.name}`]),
        el('span', { text: b.finishTime ? fmtTime(b.finishTime) : `${b.x.toFixed(0)}m` }),
      ]);
      this.leaderboard.append(row);
    });
  }
}
