/**
 * 全局可调物理常量。
 * 单位制：米、千克、秒、弧度。
 * 坐标约定：船体坐标系 x 指向船头，y 指向左舷(port)，世界坐标 y 为横向，航向角 θ 逆时针为正。
 */

export const PHYS_HZ = 120;
export const DT = 1 / PHYS_HZ;

/** 一条标准龙舟 22 人：20 划手 + 1 鼓手 + 1 舵手 */
export const PADDLER_COUNT = 20;
export const CREW_COUNT = 22;
export const RACE_BOAT_COUNT = 6;
/** 两排划手：i 为偶数在左舷(port)，奇数在右舷(starboard) */
export const PADDLER_SIDES = ['port', 'starboard'] as const;

/** 船体几何（IDBF 标准龙形舟近似） */
export const BOAT_LENGTH = 15.6;
export const BOAT_BEAM = 1.16;
export const HULL_MASS = 250; // kg
export const PADDLER_MASS = 75; // kg/人
export const BOAT_MASS = HULL_MASS + CREW_COUNT * PADDLER_MASS; // 1900 kg
export const YAW_INERTIA = 40000; // kg·m²，绕竖直轴转动惯量
export const PADDLE_LATERAL_OFFSET = 0.58; // 桨相对船中线的横向力臂 m
export const SEAT_SPACING = 0.62; // 划手座位纵向间距 m

/** 单桨发力：拉桨阶段 F = F_MAX · sin(π · phase) */
export const PADDLE_F_MAX = 470; // N，满状态划手拉桨峰值力
export const PULL_FRACTION = 0.6; // 拉桨(入水到出水)占整个划桨周期的比例
export const MIN_STROKE_PERIOD = 0.5; // s，生理极限：周期短于该值会漏拍

/**
 * 水阻力：F_drag = D1·v_rel + D2·v_rel·|v_rel|（纵荡）。
 * 系数按 22 人标准龙舟实测巡航阻力曲线标定，使推力减阻力的解析平衡速度
 * 与完全同步仿真的时间平均稳态速度相差 ≤3%。
 */
export const DRAG_LINEAR = 48;
export const DRAG_QUADRATIC = 118;
/** 横向水阻力（横荡） */
export const SWAY_DRAG = 4200;
/** 艏摇阻尼：M = -RY1·r - RY2·r·|r| */
export const YAW_DRAG_LINEAR = 16000;
export const YAW_DRAG_QUADRATIC = 9000;

/** 同步效率 η_sync = exp(-(σ_catch / SIGMA_REF)²)，σ_catch 为同一鼓点下桨入水时刻的标准差(秒) */
export const SIGMA_REF = 0.12;
/**
 * 高同步协同增益：入水极度齐整时，二十把桨的水动力耦合产生额外推力。
 * η 实际值 = 基础 exp 折减 + SYNERGY_BONUS·exp(-(σ/SYNERGY_REF)²)，上限约 1+SYNERGY_BONUS。
 * 解析平衡基准仍以 η=1（完全同步但不考虑协同增益）为锚，保证 3% 验收口径清晰。
 */
export const SYNERGY_BONUS = 0.12;
export const SYNERGY_REF = 0.045;

/** 体力 */
export const FATIGUE_PER_STROKE = 0.0042; // 基础每桨体力消耗
export const MIN_POWER_FACTOR = 0.72; // 体力耗尽时仍保留的发力比例

/** 舵 */
export const RUDDER_GAIN = 620; // 横向舵力系数
export const RUDDER_DRAG_COEF = 26; // 打舵带来的附加纵荡阻力
export const RUDDER_MAX_ANGLE = (14 * Math.PI) / 180;

/** 船浪互扰 */
export const WAKE_AHEAD_DIST = 14; // 前方船浪作用距离 m
export const WAKE_HALF_WIDTH = 3.2; // 船浪横向半宽 m
export const WAKE_LATERAL_FORCE = 520; // 推偏横向力峰值 N
export const WAKE_YAW_MOMENT = 1600; // 船浪造成的偏航力矩峰值
export const WAKE_DRAG = 90; // 乘浪/破浪附加阻力系数

/** 河道 */
export const LANE_WIDTH = 9; // 每条航道宽 m
export const START_GAP = 4; // 出发时相邻船横向以外的安全余量

/** 鼓手 */
export const MIN_SPM = 48;
export const MAX_SPM = 132;

/** 遥测采样 */
export const TELEMETRY_HZ = 10;
