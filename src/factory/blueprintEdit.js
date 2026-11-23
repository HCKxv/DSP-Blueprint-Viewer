import { isBelt, isInserter, isLab, isStation, isHanging } from '../blueprint/factory/factoryItems.js';
import { ITEM_MODEL } from '../data/buildingModels.js';

/**
 * @param {object} blueprint
 */
function compactBuildings(blueprint) {
  const newBuildings = [];
  const idxMap = new Map();

  let changed = false;
  blueprint.buildings?.forEach((b) => {
    if (b.index < 0) {
      changed = true;
      return;
    }
    const index = newBuildings.length;
    if (b.index !== index) changed = true;
    idxMap.set(b.index, index);
    newBuildings.push(b);
  });
  if (!changed) return;

  newBuildings.forEach((b) => {
    b.index = idxMap.get(b.index);
    b.inputObjIdx = idxMap.get(b.inputObjIdx) ?? -1;
    b.outputObjIdx = idxMap.get(b.outputObjIdx) ?? -1;
  });

  blueprint.buildings = newBuildings;
};

/**
 * 剔除建筑
 * @param {object} blueprint
 * @param {number} itemId
 */
function discardBuildings(blueprint, itemId) {
  blueprint.buildings?.forEach((building) => {
    if (+building?.itemId === +itemId) building.index = -1;
  });
  if (+itemId === 1131) blueprint.reformData = null;
}

/**
 * 剔除地基
 * @param {object} blueprint
 * @param {'decal'|'undecal'} kind
 */
function discardRects(blueprint, kind) {
  const undecal = kind === 'undecal'
  const kept = blueprint.reformData?.rects.filter(rect => undecal ? rect?.type!=7 : rect?.type==7);
  if (!kept || kept.length === 0) {
    blueprint.reformData = null;
    return;
  }
  blueprint.reformData.rects = kept;
  if (!undecal) blueprint.reformData.customReformColorMask = 0;
}

/** 获取堆叠研究站列表 */
function labGroup(blueprint, index) {
  const group = new Set();

  const traceIn = (idx) => {
    const b = blueprint.buildings[+idx];
    if (!b || !isLab(b.itemId) || b.index != idx || group.has(b)) return;
    group.add(b);
    if (b.inputObjIdx >= 0) traceIn(b.inputObjIdx);
  }
  traceIn(index);
  
  const outMap = {};
  blueprint.buildings?.forEach((b, idx) => {
    if (!b || !isLab(b.itemId) || b.index != idx) return;
    outMap[b.inputObjIdx] = b;
  });
  const traceOut = (idx) => {
    const b = outMap[idx];
    if (!b || group.has(b)) return;
    group.add(b);
    traceOut(b.index);
  }
  traceOut(index);

  return group;
}

/** 修改建筑 */
function editBuilding(blueprint, index, changes) {
  const edits = {};
  for (const key in changes) {
    if (changes[key] != null) edits[key] = changes[key];
  }
  if (Object.keys(edits).length === 0) return;

  const building = blueprint?.buildings?.[index];
  if (!building || building.index != index) return;
  const buildingsToEdit = isLab(building.itemId) 
    ? [...labGroup(blueprint,index)]
    : [building];

  buildingsToEdit.forEach((b) => {
    blueprint.buildings[b.index] = { ...b, ...edits };
  });
  if (isStation(building.itemId)) syncBeltIcon(blueprint);
}

/** 替换物流塔 */
function editStationType(blueprint, index, dropSlot = null) {
  const building = blueprint?.buildings?.[index];
  if (!building || building.index != index) return;
  const parameters = { ...(building.parameters ?? {}) };
  const slot = Number.isInteger(dropSlot) ? Number(dropSlot) : 5;

  let itemId;
  if (building.itemId === 2103) {
    // 行星内 → 星际: 补一个空栏位
    if (parameters.storage.length <= 4) {
      parameters.storage.push({ itemId: 0, localRole: 0, remoteRole: 0, max: 0, lockAmount: 0 });
    }
    itemId = 2104;
  } else if (building.itemId === 2104) {
    // 星际 → 行星内: 丢一个栏位，再把指着它的传送带槽位改掉
    parameters.storage.splice(slot - 1, 1);
    parameters.slots.forEach(belt => {
      const storageIdx = Number(belt?.storageIdx);
      if (storageIdx < 1 || storageIdx > 5) return;   // 0 = 不输出、6 = 翘曲器
      if (storageIdx === slot) belt.storageIdx = 0;
      else if (storageIdx > slot) belt.storageIdx = storageIdx - 1;
    })
    itemId = 2103;
  } else {
    return;
  }

  editBuilding(blueprint, index, { itemId, modelIndex: ITEM_MODEL[itemId]?.[0], parameters });
}

/**
 * 反转分拣器: 交换抓取端和放下端
 * 
 *   - 连接与插槽成对交换
 *   - yaw: 两组各 +180°（分拣器两端的朝向都沿爪臂方向）
 *   - pitch / tilt: 对调后取反
 */
function reverseInserter(blueprint, index) {
  const building = blueprint?.buildings?.[index];
  if (!building || building.index != index || !isInserter(building.itemId)) return;

  const grab = building.localOffset[0];
  const drop = building.localOffset[1];
  if (!grab || !drop) return false;

  /** 角度归到 [0, 360) */
  const turn = (deg) => ((deg % 360) + 360) % 360;

  const yaws = Array.isArray(building.yaw) ? building.yaw : [];
  const grabYaw = yaws[0];
  const dropYaw = yaws[1];

  return editBuilding(blueprint, index, {
    // 连接: 输入 ↔ 输出
    inputObjIdx: building.outputObjIdx,
    outputObjIdx: building.inputObjIdx,
    inputFromSlot: building.outputToSlot,
    outputToSlot: building.inputFromSlot,
    inputOffset: building.outputOffset,
    outputOffset: building.inputOffset,
    // 两端位姿: 第二组 ↔ 第一组
    localOffset: [drop, grab],
    yaw: [turn(dropYaw + 180), turn(grabYaw + 180)],
    pitch: turn(-building.pitch2),
    pitch2: turn(-building.pitch),
    tilt: turn(-building.tilt2),
    tilt2: turn(-building.tilt),
  });
}

/**
 * 修改地基装饰
 * @param {object} blueprint
 * @param {number} type
 */
function changeRectType(blueprint, type) {
  const reform = blueprint?.reformData;
  const rects = reform?.rects;
  if (!rects) return;
  rects.forEach(rect => rect.type = type || 1);
  blueprint.reformData = { ...reform, rects };
}

/**
 * 替换配方
 * @param {object} blueprint
 * @param {number} from 原配方 id
 * @param {number} to 新配方 id
 * @param {-1|0|1} acceleratorMode 增产模式: -1 = 不修改，0 = 额外产出，1 = 生产加速
 */
function editRecipe(blueprint, from, to, acceleratorMode) {
  blueprint.buildings?.forEach((building) => {
    if (building?.recipeId !== from) return;
    building.recipeId = to;
    if (acceleratorMode !== -1 && building.parameters) building.parameters.acceleratorMode = acceleratorMode;
  });
};

/**
 * 升降级建筑
 * @param {object} blueprint
 * @param {number} from 原建筑 id
 * @param {number} to 新建筑 id
 */
function batchUp(blueprint, from, to) {
  blueprint.buildings?.forEach((building) => {
    if (building?.itemId !== from) return;
    building.itemId = to;
    building.modelIndex = ITEM_MODEL[to]?.[0];
  });
};

/**
 * 修改物流塔物品
 * @param {object} blueprint
 * @param {number} from 原物品 id
 * @param {number} to 新物品 id
 */
function editStationItems(blueprint, from, to) {
  const stationID = [2103, 2104];
  blueprint.buildings?.forEach((building) => {
    if (!building) return;

    if (stationID.includes(building.itemId)) {
      building.parameters?.storage?.forEach((slot) => {
        if (slot.itemId !== from) return;
        slot.itemId = to;
      });
    };

    if (isBelt(building.itemId) && stationID.includes(blueprint.buildings[building.inputObjIdx]?.itemId)) {
      if (building.parameters?.iconId !== from) return;
      building.parameters.iconId = to;
    };
  });
};

/**
 * 将传送带的图标标签对齐连接的运输站
 *
 * @param {object} blueprint 蓝图对象
 */
function syncBeltIcon(blueprint) {
  blueprint.buildings?.forEach((building) => {
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
 * @param {number} from 原物品 id
 * @param {number} to 新物品 id
 * @param {'全部'|'分拣器'|'四向'|'配送器'} target 改哪几类建筑
 */
function editFilter(blueprint, from, to, target) {
  const isTarget = (() => {
    switch(target){
      case '分拣器': return isInserter
      case '四向':   return i => i === 2020
      case '配送器': return i => i === 2107
      case '全部':   return i => isInserter(i) || i === 2020 || i === 2107
    }
  })();
  blueprint.buildings?.forEach((building) => {
    if (!building || building.filterId !== from) return;
    if (isTarget(building.itemId)) building.filterId = to;
  });
};

/**
 * 电磁轨道弹射器设为自动轨道弹射
 * @param {object} blueprint
 */
function editAutoOrbit(blueprint) {
  blueprint.buildings?.forEach((building) => {
    if (building?.itemId !== 2311 || !building.parameters) return;
    building.parameters.autoOrbit = true;
    building.parameters.orbitId = 0;
  });
}

/**
 * 水平偏移
 * @param {object} blueprint
 * @param {number} offsetX
 * @param {number} offsetY
 */
function horizontalOffset(blueprint, offsetX, offsetY) {
  blueprint.buildings?.forEach((building) => {
    building.localOffset[0].x += +offsetX;
    building.localOffset[1].x += +offsetX;
    building.localOffset[0].y += +offsetY;
    building.localOffset[1].y += +offsetY;
  });
}

/**
 * 蓝图能否整体升降高度
 * 可浮空建筑 —— 传送带 / 分拣器 / 流速监测器 / 喷涂机
 * @param {object} blueprint
 * @returns {boolean}
 */
function canLiftHeight(blueprint) {
  for(const building of blueprint.buildings) {
    if (isHanging(building.itemId)) continue;
    return false;
  };
  return true;
}

/**
 * 水平偏移
 * @param {object} blueprint
 * @param {number} offsetZ
 */
function verticalOffset(blueprint, offsetZ) {
  if (canLiftHeight(blueprint)) return;
  blueprint.buildings?.forEach((building) => {
    building.localOffset[0].z += +offsetZ;
    building.localOffset[1].z += +offsetZ;
  });
}

export { batchUp, changeRectType, compactBuildings, discardBuildings, discardRects, editAutoOrbit, editBuilding, editFilter, editRecipe, editStationItems, editStationType, horizontalOffset, verticalOffset, canLiftHeight, labGroup, reverseInserter, syncBeltIcon };
