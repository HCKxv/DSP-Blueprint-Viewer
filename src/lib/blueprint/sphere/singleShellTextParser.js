/**
 * 
节点:
  X, Y, Z || 经, 纬  // 例如: 3543,1328,1297 或 116.4,39.9
  ...（换行或者间隔“;”表示下一个节点）
框架:(可选)
  节点A, 节点B, 类型(测地/经纬 || 0/1)   // 例如: 5,9,测地
  ...（同上）
壳面:(可选)
  节点序号, ...  // 例如: 1,2,3
  ...（同上）
样式:(可选)
  节点,框架,壳面(#RRGGBB)  // 第一行是颜色行, 可留空, 例如: ,,#EE1C25
  框架,壳面(编号或名字)  // 样式行, 可留空

 * 支持全角/半角符号; 节点序号从 1 开始;
 * 壳面样式编号与名字：0-蜂巢, 1-锁子, 2-棱形, 3-鱼鳞, 4-十字, 5-电路, 6-三六边形嵌套;
 * 框架样式编号：1, 2, 3;
 */

import { hexToRgba, latLonToCoord, blueprintTypeName, calcSingleShellLatLimit } from './sphereUtils.js';
import { getCurrentTicks, ticksTime } from '../utils.js';

const 壳面图案转编号 = {
  蜂巢: 0,
  锁子: 1,
  棱形: 2,
  鱼鳞: 3,
  十字: 4,
  电路: 5,
  三六边形嵌套: 6,
};

const 框架类型转编号 = {
  测地: 0,
  经纬: 1,
};

function 提取编号(对象, 名字) {
  return Object.hasOwn(对象, 名字) ? 对象[名字] : undefined;
}

const 字段表 = ['节点', '框架', '壳面', '样式'];

function 解析组件项(输入) {
  if (!输入) return null;
  return 输入.replace(/,$/, '').split(',');
}

function 解析壳层描述(输入) {
  const 描述字符串 = 输入
    .trim()
    .replace(/ /g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[；;]/g, '\n')
    .replace(/，/g, ',')
    .replace(/：/g, ':');
  if (!描述字符串) return {};

  const 分段 = 描述字符串.split(new RegExp(`(?=(?:${字段表.join('|')}):)`));

  const 结果 = {};
  for (const 字段 of 字段表) {
    const 组件数据 = 分段.find(项 => 项.startsWith(字段 + ':'));
    if (!组件数据) continue;
    结果[字段] = 组件数据
      .slice(字段.length + 1)  // 去除字段名和后面的':'
      .trim()
      .split('\n')
      .map(解析组件项);
  }
  return 结果;
}

const 十进制数正则 = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const 十进制整数正则 = /^[+-]?\d+$/;

function 是数字(输入) {
  return 十进制数正则.test(输入);
}

function 是整数(输入) {
  return 十进制整数正则.test(输入);
}

function 处理样式编号(值, 下限, 上限, 样式名 = null) {
  const 样式编号 = 是整数(值)
    ? Number(值)
    : 样式名 ? 提取编号(样式名, 值) ?? null : null;

  if (样式编号 == null || 样式编号 < 下限 || 样式编号 > 上限) return null;
  return 样式编号;
}

function 处理结构颜色(值) {
  try {
    return hexToRgba(值);
  } catch {
    return null;
  }
}

function 处理样式数据(样式数据) {
  const 样式 = {
    节点: { 色:null },
    框架: { 色:null, 样式:null },
    壳面: { 色:null, 样式:null }
  }
  if (!(样式数据 && 样式数据[0])) return 样式;
  样式.节点.色 = 处理结构颜色(样式数据[0][0]);
  样式.框架.色 = 处理结构颜色(样式数据[0][1]);
  样式.壳面.色 = 处理结构颜色(样式数据[0][2]);
  if (!样式数据[1]) return 样式;
  样式.框架.样式 = 处理样式编号(样式数据[1][0], 1, 3);
  样式.壳面.样式 = 处理样式编号(样式数据[1][1], 0, 6, 壳面图案转编号);
  return 样式;
}

function 处理节点数据(数据, 下标, 样式) {
  const id = 下标 + 1;
  if (数据 === null) throw new Error(`节点${id}是空数据`);
  const 处理坐标 = 值 => {
    if (!是数字(值)) throw new Error(`节点${id}的坐标不是有效值`);
    return Number(值);
  }
  let 坐标;
  if ( 数据.length === 3 ) {
    const 直角坐标 = 数据.map(处理坐标);
    坐标 = {
      x: 直角坐标[0],
      y: 直角坐标[1],
      z: 直角坐标[2]
    }
  } else if ( 数据.length === 2 ) {
    const [经,纬] = 数据.map(处理坐标);
    if (Math.abs(纬) > 90) throw new RangeError(`节点 ${id} 的纬度必须在 ±90 内`);
    坐标 = latLonToCoord(经, 纬);
  } else{
    throw new Error(`节点${id}是无效数据`);
  }
  
  return {
    id,
    style: 0,
    coordinate: 坐标,
    spMax: 30,
    color: 样式.节点.色
  };
}

function 处理框架数据(数据, 下标, 节点列表, 样式) {
  const id = 下标 + 1;
  if (数据 === null) throw new Error(`框架${id}是空数据`);
  if ( 数据.length !== 3 ) throw new Error(`框架${id}是无效数据`);
  const 处理节点编号 = 值 => {
    if (是整数(值) && 节点列表[Number(值)]) return Number(值);
    throw new Error(`框架${id}两端的节点不是有效节点`);
  }
  const 类型 = 是整数(数据[2]) ? Number(数据[2]) : 提取编号(框架类型转编号, 数据[2]);
  if (类型 !== 0 && 类型 !== 1) throw new Error(`框架${id}的类型错误`);
  return {
    id,
    style: 样式.框架.样式 ?? 1,
    type: Number(类型),
    relation: [处理节点编号(数据[0]), 处理节点编号(数据[1])],
    spMax: 0,
    color: 样式.框架.色
  };
}

function 边键(节点A, 节点B) {
  return 节点A < 节点B ? `${节点A}-${节点B}` : `${节点B}-${节点A}`;
}

function 处理壳面数据(数据, 下标, 节点列表, 框架边集合, 样式) {
  const id = 下标 + 1;
  if (数据 === null) throw new Error(`壳面${id}是空数据`);
  if ( 数据.length < 2 ) throw new Error(`壳面${id}节点数小于2`);
  const 节点链接 = 数据.map((值) => {
    if (是整数(值) && 节点列表[Number(值)]) return Number(值);
    throw new Error(`壳面${id}顶点的节点不是有效节点`);
  });
  for (let i = 0; i < 节点链接.length; i += 1) {
    const 节点A = 节点链接[i];
    const 节点B = 节点链接[(i + 1) % 节点链接.length];
    if (!框架边集合.has(边键(节点A, 节点B))) {
      throw new Error(`壳面${id}的边${节点A}-${节点B}不存在对应框架`);
    }
  }
  return {
    id,
    pattern: 样式.壳面.样式 ?? 0,
    relation: 节点链接,
    cpPerVertex: 0,
    color: 样式.壳面.色
  };
}

export function 壳层描述转壳层数据(输入) {
  if (typeof 输入 !== 'string') throw new TypeError('壳层描述必须是字符串');

  let 壳层描述;
  try {
    壳层描述 = 解析壳层描述(输入);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`壳层描述格式错误：${message}`, { cause: e });
  }

  if (!壳层描述.节点) throw new Error('壳层描述缺少“节点”字段');

  const 样式 = 处理样式数据(壳层描述.样式);
  const 节点列表 = [null, ...壳层描述.节点.map((数据, 下标) => 处理节点数据(数据, 下标, 样式))];
  const 框架列表 = 壳层描述.框架
    ? [null, ...壳层描述.框架.map((数据, 下标) => 处理框架数据(数据, 下标, 节点列表, 样式))]
    : [null];
  const 框架边集合 = new Set(
    框架列表.slice(1).map(框架 => 边键(框架.relation[0], 框架.relation[1]))
  );
  const 壳面列表 = 壳层描述.壳面
    ? [null, ...壳层描述.壳面.map((数据, 下标) => 处理壳面数据(数据, 下标, 节点列表, 框架边集合, 样式))]
    : [null];

  return {
    nodes: 节点列表,
    frames: 框架列表,
    faces: 壳面列表,
    fillGrid: null
  };
  
}

export function 生成蓝图(输入) {
  const 壳 = 壳层描述转壳层数据(输入);
  const 时间戳 = getCurrentTicks();
  return {
    header: {
      createdTicks: 时间戳,
      createdAt: ticksTime(时间戳),
      version: '0.10.35.29151',
    },
    typeId: 1,
    typeName: blueprintTypeName(1),
    latLimit: calcSingleShellLatLimit(壳),
    singleShell: 壳
  }
}
