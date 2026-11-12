import { recipeData, recipeProductive, buildingSpeed } from './data/factoryRecipes.js';
import { isLab, isAssembler, itemName } from '../blueprint/factory/factoryItems.js';
import { buildingPower } from './data/buildingPower.js';
import { fmtKJ, fmtKW } from '../utils/energy.js';

const 物流建筑 = [2103, 2104, 2107, 3009];  // 带有最大充能功率(workEnergyPerTick)参数的建筑
const 发电建筑 = [2203, 2204, 2205, 2210, 2211, 2213];

const 增产剂加成 = {
  0: {id:0, 增产:1, 加速:1, 电力:1},
  1141:{id:1141, 增产:1.125, 加速:1.25, 电力:1.3, 次数:12},
  1142:{id:1142, 增产:1.2, 加速:1.5, 电力:1.7, 次数:24},
  1143:{id:1143, 增产:1.25, 加速:2, 电力:2.5, 次数:60},
};
const 透镜加成 = { 0:1, 1209:2, 1211:4 };
const 持续接收加成 = 2.5;
const 接收站光子模式功率 = 48_000;  // kW
const 接收站直接发电功率 = 6_000;
const 光子热值 = 1_200_000;        // kJ
const 质能燃料加成 = {
  1803:{id:1803, 功率加成:1, 热值:7_200_000},
  1804:{id:1804, 功率加成:2, 热值:72_000_000},
};
const 小太阳基础功率 = 72_000;
const 化学燃料热值 = {
  1006: 2_700,    // 煤矿
  1109: 6_750,    // 高能石墨
  1141: 3_240,    // 增产剂 Mk.I
  1128: 9_720,    // 燃烧单元
  1007: 4_050,    // 原油
  1114: 4_500,    // 精炼油
  1120: 9_000,    // 氢
  1121: 9_000,    // 重氢
  1011: 4_800,    // 可燃冰
  1801: 54_000,   // 液氢燃料棒
};

function 新建统计() {
  return {
    建筑统计: new Map(),
    地基统计: new Map(),

    物流详情: new Map(),
    配方详情: new Map(),
    科研站: 0,
    光子锅: 0,
    分馏塔: 0,
    弹射器: 0,
    发射井: 0,
    满电池生产: 0,
    满电池消耗: 0,

    功率: {      // kW
      待机: 0,
      运行: 0,
      运行_增产剂: 0,
      运输站: 0,
    },

    发电设施: new Map(),

    电池: 0,
  };
}

function 新建统计设置() {
  return {
    使用增产剂: 1143,
    使用透镜: 1211,
    使用质能燃料: 1804,
    使用化学燃料: 0,
  };
}

function 统计蓝图(blueprint) {
  const 统计 = 新建统计();
  if (!blueprint) return 统计;

  function 记录配方(id, 数量, 模式) {
    let 用量 = 统计.配方详情.get(id);
    if (!用量) {
      const 配方 = recipeData(id);
      if (!配方) return;
      用量 = { 配方, 增产数量: 0, 加速数量: 0 };
      统计.配方详情.set(id, 用量);
    }
    if (模式 == 0) 用量.增产数量 += 数量;
    else if (模式 == 1) 用量.加速数量 += 数量;
  }

  function 处理配方(building) {
    const 模式 = recipeProductive(building.recipeId)
      ? (building.parameters?.acceleratorMode == 1 ? 1 : 0)
      : 1;
    if (building.recipeId > 0) 记录配方(building.recipeId, buildingSpeed(building.itemId), 模式);
  }

  function 添加发电设施(id, n = 1) {
    统计.发电设施.set(id, (统计.发电设施.get(id) ?? 0) + n);
  }

  function 记录功率(modelIndex, 增产加成 = false) {
    const 耗电 = buildingPower(modelIndex);
    统计.功率.待机 += 耗电.idle;
    if (增产加成) {
      统计.功率.运行_增产剂 += 耗电.work;
    } else {
      统计.功率.运行 += 耗电.work;
    }
  }

  function 记录物流(id, 类型, 供需) {
    let 物流 = 统计.物流详情.get(id);
    if (!物流) {
      物流 = new Object();
      统计.物流详情.set(id, 物流);
    }
    if (!物流[类型]) 物流[类型] = { 输入: false, 输出: false };
    if (供需 >= 0) 物流[类型].输入 = true;
    if (供需 <= 0) 物流[类型].输出 = true;
  }

  for (const building of blueprint.buildings ?? []) {
    if (!building || building.index < 0) continue;

    统计.建筑统计.set(building.itemId, (统计.建筑统计.get(building.itemId) ?? 0) + 1);

    if (isAssembler(building.itemId)) {
      处理配方(building);
      记录功率(building.modelIndex, true);
    } else if (isLab(building.itemId)) {
      const researchMode = building.parameters?.researchMode ?? 0;
      if (researchMode == 1) 处理配方(building);
      if (researchMode == 2) 统计.科研站 += 1;
      记录功率(building.modelIndex, true);
    } else if (building.itemId == 2314) {
      统计.分馏塔 += 1;
      统计.功率.运行_增产剂 += 3960;   // 4堆叠功率: work * 5.5
      统计.功率.待机 += buildingPower(building.modelIndex).idle;
    } else if (物流建筑.includes(building.itemId)) {
      const 最大充能功率 = (building.parameters?.workEnergyPerTick ?? 0) * 1_000;   // workEnergyPerTick 单位为 MW
      统计.功率.运输站 += 最大充能功率;
    } else if (building.itemId == 2316) {
      const 工作kW = (building.parameters?.workEnergyPerTick > 0
        ? building.parameters.workEnergyPerTick
        : 2.94) * 1000;
      const s = (building.parameters?.miningSpeed || 10000) / 10000;
      const k = s * s;
      统计.功率.待机 += 168;
      统计.功率.运行 += 工作kW * k + 168 * (1 - k);   // 168 kW = 待机功率
    } else if (building.itemId === 2208) {
      if ((building.parameters?.productId ?? 0) === 1208) 统计.光子锅 += 1;
      else 添加发电设施(2208);
    } else if (发电建筑.includes(building.itemId)) {
      添加发电设施(building.itemId);
    } else if (building.itemId === 2311) {
      统计.弹射器 += 1;
      记录功率(building.modelIndex, true);
    } else if (building.itemId === 2312) {
      统计.发射井 += 1;
      记录功率(building.modelIndex, true);
    } else {
      记录功率(building.modelIndex);
    }

    if ([2103, 2104].includes(building.itemId)) {
      const 是星际 = building.itemId == 2104;
      const 模式 = (n) => ({1:-1, 2:1}[n]);
      building.parameters?.storage?.forEach((物品栏) => {
        if (物品栏.itemId <= 0) return;
        const 本地模式 = 模式(物品栏.localRole);
        if (本地模式) 记录物流(物品栏.itemId, '本地', 本地模式);
        if (!是星际) return;
        const 星际模式 = 模式(物品栏.remoteRole);
        if (星际模式) 记录物流(物品栏.itemId, '星际', 星际模式);
      });
    } else if (building.itemId === 2107 && building.filterId > 0) {
      const 机甲供需 = building.parameters?.playerMode;
      const 供需 = { 1:1, 2:0, 3:-1 }[机甲供需];
      if (供需 !== undefined) 记录物流(building.filterId, '伊卡洛斯', 供需);
      const 配送器间 = building.parameters?.storageMode;
      const 模式 = {1:-1, 2:1}[配送器间];
      if (模式) 记录物流(building.filterId, '配送', 模式);
    }

    if (building.itemId === 2209) {
      const 模式 = building.parameters?.mode ?? 0;
      if (模式 == 1) 统计.满电池生产 += 1;
      if (模式 == -1) 统计.满电池消耗 += 1;
    }
    if (building.itemId === 2206) {
      统计.电池 += 1;
    }
  }

  const rects = blueprint.reformData?.rects ?? [];
  for (const rect of rects) {
    const cells = rect.w * rect.h;
    统计.地基统计.set(rect.type, (统计.地基统计.get(rect.type) ?? 0) + cells);
  }

  return 统计;
}

function 计算设施数量(统计) {
  let 数量 = 0;
  for (const n of 统计.建筑统计.values()) 数量 += n;
  return 数量;
}

function 计算地基数量(统计) {
  let 数量 = 0;
  for (const n of 统计.地基统计.values()) 数量 += n;
  return 数量;
}

function 计算包含设施(统计) {
  const 设施 = new Map(统计.建筑统计);
  const 地基数量 = 计算地基数量(统计);
  if (地基数量 > 0) 设施.set(1131, (设施.get(1131) ?? 0) + 地基数量);

  return [...设施].map(([id, 数量]) => ({
    id,
    名字: itemName(id),
    数量,
  }));
}

function 计算包含地基(统计) {
  const 无装饰 = 统计.地基统计.get(7) ?? 0;
  const 总数 = 计算地基数量(统计);
  return { 总数, 带装饰: 总数 - 无装饰, 无装饰 };
}

function 当前增产剂(增产剂) {
  return 增产剂加成[增产剂] ?? 增产剂加成[0];
}

function 增产功率(增产剂) {
  return 当前增产剂(增产剂).电力;
}

function 透镜倍率(使用透镜) {
  return 透镜加成[使用透镜] ?? 1;
}

function 计算生产详情(统计, 设置) {
  const 生产数据 = {};
  const 添加产出 = (id, n) => {
    if (!生产数据[id]) 生产数据[id] = {产出:n, 消耗:0};
    else 生产数据[id].产出 += n;
  };
  const 添加消耗 = (id, n) => {
    if (!生产数据[id]) 生产数据[id] = {产出:0, 消耗:n};
    else 生产数据[id].消耗 += n;
  };

  const 增产剂 = 当前增产剂(设置.使用增产剂);
  const 添加增产剂消耗 = (喷涂量) => {
    const 喷涂次数 = Math.trunc(增产剂.次数 * 增产剂.增产) - 1;   // 自喷涂
    添加消耗(增产剂.id, 喷涂量 / 喷涂次数);
  };

  for (const {配方, 增产数量, 加速数量} of 统计.配方详情.values()) {
    const 配方时间 = 配方.time / 60 / 60;   // min

    配方.out.forEach((产物) => {
      const 配方速度 = 产物.count / 配方时间;
      const 生产倍率 = 增产数量 * 增产剂.增产 + 加速数量 * 增产剂.加速;
      添加产出(产物.id, 配方速度 * 生产倍率);
    });

    配方.in.forEach((原料) => {
      const 配方速度 = 原料.count / 配方时间;
      const 消耗倍率 = 增产数量 + 加速数量 * 增产剂.加速;
      const 消耗速度 = 配方速度 * 消耗倍率;
      添加消耗(原料.id, 消耗速度);
      if (增产剂.id > 0) 添加增产剂消耗(消耗速度);
    });
  }

  if (统计.光子锅 > 0) {
    const 光子产量 = 接收站光子模式功率 * 持续接收加成 / 光子热值 * 60;   // /min
    添加产出(1208, 统计.光子锅 * 光子产量 * 透镜倍率(设置.使用透镜) * 增产剂.加速);
  }
  if (统计.建筑统计.get(2208) > 0 && 设置.使用透镜 > 0) {
    const 消耗速度 = 0.1 * 统计.建筑统计?.get(2208);
    添加消耗(设置.使用透镜, 消耗速度);
    if (增产剂.id > 0) 添加增产剂消耗(消耗速度);
  }
  if (统计.分馏塔 > 0) {
    const 生产 = 统计.分馏塔 * 72 * 增产剂.加速;
    添加产出(1121, 生产);
    添加消耗(1120, 生产);
    if (增产剂.id > 0) 添加增产剂消耗(生产);
  }
  if (统计.弹射器 > 0) {
    const 消耗 = 统计.弹射器 * 20 * 增产剂.加速;
    添加消耗(1501, 消耗);
    if (增产剂.id > 0) 添加增产剂消耗(消耗);
  }
  if (统计.发射井 > 0) {
    const 消耗 = 统计.发射井 * 5 * 增产剂.加速;
    添加消耗(1503, 消耗);
    if (增产剂.id > 0) 添加增产剂消耗(消耗);
  }
  if (统计.发电设施.get(2210) > 0) {
    const 质能燃料 = 质能燃料加成[设置.使用质能燃料] ?? 质能燃料加成[1803];
    const 单台消耗 = 小太阳基础功率 / 质能燃料.热值 * 质能燃料.功率加成 * 60;   // /min
    const 消耗 = 单台消耗 * 增产剂.加速 * 统计.发电设施.get(2210);
    添加消耗(质能燃料.id, 消耗);
    if (增产剂.id > 0) 添加增产剂消耗(消耗);
  }
  if (统计.发电设施.get(2211) > 0) {
    const 单台消耗 = 15_000 / 600_000 * 60;   // /min
    const 消耗 = 单台消耗 * 统计.发电设施.get(2211);
    添加消耗(1802, 消耗);
    if (增产剂.id > 0) 添加增产剂消耗(消耗);
  }
  const 化学热值 = 化学燃料热值[设置.使用化学燃料] ?? 0;
  if (统计.发电设施.get(2204) > 0 && 设置.使用化学燃料 > 0 && 化学热值 > 0) {
    const 单台消耗 = 2_160 / 0.8 / 化学热值 * 60;
    const 消耗 = 单台消耗 * 统计.发电设施.get(2204);
    添加消耗(设置.使用化学燃料, 消耗);
    if (增产剂.id > 0) 添加增产剂消耗(消耗);
  }

  if (统计.满电池生产 > 0) {
    const 生产 = 统计.满电池生产 * 6 * 增产剂.加速;
    添加产出(2207, 生产);
    添加消耗(2206, 生产);
  }
  if (统计.满电池消耗 > 0) {
    const 生产 = 统计.满电池消耗 * 6 * 增产剂.加速;
    添加产出(2206, 生产);
    添加消耗(2207, 生产);
  }

  return Object.entries(生产数据)
    .filter(([id]) => id > 0)
    .map(([id, {产出, 消耗}]) => ({
      id: Number(id),
      名字: itemName(id),
      净产: 产出 - 消耗,
      产出,
      消耗,
      物流: 统计.物流详情.get(Number(id))
    }));
}

function 计算蓝图耗电(统计, 设置) {
  const 增产剂 = 当前增产剂(设置.使用增产剂);
  let 电池生产耗电 = 0;
  if (统计.满电池生产 > 0) 电池生产耗电 = 统计.满电池生产 * 54_000 * 增产剂.加速;
  return 统计.功率.运行 + 统计.功率.运行_增产剂 * 增产剂.电力 + 电池生产耗电;
}

function 计算功率(统计, 设置) {
  const 峰值 = 计算蓝图耗电(统计, 设置);
  const 充能 = 统计.功率?.运输站 ?? 0;
  return {
    峰值功率: 峰值,
    运输站充能: 充能,
    峰值功率文本: fmtKW(峰值),
    运输站充能文本: fmtKW(充能),
  };
}

function 计算电力设施(统计, 设置) {
  const 增产剂 = 当前增产剂(设置.使用增产剂);
  const 质能燃料 = 质能燃料加成[设置.使用质能燃料] ?? 质能燃料加成[1803];
  const 计算发电量 = (id, 数量) => {
    if (id === 2210) return fmtKW(小太阳基础功率 * 质能燃料.功率加成 * 增产剂.加速 * 数量);
    if (id === 2211) return fmtKW(15_000 * 增产剂.增产 * 数量);
    if (id === 2208) return 'MAX ' + fmtKW(接收站直接发电功率 * 持续接收加成 * 透镜倍率(设置.使用透镜) * 增产剂.加速 * 数量);
    if (id === 2204) return 设置.使用化学燃料 > 0 ? fmtKW(2_160 * 增产剂.增产 * 数量) : '';
    return '';
  }
  const 设施 = [...(统计.发电设施 ?? [])].map(([id, 数量]) => ({
    id,
    名字: itemName(id),
    数量,
    备注: 计算发电量(id, 数量),
    标注: '',
  }));
  if ((统计.满电池消耗 ?? 0) > 0) {
    设施.push({ id: 2209, 名字: itemName(2209), 数量: 统计.满电池消耗, 备注: '', 标注: '放电' });
  }
  if ((统计.满电池生产 ?? 0) > 0) {
    设施.push({ id: 2209, 名字: itemName(2209), 数量: 统计.满电池生产, 备注: '', 标注: '充电' });
  }
  if ((统计.电池 ?? 0) > 0) {
    设施.push({
      id: 2206,
      名字: itemName(2206),
      数量: 统计.电池,
      备注: `蓄电量: ${fmtKJ(540_000 * 统计.电池)}`,
      标注: '',
    });
  }
  return 设施;
}

export {
  新建统计设置,
  统计蓝图,
  计算包含设施,
  计算设施数量,
  计算包含地基,
  计算生产详情,
  计算蓝图耗电,
  计算功率,
  计算电力设施,
};
