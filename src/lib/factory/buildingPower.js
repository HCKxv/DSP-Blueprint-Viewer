/** 建筑耗电量 */
export const BUILDING_POWER = {
  // 物流 / 分拣
  41: { work: 18, idle: 9 },        // 分拣器
  42: { work: 36, idle: 9 },        // 高速分拣器
  43: { work: 72, idle: 9 },        // 极速分拣器
  483: { work: 144, idle: 9 },      // 集装分拣器
  49: { work: 12000, idle: 60 },    // 行星内物流运输站
  50: { work: 60000, idle: 60 },    // 星际物流运输站
  71: { work: 4800, idle: 90 },     // 无线输电塔
  68: { work: 24000, idle: 720 },   // 卫星配电站
  117: { work: 30000, idle: 0 },    // 轨道采集器（按采气量折算）
  371: { work: 1800, idle: 18 },    // 物流配送器
  208: { work: 36, idle: 9 },       // 流速监测器
  257: { work: 144, idle: 9 },      // 自动集装机
  120: { work: 90, idle: 4.5 },     // 喷涂机

  // 生产
  62: { work: 360, idle: 12 },      // 电弧熔炉
  194: { work: 1440, idle: 48 },    // 位面熔炉
  457: { work: 2880, idle: 96 },    // 负熵熔炉
  65: { work: 270, idle: 12 },      // 制造台 Mk.I
  66: { work: 540, idle: 18 },      // 制造台 Mk.II
  67: { work: 1080, idle: 24 },     // 制造台 Mk.III
  456: { work: 2700, idle: 54 },    // 重组式制造台
  70: { work: 480, idle: 12 },      // 矩阵研究站
  455: { work: 1920, idle: 48 },    // 自演化研究站
  64: { work: 720, idle: 24 },      // 化工厂
  376: { work: 2160, idle: 36 },    // 量子化工厂
  63: { work: 960, idle: 24 },      // 原油精炼厂
  69: { work: 12000, idle: 120 },   // 微型粒子对撞机
  119: { work: 720, idle: 18 },     // 分馏塔

  // 采集 / 发射
  57: { work: 420, idle: 24 },      // 采矿机
  256: { work: 2940, idle: 168 },   // 大型采矿机
  60: { work: 300, idle: 12 },      // 抽水站
  61: { work: 840, idle: 24 },      // 原油萃取站
  72: { work: 1800, idle: 60 },     // 电磁轨道弹射器
  74: { work: 18000, idle: 60 },    // 垂直发射井

  // 防御
  374: { work: 210, idle: 9 },      // 高斯机枪塔
  373: { work: 3000, idle: 120 },   // 高频激光塔
  375: { work: 750, idle: 30 },     // 聚爆加农炮
  408: { work: 1680, idle: 84 },    // 磁化电浆炮
  407: { work: 600, idle: 18 },     // 导弹防御塔
  422: { work: 1200, idle: 90 },    // 干扰塔
  403: { work: 9600, idle: 1350 },  // 信号塔
  402: { work: 24000, idle: 12000 },// 行星护盾发生器
  453: { work: 2400, idle: 60 },    // 战场分析基站
  482: { work: 4200, idle: 2100 },  // 近程电浆塔

  // 其他
  664: { work: 120, idle: 0 },      // 全息信标
};

/** 不耗电的默认值（表里没有的模型） */
const NO_POWER = { work: 0, idle: 0 };

/**
 * 取某个模型的耗电
 *
 * @param {number} modelIndex 蓝图 BUILDING 里的模型 id
 * @returns {{work: number, idle: number}} 工作时 / 待机时耗电，单位 kW；不耗电返回 0
 */
export function buildingPower(modelIndex) {
  return BUILDING_POWER[modelIndex] ?? NO_POWER;
}
