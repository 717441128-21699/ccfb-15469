import { el, clear, fmtTime, rgb } from './dom.js';
import { lineChart } from './chart.js';
import { buildAllTeams } from '../physics/teams.js';
import type { RaceResult } from '../physics/types.js';

export function renderAnalysis(
  root: HTMLElement,
  result: RaceResult,
  onRematch: () => void,
  onMenu: () => void,
): void {
  clear(root);
  const teams = buildAllTeams();
  const teamOf = (id: string) => teams.find((t) => t.id === id);
  const playerEntry = result.results.find((r) => r.teamId === result.playerTeamId);

  // 1. 成绩单
  const table = el('table', {}, [
    el('thead', {}, [
      el('tr', {}, ['名次', '队伍', '完赛时间', '平均同步率', '平均桨频', '最低体力', '总桨数'].map((h) => el('th', { text: h }))),
    ]),
    el('tbody', {}, result.results.map((r) => {
      const team = teamOf(r.teamId);
      return el('tr', { class: r.teamId === result.playerTeamId ? 'me' : '' }, [
        el('td', { class: `num medal-${r.rank}`, text: r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : String(r.rank) }),
        el('td', {}, [el('span', { class: 'lb-dot swatch', style: `background:${rgb(team!.colors.hull)}` }), r.teamName]),
        el('td', { class: 'num', text: fmtTime(r.finishTime) }),
        el('td', { class: 'num', text: `${Math.round(r.avgSync * 100)}%` }),
        el('td', { class: 'num', text: `${r.avgSpm.toFixed(0)} SPM` }),
        el('td', { class: 'num', text: `${Math.round(r.minFreshness * 100)}%` }),
        el('td', { class: 'num', text: String(r.strokes) }),
      ]);
    })),
  ]);

  // 2. 距离-时间曲线（六条船）
  const positionSeries = result.results.map((r) => {
    const team = teamOf(r.teamId)!;
    return {
      label: team.name,
      color: rgb(team.colors.accent),
      points: result.snapshots
        .map((s) => {
          const b = s.boats.find((sb) => sb.teamId === r.teamId)!;
          return { x: s.time, y: b.x };
        })
        .filter((_, i) => i % 2 === 0),
    };
  });

  // 3. 玩家船同步率与桨频曲线
  const syncSeries = {
    label: '同步效率',
    color: '#e8b84b',
    points: result.playerSyncSeries.map((p) => ({ x: p.t, y: p.sync })),
  };
  const spmSeries = {
    label: '桨频 SPM/132',
    color: '#3fb8af',
    points: result.playerSyncSeries.map((p) => ({ x: p.t, y: p.spm / 132 })),
  };

  // 4. 玩家船速度曲线
  const speedSeries = {
    label: '船速 m/s',
    color: '#d9534f',
    points: result.snapshots
      .filter((_, i) => i % 2 === 0)
      .map((s) => {
        const b = s.boats.find((sb) => sb.teamId === result.playerTeamId)!;
        return { x: s.time, y: b.u };
      }),
  };

  const verdict = playerEntry
    ? el('div', { class: 'card center-text mb' }, [
        el('h2', { text: playerEntry.rank === 1 ? '夺冠！鼓声镇住了整条江' : `第 ${playerEntry.rank} 名完赛` }),
        el('div', { class: 'muted', text: analysisVerdict(playerEntry.avgSync, playerEntry.minFreshness, playerEntry.avgSpm) }),
      ])
    : el('div', {});

  root.append(
    el('div', { class: 'analysis-scroll' }, [
      el('div', { class: 'topbar' }, [el('h2', { text: '赛后分析' }), el('div', { style: 'display:flex;gap:10px' }, [
        el('button', { class: 'btn', id: 'rematch', text: '再来一场' }),
        el('button', { class: 'btn ghost', id: 'back-menu', text: '返回主菜单' }),
      ])]),
      verdict,
      el('div', { class: 'card mb' }, [el('h3', { text: '成绩单' }), table]),
      el('div', { class: 'card mb' }, [el('h3', { text: '距离-时间曲线（斜率即船速）' }), lineChart(positionSeries)]),
      el('div', { class: 'grid two mb' }, [
        el('div', { class: 'card' }, [el('h3', { text: '你的鼓点：同步率与桨频' }), lineChart([syncSeries, spmSeries])]),
        el('div', { class: 'card' }, [el('h3', { text: '你的船速变化（阻力与冲刺）' }), lineChart([speedSeries])]),
      ]),
      el('div', { class: 'card muted' }, [
        el('h3', { text: '教练点评' }),
        ...coachTips(result).map((t) => el('div', { style: 'margin:6px 0' }, [t])),
      ]),
    ]),
  );

  (root.querySelector('#rematch') as HTMLElement).onclick = onRematch;
  (root.querySelector('#back-menu') as HTMLElement).onclick = onMenu;
}

function analysisVerdict(sync: number, freshness: number, spm: number): string {
  const parts: string[] = [];
  parts.push(sync > 0.85 ? '桨下得很齐，鼓点带着整条船走。' : sync > 0.65 ? '同步中规中矩，还有提齐的空间。' : '桨太散了，推力互相抵消——先去节奏训练稳拍。');
  parts.push(freshness < 0.75 ? '后程体力见底，冲刺没冲起来，注意巡航省力气。' : '体力储备充足，末段还能再加一板。');
  parts.push(spm > 100 ? '桨频很猛，别让划手漏拍。' : spm < 70 ? '桨频偏保守，可以更早提速。' : '桨频分配合理。');
  return parts.join(' ');
}

function coachTips(result: RaceResult): string[] {
  const tips: string[] = [];
  const mine = result.results.find((r) => r.teamId === result.playerTeamId);
  if (!mine) return ['完整数据需驾驶自己的船只参赛。'];
  if (mine.avgSync < 0.7) tips.push('• 平均同步率偏低：鼓手节奏一乱，二十把桨的入水时刻就散开。训练模式把误差压到 90ms 以内。');
  const lateSync = result.playerSyncSeries.slice(-10);
  if (lateSync.length && lateSync.every((s) => s.sync < 0.75)) tips.push('• 末段同步率下滑明显：划手体力下降后反应变慢，提前半程稳住桨频比硬冲更有效。');
  if (mine.minFreshness < 0.72) tips.push('• 最低体力偏低：高桨频消耗呈指数累积，巡航段保持 76~82 SPM，最后 150m 再提到 100+。');
  const winner = result.results[0];
  if (winner.teamId !== mine.teamId) tips.push(`• 冠军 ${winner.teamName} 平均同步率 ${Math.round(winner.avgSync * 100)}%，观察其桨频曲线的起航-巡航-冲刺三段节奏。`);
  tips.push('• 靠近前车时会被船浪推偏：提前打舵抵消，或果断变道避开浪区。');
  return tips;
}
