import { PADDLER_COUNT, PADDLER_SIDES } from './constants.js';
import { Rng } from './rng.js';
import type { PaddlerSpec, TeamSpec } from './types.js';

const SURNAMES = ['陈', '李', '黄', '梁', '林', '何', '周', '吴', '郑', '罗', '蔡', '邓', '叶', '苏', '廖', '钟', '曾', '潘', '谢', '许'];
const GIVEN = ['阿龙', '志远', '海涛', '锦帆', '铁柱', '破浪', '乘风', '跃波', '大壮', '青禾', '振声', '百川', '雨生', '岸飞', '潮生', '鸣橹', '定江', '踏浪', '千帆', '观澜'];

/**
 * 按队伍档位生成 20 名划手。tier 0=顶级职业队，3=业余新军。
 * 每个人的反应、技术、力量、耐力都独立抽样——这正是“划手按各自的反应和体力跟鼓点”的数据来源。
 */
function makePaddlers(seed: number, tier: number): PaddlerSpec[] {
  const rng = new Rng(seed);
  const list: PaddlerSpec[] = [];
  const used = new Set<string>();
  for (let i = 0; i < PADDLER_COUNT; i++) {
    let name = '';
    do {
      name = rng.pick(SURNAMES) + rng.pick(GIVEN);
    } while (used.has(name));
    used.add(name);
    const side = PADDLER_SIDES[i % 2];
    // 档位越差：反应越慢、抖动越大、技术越糙；个体之间仍有明显差异
    const reactionMean = 0.13 + tier * 0.028 + rng.range(0, 0.05);
    const reactionJitter = 0.012 + tier * 0.007 + rng.range(0, 0.014);
    const technique = 0.014 + tier * 0.01 + rng.range(0, 0.012);
    const strength = Math.max(0.6, 0.99 - tier * 0.07 - rng.range(0, 0.16));
    const stamina = Math.max(0.58, 0.98 - tier * 0.08 - rng.range(0, 0.18));
    list.push({ id: i, name, side, reactionMean, reactionJitter, technique, strength, stamina });
  }
  return list;
}

interface TeamSeed {
  id: string;
  name: string;
  city: string;
  colors: TeamSpec['colors'];
  motto: string;
  tier: number;
  stability: number;
  aggression: number;
  helmSkill: number;
}

const TEAM_SEEDS: TeamSeed[] = [
  {
    id: 'jinlin',
    name: '金鳞龙舟队',
    city: '广州 · 珠江',
    colors: { hull: [0.85, 0.28, 0.12], accent: [1.0, 0.78, 0.25] },
    motto: '鼓响鳞飞，一桨到底',
    tier: 0,
    stability: 0.92,
    aggression: 0.85,
    helmSkill: 0.95,
  },
  {
    id: 'jusong',
    name: '橘颂龙舟队',
    city: '长沙 · 湘江',
    colors: { hull: [0.2, 0.45, 0.25], accent: [0.95, 0.85, 0.4] },
    motto: '后皇嘉树，橘徕服兮',
    tier: 1,
    stability: 0.85,
    aggression: 0.7,
    helmSkill: 0.85,
  },
  {
    id: 'baitu',
    name: '白鼍龙舟队',
    city: '苏州 · 太湖',
    colors: { hull: [0.25, 0.42, 0.62], accent: [0.9, 0.95, 1.0] },
    motto: '鼍鼓三声，万桨齐开',
    tier: 1,
    stability: 0.8,
    aggression: 0.6,
    helmSkill: 0.9,
  },
  {
    id: 'feiyuan',
    name: '飞鸢龙舟队',
    city: '福州 · 闽江',
    colors: { hull: [0.45, 0.25, 0.55], accent: [1.0, 0.55, 0.35] },
    motto: '鸢飞戾天，桨落惊雷',
    tier: 2,
    stability: 0.72,
    aggression: 0.78,
    helmSkill: 0.72,
  },
  {
    id: 'haozi',
    name: '号子龙舟队',
    city: '重庆 · 嘉陵江',
    colors: { hull: [0.6, 0.32, 0.15], accent: [0.95, 0.6, 0.2] },
    motto: '川江号子，逆水也争先',
    tier: 2,
    stability: 0.68,
    aggression: 0.9,
    helmSkill: 0.78,
  },
  {
    id: 'leigu',
    name: '擂鼓龙舟队',
    city: '惠州 · 东江',
    colors: { hull: [0.18, 0.32, 0.45], accent: [0.5, 0.85, 0.8] },
    motto: '鼓不歇，桨不停',
    tier: 3,
    stability: 0.6,
    aggression: 0.65,
    helmSkill: 0.6,
  },
];

const DRUMMER_NAMES = ['梁鼓', '楚腰', '陆惊雷', '江一鸣', '秦满鼓', '贺长歌'];
const HELM_NAMES = ['老舵公莫', '司徒海', '沈定波', '韦把稳', '尤守江', '方一寸'];

export function buildAllTeams(): TeamSpec[] {
  return TEAM_SEEDS.map((s, idx) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    colors: s.colors,
    motto: s.motto,
    drummer: {
      name: DRUMMER_NAMES[idx],
      stability: s.stability,
      aggression: s.aggression,
    },
    helm: { name: HELM_NAMES[idx], skill: s.helmSkill },
    paddlers: makePaddlers(1000 + idx * 77, s.tier),
  }));
}

/** 训练效果：降低全队技术误差与反应抖动，比例由训练强度 0..1 决定（存档时持久化） */
export function applyTraining(team: TeamSpec, intensity: number): TeamSpec {
  const factor = 1 - 0.35 * intensity;
  return {
    ...team,
    paddlers: team.paddlers.map((p) => ({
      ...p,
      technique: p.technique * factor,
      reactionJitter: p.reactionJitter * factor,
      reactionMean: p.reactionMean * (1 - 0.12 * intensity),
    })),
  };
}
