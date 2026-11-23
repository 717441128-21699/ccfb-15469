import type { RaceResult } from '../physics/types.js';

const SAVE_KEY = 'dragon-boat-save-v1';

export interface SaveData {
  version: 1;
  /** 各队已累计的训练强度 0..1，按 teamId 索引 */
  training: Record<string, number>;
  /** 玩家解锁/选用的队伍 id */
  selectedTeamId: string | null;
  /** 历史战绩（最近 20 场） */
  history: RaceResult[];
  /** 累计奖牌 */
  bestRank: Record<string, number>;
}

const DEFAULT_SAVE: SaveData = {
  version: 1,
  training: {},
  selectedTeamId: null,
  history: [],
  bestRank: {},
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, training: {}, history: [], bestRank: {} };
    const parsed = JSON.parse(raw) as SaveData;
    return { ...DEFAULT_SAVE, ...parsed };
  } catch {
    return { ...DEFAULT_SAVE, training: {}, history: [], bestRank: {} };
  }
}

export function persistSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('存档失败', e);
  }
}

export function recordRaceResult(data: SaveData, result: RaceResult): SaveData {
  const history = [result, ...data.history].slice(0, 20);
  const bestRank = { ...data.bestRank };
  for (const r of result.results) {
    const prev = bestRank[r.teamId];
    if (prev === undefined || r.rank < prev) bestRank[r.teamId] = r.rank;
  }
  const next: SaveData = { ...data, history, bestRank };
  persistSave(next);
  return next;
}

export function addTraining(data: SaveData, teamId: string, amount: number): SaveData {
  const training = { ...data.training };
  training[teamId] = Math.min(1, (training[teamId] ?? 0) + amount);
  const next: SaveData = { ...data, training };
  persistSave(next);
  return next;
}

export function resetSave(): SaveData {
  const fresh: SaveData = { ...DEFAULT_SAVE, training: {}, history: [], bestRank: {} };
  persistSave(fresh);
  return fresh;
}
