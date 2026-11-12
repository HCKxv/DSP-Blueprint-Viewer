import { ITEM_MODEL } from './data/buildingModels.js';
import { isBelt, isInserter, isLab, isStation } from '../blueprint/factory/factoryItems.js';

/**
 * @param {object} blueprint 
 */
function compactBuildings(blueprint) {
  if (!blueprint?.buildings) return false;

  const newBuildings = [];
  const idxMap = new Map();

  let changed = false;
  blueprint.buildings.forEach((b) => {
    if (b.index < 0) {
      changed = true;
      return;
    }

    const index = newBuildings.length;
    if (b.index !== index) changed = true;
    idxMap.set(b.index, index);
    newBuildings.push({ ...b, index });
  });
  if (!changed) return false;

  newBuildings.forEach((b) => {
    b.inputObjIdx = idxMap.get(b.inputObjIdx) ?? -1;
    b.outputObjIdx = idxMap.get(b.outputObjIdx) ?? -1;
  });

  blueprint.buildings = newBuildings;
  return true;
};

/**
 * 剔除建筑
 * @param {object} blueprint 
 * @param {number} itemId
 */
function discardBuildings(blueprint, itemId) {
  if (!blueprint?.buildings) return false;

  const id = Number(itemId);
  blueprint.buildings.forEach((building) => {
    if (Number(building?.itemId) === id) building.index = -1;
  });
  if (id === 1131) blueprint.reformData = null;
  return true;
}

/**
 * 剔除地基
 * @param {object} blueprint 
 * @param {number|number[]} type 装饰类型: 1-6 = 带装饰，7 = 无装饰；可给数组
 * @returns {number} 剔除的格数（0 = 没有这一类地基）
 */
function discardRects(blueprint, type) {
  const reform = blueprint?.reformData;
  const rects = reform?.rects;
  if (!Array.isArray(rects)) return 0;

  const types = new Set((Array.isArray(type) ? type : [type]).map(Number));
  const kept = [];
  let removed = 0;
  for (const rect of rects) {
    if (!types.has(Number(rect?.type))) {
      kept.push(rect);
      continue;
    }
    removed += (Number(rect?.w) || 0) * (Number(rect?.h) || 0);
  }
  if (removed === 0) return 0;

  // 一点不剩: 整个地基段去掉（导出时也就不写 reformData）
  if (kept.length === 0) {
    blueprint.reformData = null;
    return removed;
  }

  reform.rects = kept;
  // 自定义色的 mask（位 16-31）只留还在用的色号
  let mask = 0;
  for (const rect of kept) {
    const slot = Number(rect?.color) || 0;
    if (slot >= 16) mask |= 1 << slot;
  }
  reform.customReformColorMask = mask >>> 0;
  return removed;
}

/**
 * 修改地基装饰
 * @param {object} blueprint
 * @param {number} type
 */
function changeRectType(blueprint, type) {
  const reform = blueprint?.reformData;
  const rects = reform?.rects;
  if (!rects) return false;

  for (const rect of rects) rect.type = type || 1;
  blueprint.reformData = { ...reform, rects };
  return true;
}

/**
 * 替换配方
 * @param {object} blueprint 
 * @param {{ from: number, to: number, acceleratorMode: -1 | 0 | 1 }} options
 */
function editRecipe(blueprint, options) {
  if (!blueprint?.buildings) return false;

  blueprint.buildings.forEach((building) => {
    if (building?.recipeId !== options.from) return;

    building.recipeId = options.to;
    // -1 = 不修改；0 = 额外产出，1 = 生产加速
    if (options.acceleratorMode !== -1 && building.parameters) building.parameters.acceleratorMode = options.acceleratorMode;
  });
  return true;
};

/**
 * 升降级建筑
 * @param {object} blueprint 
 * @param {{ from: number, to: number }} options 
 */
function batchUp(blueprint, options) {
  if (!blueprint?.buildings) return false;

  blueprint.buildings.forEach((building) => {
    if (building?.itemId !== options.from) return;

    building.itemId = options.to;
    building.modelIndex = ITEM_MODEL[options.to]?.[0];
  });
  return true;
};

/**
 * 修改物流塔物品
 * @param {object} blueprint 
 * @param {{ from: number, to: number }} options 
 */
function editStationItems(blueprint, options) {
  if (!blueprint?.buildings) return false;
  const stationID = [2103, 2104]
  
  blueprint.buildings.forEach((building) => {
    if (!building) return;

    if (stationID.includes(building.itemId)) {
      building.parameters?.storage?.forEach((slot) => {
        if (slot.itemId !== options.from) return;
        slot.itemId = options.to;
      });
    };

    if (isBelt(building.itemId) && stationID.includes(blueprint.buildings[building.inputObjIdx]?.itemId)) {
      if (building.parameters?.iconId !== options.from) return;
      building.parameters.iconId = options.to;
    };
  });
  return true;
};

/**
 * 将传送带的图标标签对齐连接的运输站
 *
 * @param {object} blueprint 蓝图对象
 */
function syncBeltIcon(blueprint) {
  if (!blueprint?.buildings) return false;

  blueprint.buildings.forEach((building) => {
    if (!isBelt(building?.itemId)) return;

    const station = blueprint.buildings[building.inputObjIdx];
    if (!isStation(station?.itemId)) return;
    const storageIdx = station.parameters.slots[building.inputFromSlot]?.storageIdx;
    
    let item = 0;
    if (storageIdx >= 1 && storageIdx <= 5) {
      const storage = station.parameters.storage[storageIdx - 1];
      item = storage?.itemId ?? 0;
    }
    else if (storageIdx == 6) item = 1210;

    building.parameters.iconId = item;
  });
}

/**
 * 修改物品过滤
 * @param {object} blueprint 
 * @param {{ from: number, to: number, target: '全部'|'分拣器'|'四向'|'配送器' }} options 
 */
function editFilter(blueprint, options) {
  if (!blueprint?.buildings) return false;

  const isTarget = (i) => {
    const ins = isInserter(i)
    const spl = i === 2020
    const dlv = i === 2107

    switch(options.target){
      case '全部': return ins || spl || dlv;
      case '分拣器': return ins;
      case '四向': return spl;
      case '配送器': return dlv;
    }
  };

  blueprint.buildings.forEach((building) => {
    if (!isTarget(building?.itemId) || building.filterId !== options.from) return;

    building.filterId = options.to;
  });
  return true;
};

/**
 * 电磁轨道弹射器设为自动轨道弹射
 * @param {object} blueprint
 */
function editAutoOrbit(blueprint) {
  if (!blueprint?.buildings) return false;

  blueprint.buildings.forEach((building) => {
    if (building?.itemId !== 2311 || !building.parameters) return;

    building.parameters.autoOrbit = true;
    building.parameters.orbitId = 0;
  });
  return true;
}

export { batchUp, changeRectType, compactBuildings, discardBuildings, discardRects, editAutoOrbit, editFilter, editRecipe, editStationItems, syncBeltIcon };
