// 将 HSVA 颜色转换为 0-255 范围的 RGBA 对象
function hsvaToRgba(h, s, v, a = 1.0) {
  if (s === 0) {
    const gray = Math.round(v * 255);
    return { r: gray, g: gray, b: gray, a: Math.round(a * 255) };
  }

  const hh = (h % 1) * 6;
  const i = Math.floor(hh);
  const ff = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * ff);
  const t = v * (1 - s * (1 - ff));
  let r = 0;
  let g = 0;
  let b = 0;

  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
    default:
      r = v;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: Math.round(a * 255),
  };
}

// 将 #RRGGBB 颜色转换为 0-255 范围的 RGBA 对象
function hexToRgba(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new TypeError('颜色格式必须为 #RRGGBB');
  }

  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
    a: 255,
  };
}

// 将轨道的四元数转换为倾角和升交点经度
function quaternionToOrbitParams(orbit) {
  const x = orbit.x, y = orbit.y, z = orbit.z, w = orbit.w;
  const halfInclSin = Math.hypot(x, z);
  const halfInclCos = Math.hypot(y, w);
  const rad2deg = 180 / Math.PI;
  const inclination = 2.0 * Math.atan2(halfInclSin, halfInclCos) * rad2deg;
  const longAscNode = 2.0 * Math.atan2(-y, w) * rad2deg;
  return {
    inclination: ((inclination % 360) + 360) % 360,
    ascendingNode: ((longAscNode % 360) + 360) % 360,
  };
}

// 将轨道倾角和升交点经度转换为轨道四元数
function orbitParamsToQuaternion(inclination, ascendingNode) {
  const deg2rad = Math.PI / 180;
  const hInc = (((inclination % 360) + 360) % 360) * deg2rad / 2;
  const hLan = (((ascendingNode % 360) + 360) % 360) * deg2rad / 2;
  const sz = Math.sin(-hInc), cz = Math.cos(-hInc);
  const sy = Math.sin(-hLan), cy = Math.cos(-hLan);
  return {
    x: sy * sz,
    y: sy * cz,
    z: cy * sz,
    w: cy * cz,
  };
}

// 经纬度（度）→ 直角坐标。
// 游戏约定：经度 0° = -Z 方向、东 = +X、+Y 为北极
function latLonToCoord(lng, lat, radius = 100000) {
  const lngRad = lng * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  return {
    x: radius * Math.cos(latRad) * Math.sin(lngRad),
    y: radius * Math.sin(latRad),
    z: -radius * Math.cos(latRad) * Math.cos(lngRad),
  };
}

// 直角坐标 → 经纬度（度）与半径
function coordToLatLon(coord) {
  const radius = Math.hypot(coord.x, coord.y, coord.z) || 1;
  const latRad = Math.asin(Math.max(-1, Math.min(1, coord.y / radius)));
  const lngRad = Math.atan2(coord.x, -coord.z);
  return {
    lng: lngRad * 180 / Math.PI,
    lat: latRad * 180 / Math.PI,
    radius,
  };
}


const BLUEPRINT_TYPE_NAMES = {
  1: '单层戴森壳',
  2: '多层戴森壳',
  3: '戴森云',
  4: '戴森球(包含壳、云)',
};

// 根据蓝图类型 id 返回中文类型名称
function blueprintTypeName(typeId) {
  return BLUEPRINT_TYPE_NAMES[typeId] ?? `未知类型(${typeId})`;
}

/**
 * 识别蓝图的类型 id（1-4）
 * @param {object} blueprint - parseBlueprintString 的返回值或任意疑似蓝图的对象
 * @returns {number|null}
 *   1=单层壳  2=多层壳  3=戴森云  4=壳+云
 *   -1 = 结构非法
 *   null = 无法识别
 */
function getBodyTypeId(body) {
  if (!body || typeof body !== 'object') return null;
  const { singleShell, dysonShell, dysonCloud } = body;
  // 单层壳与壳/云互斥，同时出现视为非法数据
  if (singleShell && (dysonShell || dysonCloud)) return -1;
  if (singleShell) return 1;
  if (dysonShell && dysonCloud) return 4;
  if (dysonShell) return 2;
  if (dysonCloud) return 3;
  return null;
}

const GRID_TYPE_NAMES = {
  0: '经纬线网格',
  1: '二十面体网格',
  2: '八面体网格',
  3: '四面体网格',
};

function gridTypeName(gridType) {
  return GRID_TYPE_NAMES[gridType] ?? `未知(${gridType})`;
}

// 统计已涂色格子数
function countPaintedCells(colors) {
  if (!colors) return 0;
  let n = 0;
  for (let i = 0; i < colors.length; i += 1) {
    const c = colors[i];
    if (c && c.a > 0) n += 1;
  }
  return n;
}

/**
 * 计算单壳纬度限制：所有节点最大纬度（度）向下取整
 * @param {object} shell - 单壳数据
 * @returns {number} 无壳数据时为 0
 */
function calcSingleShellLatLimit(shell) {
  let maxLat = 0;
  const nodes = shell?.nodes ?? [];
  for (let i = 1; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node) continue;
    const { lat } = coordToLatLon(node.coordinate);
    if (Math.abs(lat) > maxLat) maxLat = Math.abs(lat);
  }
  return Math.floor(maxLat);
}

/**
 * 计算纬度限制：所有节点最大纬度（度）向下取整
 * @param {object} blueprint - 蓝图对象
 * @returns {number} 无壳数据时为 0
 */
function calcLatLimit(blueprint) {
  if (blueprint.typeId === 1) {
    return calcSingleShellLatLimit(blueprint.singleShell);
  }

  let maxLat = 0;
  for (const shell of blueprint.dysonShell?.shells ?? []) {
    maxLat = Math.max(maxLat, calcSingleShellLatLimit(shell));
  }
  return maxLat;
}

// 将无序节点对编码为字符串 key，用于集合查找
function edgeKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
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
    newNodes.push({ ...node, id: newNodeId });
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
      newList.push({ ...item, id: newId, relation: newRelation });
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

export {
  hsvaToRgba,
  hexToRgba,
  quaternionToOrbitParams,
  orbitParamsToQuaternion,
  latLonToCoord,
  coordToLatLon,
  blueprintTypeName,
  getBodyTypeId,
  gridTypeName,
  countPaintedCells,
  calcSingleShellLatLimit,
  calcLatLimit,
  cleanOrphanedComponents,
  compactAndRebuildIds,
  edgeKey,
};
