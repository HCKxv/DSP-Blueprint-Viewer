import { blueprintTypeName, getBodyTypeId, orbitParamsToQuaternion, hexToRgba } from './sphereUtils.js';
import { cloneData, toPlainCopy } from '../clonePlain.js';

// 将无序节点对编码为字符串 key，用于集合查找
function edgeKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/**
 * 生成戴森云
 * @param {number} radius - 云轨道半径
 * @param {Array<[number, number, number]>} orbitParams - 轨道参数 [倾角, 条数, 起始交升点]，
 *   每条都会自动补一条镜像轨道（倾角 180-x、交升点 +180），所以最多十条
 * @returns {{visibility: object, orbits: object[], colors: never[]}}
 */
function buildCloud(radius, orbitParams) {
  const orbits = [];
  const visibility = { editor: {}, inGame: {} };

  const addGroup = (inclination, count, startNode) => {
    for (let i = 0; i < count; i += 1) {
      const id = orbits.length + 1;
      orbits.push({ id, radius, ...orbitParamsToQuaternion(inclination, startNode + (360 / count) * i) });
      visibility.editor[id] = true;
      visibility.inGame[id] = true;
    }
  };

  for (const [inclination, count, startNode] of orbitParams) {
    addGroup(inclination, count, startNode);
    addGroup(180 - inclination, count, startNode + 180);
  }

  return { visibility, orbits, colors: [] };
}

// 清理框架中引用已删除节点的项，以及壳面中边不在框架中的项
function cleanOrphanedComponents(shell) {
  // 收集所有有效节点 id
  const nodeIds = new Set();
  const nodes = shell.nodes;
  for (let i = 1; i < nodes.length; i += 1) {
    if (nodes[i] != null) {
      nodeIds.add(nodes[i].id);
    }
  }

  // 清理框架：引用的节点不存在 → 标记为 null
  const frames = shell.frames;
  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame == null) continue;
    if (!frame.relation.every(pid => nodeIds.has(pid))) {
      frames[i] = null;
    }
  }

  // 收集所有有效框架端点（无序节点对）
  const frameEndpoints = new Set();
  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame == null) continue;
    frameEndpoints.add(edgeKey(frame.relation[0], frame.relation[1]));
  }

  // 清理壳面：少于 2 个节点，或任一边不在框架端点集合中 → 标记为 null
  const faces = shell.faces;
  for (let i = 1; i < faces.length; i += 1) {
    const face = faces[i];
    if (face == null) continue;
    const rel = face.relation;
    if (rel.length < 2) {
      faces[i] = null;
      continue;
    }
    // 构建壳面的所有边（相邻节点对，含首尾闭合边）
    const edges = [];
    for (let j = 0; j < rel.length - 1; j += 1) {
      edges.push(edgeKey(rel[j], rel[j + 1]));
    }
    edges.push(edgeKey(rel[rel.length - 1], rel[0]));

    if (!edges.every(e => frameEndpoints.has(e))) {
      faces[i] = null;
    }
  }
}

// 移除空位，重建连续 id，更新所有引用关系
function compactAndRebuildIds(shell) {
  cleanOrphanedComponents(shell);

  // 重建节点列表，建立旧→新 id 映射
  const nodeIdMap = {};
  const newNodes = [null];
  let newNodeId = 1;
  for (let i = 1; i < shell.nodes.length; i += 1) {
    const node = shell.nodes[i];
    if (node == null) continue;
    nodeIdMap[node.id] = newNodeId;
    newNodes.push({ ...toPlainCopy(node), id: newNodeId });
    newNodeId += 1;
  }

  // 通用重建函数：过滤空位，更新节点引用，重新分配连续 id
  function rebuildList(oldList) {
    const newList = [null];
    let newId = 1;
    for (let i = 1; i < oldList.length; i += 1) {
      const item = oldList[i];
      if (item == null) continue;
      const newRelation = item.relation.map(pid => nodeIdMap[pid]);
      newList.push({ ...toPlainCopy(item), id: newId, relation: newRelation });
      newId += 1;
    }
    return newList;
  }

  shell.nodes = newNodes;
  shell.frames = rebuildList(shell.frames);
  shell.faces = rebuildList(shell.faces);

  // 涂色网格颜色全为默认值 (0,0,0,0) 时清空
  if (shell.fillGrid && shell.fillGrid.colors) {
    if (shell.fillGrid.colors.every(c => c.r === 0 && c.g === 0 && c.b === 0 && c.a === 0)) {
      shell.fillGrid.colors = null;
    }
  }
}

/**
 * 从蓝图中提取指定壳层，生成单层壳蓝图
 * @param {object} blueprint - 蓝图对象（与 parseBlueprintString 返回值同构）
 * @param {number} shellId - 壳层 id
 * @returns {object} 单层壳蓝图对象 { header, typeId: 1, singleShell }
 * @throws 蓝图缺少戴森壳或壳层不存在时
 */
function extractSingleShell(blueprint, shellId) {
  if ( ![2, 4].includes(getBodyTypeId(blueprint)) ) {
    throw new Error('蓝图不包含戴森壳，无法提取壳层');
  }

  const shell = blueprint.dysonShell.shells?.[shellId];
  if (!shell || typeof shell !== 'object') {
    throw new Error(`未找到壳层 ${shellId}`);
  }

  const copy = cloneData(shell);

  const header = cloneData(blueprint.header ?? {});

  return {
    header,
    typeId: 1,
    typeName: blueprintTypeName(1),
    singleShell: copy,
  };
}

/**
 * 从戴森球中提取戴森壳或戴森云
 * @param {object} blueprint - 戴森球蓝图对象 typeId: 4
 * @param {('shell' | 'cloud')} type - 提取类型
 * @returns {object} 戴森壳或戴森云蓝图对象 typeId: 2|3
 */
function extractStructure(blueprint, type){
  if (type !== 'shell' && type !== 'cloud') {
    throw new Error('Structure 必须是 "shell" 或 "cloud"');
  }

  if (getBodyTypeId(blueprint) !== 4){
    throw new Error('不是戴森球蓝图，无法提取戴森壳或戴森云');
  }

  const header = cloneData(blueprint.header ?? {});
  const result = { header }

  if (type === 'shell') {
    result.dysonShell = cloneData(blueprint.dysonShell);
  } if (type === 'cloud') {
    result.dysonCloud = cloneData(blueprint.dysonCloud);
  }

  result.typeId = getBodyTypeId(result);
  result.typeName = blueprintTypeName(result.typeId);

  return result;
};

/**
 * 将 RGBA 颜色转换为稳定的查找键
 * @param {{r: number, g: number, b: number, a: number}} color
 * @returns {string}
 */
function rgbaColorKey(color) {
  return color.a === 0 ? '默认颜色' : `${color.r},${color.g},${color.b},${color.a}`;
}

/**
 * 按 RGBA 值去重颜色，保留首次出现的顺序
 * @param {(object|null)[]} colors - RGBA 颜色数组
 * @returns {(object|null)[]} 去重后的颜色数组
 */
function deduplicateColors(colors) {
  if (!Array.isArray(colors)) {
    throw new TypeError('颜色列表必须是数组');
  }

  const seen = new Set();
  const result = [];
  for (const color of colors) {
    if (color == null) {
      if (!seen.has(null)) {
        seen.add(null);
        result.push(null);
      }
      continue;
    }
    const key = rgbaColorKey(color);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cloneData(color));
  }
  return result;
}

/**
 * 从壳层中提取节点、框架和壳面的去重颜色列表
 * @param {object} shell - 壳层对象
 * @returns {{节点: (object|null)[], 框架: (object|null)[], 壳面: (object|null)[]}}
 */
function extractShellColorList(shell) {
  if (!shell || typeof shell !== 'object') {
    throw new TypeError('壳层数据必须是对象');
  }

  const extractColors = (components) => {
    if (!Array.isArray(components)) return [];
    return deduplicateColors(components.slice(1)
      .filter(component => component != null)
      .map(component => component.color));
  };

  return {
    节点: extractColors(shell.nodes),
    框架: extractColors(shell.frames),
    壳面: extractColors(shell.faces),
  };
}

/**
 * 从多层戴森壳对象中提取节点、框架和壳面的去重颜色列表
 * @param {object} dysonShell - 多层戴森壳对象
 * @returns {{节点: (object|null)[], 框架: (object|null)[], 壳面: (object|null)[]}}
 */
function extractDysonShellColorList(dysonShell) {
  if (!dysonShell || typeof dysonShell !== 'object') {
    throw new TypeError('戴森壳数据必须是对象');
  }
  if (!Array.isArray(dysonShell.shells)) {
    throw new TypeError('戴森壳数据缺少壳层列表');
  }

  const colors = { 节点: [], 框架: [], 壳面: [] };
  for (const shell of dysonShell.shells) {
    if (shell == null) continue;
    const shellColors = extractShellColorList(shell);
    colors.节点.push(...shellColors.节点);
    colors.框架.push(...shellColors.框架);
    colors.壳面.push(...shellColors.壳面);
  }

  return {
    节点: deduplicateColors(colors.节点),
    框架: deduplicateColors(colors.框架),
    壳面: deduplicateColors(colors.壳面),
  };
}

/**
 * 在蓝图副本中按 RGBA 映射替换单层壳或多层壳颜色
 * @param {object} blueprint - 原始蓝图
 * @param {Record<string, object>} entries - 原颜色及十六进制目标颜色
 * @param {{node:boolean, frame:boolean, face:boolean}} options
 * @returns {object} 替换后的蓝图副本
 */
function replaceBlueprintShellColors(blueprint, entries, options = {}) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new TypeError('蓝图数据必须是对象');
  }
  if (!entries || typeof entries !== 'object') {
    throw new TypeError('颜色替换项必须是对象');
  }

  const bodyTypeId = getBodyTypeId(blueprint);
  if (![1, 2, 4].includes(bodyTypeId)) {
    throw new Error('蓝图不包含戴森壳');
  }

  const copy = cloneData(blueprint);
  const shells = bodyTypeId === 1
    ? [copy.singleShell]
    : copy.dysonShell?.shells;
  if (!Array.isArray(shells)) {
    throw new TypeError('蓝图缺少数据');
  }

  for (const shell of shells) {
    if (!shell) continue;
    const lists = [];
    if (options.node) lists.push(shell.nodes);
    if (options.frame) lists.push(shell.frames);
    if (options.face) lists.push(shell.faces);
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (let i = 1; i < list.length; i += 1) {
        const component = list[i];
        if (!component) continue;
        const color = component.color;
        const Key = color === null ? '默认颜色' : rgbaColorKey(color);
        component.color = entries[Key] ?? color;
      }
    }
  }

  return copy;
}

/**
 * 自动轨道弹射用的云轨道参数: [倾角, 条数, 起始交升点]
 * 每条镜像出一条（倾角 180-x、交升点 +180），一共 20 条
 */
const AUTO_ORBIT_PARAMS = [[90, 1, 0], [75, 3, 0], [40, 6, 30]];

/**
 * 将单层壳复制为多层戴森壳
 *
 * @param {object} blueprint - 单层壳蓝图对象 typeId: 1
 * @param {object} options
 * @param {number} options.radius - 源壳层轨道半径
 * @param {number} options.inclination - 轨道倾角（度）
 * @param {number} options.ascendingNode - 升交点经度（度）
 * @param {number} options.count - 复制次数（最终壳层数，1-10）
 * @param {number} options.step - 相邻层半径步长（不小于 1000）
 * @param {number} options.direction - 1 递增 / -1 递减
 * @param {boolean} [options.autoOrbitCloud] - 是否附带戴森云
 * @returns {object} 多层戴森壳蓝图对象（typeId 2；带云时 typeId 4）
 * @throws 蓝图不是单层壳、参数非法或层半径低于 4000 时
 */
function copyShell(blueprint, options = {}) {
  if (getBodyTypeId(blueprint) !== 1) {
    throw new Error('不是单层壳蓝图，无法复制到多层');
  }
  const source = blueprint.singleShell;
  if (!source || !Array.isArray(source.nodes)) {
    throw new Error('单层壳缺少节点数据');
  }

  const radius = Number(options.radius);
  const count = Math.floor(Number(options.count));
  const step = Number(options.step);
  const direction = Number(options.direction) < 0 ? -1 : 1;
  const inclination = options.inclination == null ? 0 : Number(options.inclination);
  const ascendingNode = options.ascendingNode == null ? 0 : Number(options.ascendingNode);
  const withCloud = !!options.autoOrbitCloud;

  if (!Number.isFinite(radius) || radius < 4000) {
    throw new Error('轨道半径不能小于 4000');
  }
  if (!Number.isFinite(inclination)) {
    throw new Error('轨道倾角不是有效数字');
  }
  if (!Number.isFinite(ascendingNode)) {
    throw new Error('交升点经度不是有效数字');
  }
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error('复制次数需为 1-10 的整数（最终壳层数最多 10）');
  }
  if (!Number.isFinite(step) || step < 1000) {
    throw new Error('步长不能小于 1000');
  }

  const minRadius = radius + direction * step * (count - 1);
  if (minRadius < 4000) {
    throw new Error(`最外层半径 ${Math.round(minRadius)} 低于 4000，请调整参数`);
  }

  const quat = orbitParamsToQuaternion(inclination, ascendingNode);

  const orbitList = [null];
  const shells = [null];
  let maxLayerRadius = 0;
  for (let i = 0; i < count; i += 1) {
    const layerRadius = Math.round(radius + direction * step * i);
    const id = i + 1;
    orbitList.push({ id, radius: layerRadius, ...quat });
    if (layerRadius > maxLayerRadius) maxLayerRadius = layerRadius;

    shells.push(cloneData(source));
  }

  const visibility = { editor: {}, inGame: {} };
  for (let i = 1; i <= count; i += 1) {
    visibility.editor[i] = true;
    visibility.inGame[i] = true;
  }

  const header = cloneData(blueprint.header ?? {});

  const typeId = withCloud ? 4 : 2;
  const result = {
    header,
    typeId,
    typeName: blueprintTypeName(typeId),
    dysonShell: { visibility, orbitList, shells },
  };
  if (withCloud) {
    result.dysonCloud = buildCloud(maxLayerRadius, AUTO_ORBIT_PARAMS);
  }

  return result;
}

export { cleanOrphanedComponents, compactAndRebuildIds, extractSingleShell, extractShellColorList, extractDysonShellColorList, replaceBlueprintShellColors, extractStructure, copyShell, deduplicateColors, rgbaColorKey };
