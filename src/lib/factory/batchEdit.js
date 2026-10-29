import { ITEM_MODEL } from './buildingModels.js';
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
 * 替换配方
 * @param {object} blueprint 
 * @param {{ from: number, to: number, acceleratorMode: 0 | 1 | null }} options 
 */
function editRecipe(blueprint, options) {
  if (!blueprint?.buildings) return false;

  blueprint.buildings.forEach((building) => {
    if (building?.recipeId !== options.from) return;

    building.recipeId = options.to;
    if (options.acceleratorMode !== null && building.parameters) building.parameters.acceleratorMode = options.acceleratorMode;
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

export { batchUp, compactBuildings, discardBuildings, editAutoOrbit, editFilter, editRecipe, editStationItems, syncBeltIcon };
