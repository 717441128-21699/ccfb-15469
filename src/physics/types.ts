/** 领域类型定义 */

export type PaddlerSide = 'port' | 'starboard';

/** 划手个体属性（决定反应、精度、体力与力量） */
export interface PaddlerSpec {
  id: number;
  name: string;
  side: PaddlerSide;
  /** 反应延迟均值（秒）：听到鼓点到开始入水 */
  reactionMean: number;
  /** 反应延迟抖动标准差（秒） */
  reactionJitter: number;
  /** 入水时机技术误差标准差（秒），训练可降低 */
  technique: number;
  /** 力量 0..1，影响单桨峰值力 */
  strength: number;
  /** 耐力 0..1，影响体力消耗速率 */
  stamina: number;
}

export interface DrummerSpec {
  name: string;
  /** 节奏稳定性：保持巡航 SPM 的随机波动（次/分钟 的标准差） */
  stability: number;
  /** AI 战术激进程度 0..1 */
  aggression: number;
}

export interface HelmSpec {
  name: string;
  /** 舵手修正偏航的增益 */
  skill: number;
}

export interface TeamSpec {
  id: string;
  name: string;
  city: string;
  colors: { hull: [number, number, number]; accent: [number, number, number] };
  motto: string;
  drummer: DrummerSpec;
  helm: HelmSpec;
  paddlers: PaddlerSpec[];
}

/** 运行时单个划手的划桨状态 */
export type StrokePhase = 'wait' | 'drive' | 'recover';

export interface PaddlerState {
  spec: PaddlerSpec;
  phase: StrokePhase;
  /** 当前周期已进行时间 s */
  cycleTime: number;
  /** 本次划桨周期长度 s */
  strokePeriod: number;
  /** 本次拉桨时长 s */
  pullDuration: number;
  /** 本次入水相对鼓点的实际延迟 s（用于统计离散度） */
  catchOffset: number;
  /** 本次发力缩放（力量×体力） */
  powerFactor: number;
  /** 当前瞬时桨力 N（船体坐标系纵向，正=向前） */
  instantForce: number;
  /** 已完成的桨数 */
  strokes: number;
  /** 体力 1 → ~0.7 */
  freshness: number;
  /** 漏拍计数（周期短于生理极限或体力过低时） */
  missed: number;
  /** 最近一次入水所属的鼓点批次号（用于按拍归集同步统计） */
  lastCatchBeat: number;
}

/** 鼓手运行时状态 */
export interface DrummerState {
  spec: DrummerSpec;
  /** 当前目标桨频（次/分钟） */
  targetSpm: number;
  /** 实际生效桨频（带平滑，突变会让划手更跟不上） */
  currentSpm: number;
  /** 距下一次鼓点的时间 s */
  timeToBeat: number;
  /** 已发出的鼓点数 */
  beats: number;
  /** 最近一次鼓点的时间戳 s（比赛时钟） */
  lastBeatTime: number;
  /** 本拍是否由真人玩家敲出 */
  playerDriven: boolean;
  /** 手动模式（玩家船）：只响应玩家敲鼓，不自动出拍 */
  manual: boolean;
  /** 全队反应锚点（平均反应延迟），鼓手把划手向这个统一节奏收拢 */
  reactionAnchor: number;
  /** 节奏收拢系数 0..1：鼓手越稳，个体反应差异被压得越小 */
  cohesion: number;
}

export interface BoatConfig {
  team: TeamSpec;
  lane: number;
  isPlayer: boolean;
  seed: number;
}

export interface BoatRuntime {
  config: BoatConfig;
  paddlers: PaddlerState[];
  drummer: DrummerState;
  // —— 刚体状态（世界系）——
  /** 纵向位置（沿赛道，米） */
  x: number;
  /** 横向位置（米） */
  y: number;
  /** 航向角 rad，0=正向沿 x */
  heading: number;
  /** 纵荡速度 m/s（船体系） */
  u: number;
  /** 横荡速度 m/s（船体系） */
  v: number;
  /** 艏摇角速度 rad/s */
  r: number;
  /** 舵角 rad，左舵为正 */
  rudder: number;
  // —— 本拍统计 ——
  /** 最近一拍入水时刻标准差 s */
  lastSyncSigma: number;
  /** 最近一拍同步效率 0..1 */
  lastSyncEfficiency: number;
  /** 最近一拍平均入水延迟 s */
  lastMeanOffset: number;
  /** 累计完成距离 m */
  distance: number;
  /** 完赛时间 s，未完赛为 null */
  finishTime: number | null;
  /** 全队平均体力 */
  avgFreshness: number;
  /** 本 tick 纵向总推力 N（含同步折减前的原始推力与折减后分别记录） */
  rawThrust: number;
  netThrust: number;
  /** 本 tick 横向力与偏航力矩 */
  lateralForce: number;
  yawMoment: number;
}

/** 水流场采样结果 */
export interface FlowSample {
  /** 纵向流速 m/s（正=顺流） */
  vx: number;
  /** 横向流速 m/s */
  vy: number;
}

export interface RiverSpec {
  id: string;
  name: string;
  /** 赛道总长 m（标准 500m 直道） */
  length: number;
  laneCount: number;
  laneWidth: number;
  /** 基础顺流流速 m/s */
  baseFlow: number;
  /** 水流横向摆动幅度与波长 */
  meanderAmplitude: number;
  meanderWavelength: number;
  /** 局部湍流强度（叠加高斯扰动的标准差 m/s） */
  turbulence: number;
  /** 中段逆流区（模拟弯道回水），可为空 */
  adverseZones: { x0: number; x1: number; laneBias: number; strength: number }[];
}

export interface RaceSnapshot {
  time: number;
  boats: Array<{
    teamId: string;
    x: number;
    u: number;
    heading: number;
    rudder: number;
    spm: number;
    sigma: number;
    sync: number;
    freshness: number;
    strokes: number;
  }>;
}

export interface RaceResultEntry {
  rank: number;
  teamId: string;
  teamName: string;
  finishTime: number;
  avgSync: number;
  avgSpm: number;
  minFreshness: number;
  strokes: number;
}

export interface RaceResult {
  riverId: string;
  length: number;
  results: RaceResultEntry[];
  snapshots: RaceSnapshot[];
  /** 玩家船的逐拍同步率，供赛后分析 */
  playerSyncSeries: { t: number; sigma: number; sync: number; spm: number }[];
  playerTeamId: string | null;
}
