import { el, clear, bar, rgb, fmtTime } from './dom.js';
import type { SaveData } from '../game/storage.js';
import { RIVERS } from '../physics/rivers.js';
import { buildAllTeams } from '../physics/teams.js';
import type { TeamSpec } from '../physics/types.js';

export interface MenuChoices {
  teamId: string;
  riverId: string;
}

export function renderMenu(
  root: HTMLElement,
  save: SaveData,
  choices: MenuChoices,
  onNavigate: (screen: 'team' | 'train' | 'race') => void,
): void {
  clear(root);
  const teams = buildAllTeams();
  const selected = teams.find((t) => t.id === choices.teamId) ?? teams[0];
  const river = RIVERS.find((r) => r.id === choices.riverId) ?? RIVERS[0];

  const hero = el('div', { class: 'center-text', style: 'margin:30px 0 24px' }, [
    el('h1', { text: '鼓 点 龙 舟' }),
    el('div', { class: 'subtitle', text: '二十把桨齐不齐，全看鼓点稳不稳 —— 你来当鼓手' }),
  ]);

  const teamSummary = el('div', { class: 'card', style: 'max-width:680px;margin:0 auto 18px' }, [
    el('h3', { text: '当前队伍' }),
    el('div', { style: 'font-size:18px;margin:8px 0' }, [
      el('span', { class: 'swatch', style: `background:${rgb(selected.colors.hull)}` }),
      `${selected.name} · ${selected.city}`,
    ]),
    el('div', { class: 'muted', text: selected.motto }),
    el('div', { class: 'stat-row' }, [el('span', { text: '训练进度' }), el('b', { text: `${Math.round((save.training[selected.id] ?? 0) * 100)}%` })]),
    bar(save.training[selected.id] ?? 0, 'gold'),
    el('div', { class: 'stat-row' }, [el('span', { text: '历史最佳名次' }), el('b', { text: save.bestRank[selected.id] ? `第 ${save.bestRank[selected.id]} 名` : '暂无战绩' })]),
    el('div', { class: 'stat-row' }, [el('span', { text: '赛道' }), el('b', { text: river.name })]),
  ]);

  const buttons = el('div', { style: 'display:flex;gap:14px;justify-content:center;flex-wrap:wrap' }, [
    el('button', { class: 'btn', text: '队伍组建' }, []),
    el('button', { class: 'btn', text: '节奏训练' }, []),
    el('button', { class: 'btn primary', text: '开始比赛' }, []),
  ]);
  (buttons.children[0] as HTMLElement).onclick = () => onNavigate('team');
  (buttons.children[1] as HTMLElement).onclick = () => onNavigate('train');
  (buttons.children[2] as HTMLElement).onclick = () => onNavigate('race');

  const history = save.history.length
    ? el('div', { class: 'card', style: 'max-width:680px;margin:24px auto 0' }, [
        el('h3', { text: '最近战绩' }),
        ...save.history.slice(0, 5).flatMap((h) => {
          const mine = h.results.find((r) => r.teamId === save.selectedTeamId);
          if (!mine) return [];
          return [el('div', { class: 'stat-row' }, [
            el('span', { text: h.results.find((r) => r.teamId === mine.teamId)?.teamName ?? '' }),
            el('b', { text: `第 ${mine.rank} 名 · ${fmtTime(mine.finishTime)}` }),
          ])];
        }),
      ])
    : null;

  root.append(hero, teamSummary, buttons, history ?? '');
}

export function renderTeamScreen(
  root: HTMLElement,
  save: SaveData,
  choices: MenuChoices,
  onSelect: (teamId: string) => void,
  onBack: () => void,
): void {
  clear(root);
  const teams = buildAllTeams();
  const cards = el('div', { class: 'grid teams' }, teams.map((team) => teamCard(team, save, choices.teamId === team.id, () => onSelect(team.id))));
  root.append(
    el('div', { class: 'topbar' }, [el('h2', { text: '队伍组建 · 六支龙舟队' }), el('button', { class: 'btn ghost', text: '← 返回' }, [])]),
    cards,
  );
  (root.querySelector('.ghost') as HTMLElement).onclick = onBack;
}

function teamCard(team: TeamSpec, save: SaveData, selected: boolean, onClick: () => void): HTMLElement {
  const avg = (f: (p: TeamSpec['paddlers'][number]) => number) =>
    team.paddlers.reduce((a, p) => a + f(p), 0) / team.paddlers.length;
  const card = el('div', { class: `card team-card ${selected ? 'selected' : ''}` }, [
    el('div', { style: 'font-size:17px;font-weight:700;margin-bottom:4px' }, [
      el('span', { class: 'swatch', style: `background:${rgb(team.colors.hull)}` }),
      team.name,
    ]),
    el('div', { class: 'muted mb', text: team.city }),
    el('div', { class: 'muted mb', style: 'font-style:italic', text: `“${team.motto}”` }),
    stat('平均反应', 1 - avg((p) => p.reactionMean) / 0.3),
    stat('技术精度', 1 - avg((p) => p.technique) / 0.06),
    stat('力量', avg((p) => p.strength)),
    stat('耐力', avg((p) => p.stamina)),
    el('div', { class: 'stat-row' }, [el('span', { text: '鼓手' }), el('b', { text: `${team.drummer.name} · 稳定性 ${Math.round(team.drummer.stability * 100)}%` })]),
    el('div', { class: 'stat-row' }, [el('span', { text: '舵手' }), el('b', { text: `${team.helm.name} · 技术 ${Math.round(team.helm.skill * 100)}%` })]),
    el('div', { class: 'stat-row' }, [el('span', { text: '训练加成' }), el('b', { text: `${Math.round((save.training[team.id] ?? 0) * 100)}%` })]),
    el('div', { class: 'muted mt', style: 'cursor:pointer;color:var(--teal)', text: '展开 22 人名单 →' }),
  ]);
  card.onclick = onClick;
  const rosterToggle = card.lastElementChild as HTMLElement;
  rosterToggle.onclick = (e) => {
    e.stopPropagation();
    const existing = card.querySelector('.roster');
    if (existing) { existing.remove(); rosterToggle.textContent = '展开 22 人名单 →'; return; }
    rosterToggle.textContent = '收起名单 ↑';
    card.append(roster(team));
  };
  return card;
}

function stat(label: string, value: number): HTMLElement {
  return el('div', {}, [el('div', { class: 'stat-row' }, [el('span', { text: label }), el('b', { text: Math.round(Math.max(0, Math.min(1, value)) * 100) + '%' })]), bar(value)]);
}

function roster(team: TeamSpec): HTMLElement {
  const rows = team.paddlers.map((p, i) =>
    el('tr', {}, [
      el('td', { class: 'num', text: String(i + 1).padStart(2, '0') }),
      el('td', { text: p.name }),
      el('td', { text: p.side === 'port' ? '左舷' : '右舷' }),
      el('td', { class: 'num', text: `${(p.reactionMean * 1000).toFixed(0)}ms` }),
      el('td', { class: 'num', text: `${Math.round(p.strength * 100)}` }),
      el('td', { class: 'num', text: `${Math.round(p.stamina * 100)}` }),
    ]),
  );
  return el('div', { class: 'roster paddler-table mt' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, ['#', '姓名', '舷侧', '反应', '力量', '耐力'].map((t) => el('th', { text: t })))]),
      el('tbody', {}, rows),
    ]),
    el('div', { class: 'muted mt', text: `鼓手 ${team.drummer.name} · 舵手 ${team.helm.name}（全队共 22 人）` }),
  ]);
}
