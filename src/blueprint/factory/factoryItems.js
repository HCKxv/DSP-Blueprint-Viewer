// ─────────────────────────────────────────────────────────────
// 物品名称表（id → 中文名）
// ─────────────────────────────────────────────────────────────

import { ITEM_DATA } from '../../data/items.js';
const ITEM_NAMES = new Map();
for (const i of ITEM_DATA) {
  ITEM_NAMES.set(i.id, i.name);
}

// 根据物品 id 返回中文名称
function itemName(itemId) {
  return ITEM_NAMES.get(itemId) ?? `未知物品_${itemId}`;
}

// ─────────────────────────────────────────────────────────────
// 建筑类型判定
// ─────────────────────────────────────────────────────────────
const BELT_IDS = new Set([2001, 2002, 2003]);                  // 传送带
const INSERTER_IDS = new Set([2011, 2012, 2013, 2014]);        // 分拣器
const ASSEMBLER_IDS = new Set([                                // 需指定配方的制造类建筑
  2303, 2304, 2305, 2318, 2302, 2315, 2319, 2308, 2309, 2317, 2310,
]);
const LAB_IDS = new Set([2901, 2902]);                         // 研究站
const TURRET_IDS = new Set([3001, 3002, 3003, 3004, 3005, 3006, 3010]); // 炮台
const STATION_IDS = new Set([2103, 2104, 2316]);               // 运输站类
const HANGING_IDS = new Set([...BELT_IDS, ...INSERTER_IDS, 2313, 2030]);   // 可悬空的建筑

/** 是否 传送带 */
const isBelt = (id) => BELT_IDS.has(id);
/** 是否 分拣器 */
const isInserter = (id) => INSERTER_IDS.has(id);
/** 是否 制造类建筑 */
const isAssembler = (id) => ASSEMBLER_IDS.has(id);
/** 是否研究站 */
const isLab = (id) => LAB_IDS.has(id);
/** 是否 炮台 */
const isTurret = (id) => TURRET_IDS.has(id);
/** 是否 运输站 */
const isStation = (id) => STATION_IDS.has(id);
/** 是否 可悬空 */
const isHanging = (id) => HANGING_IDS.has(id);

// 二进制格式中的类型范围判定
const isBeltRange = (id) => id > 2000 && id < 2010;    // 传送带类：倾角字段独有
const isSorterRange = (id) => id > 2010 && id < 2020;  // 分拣器类：双端点、倾角字段独有

export {
  ITEM_NAMES,
  itemName,
  isBelt,
  isInserter,
  isAssembler,
  isLab,
  isTurret,
  isStation,
  isHanging,
  isBeltRange,
  isSorterRange,
};
