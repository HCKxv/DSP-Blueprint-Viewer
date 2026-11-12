/** shellLayerCompute — 整层戴森壳的纯几何计算（节点 / 框架 / 细胞 / 涂色网格） */
import * as THREE from 'three';
import {
  _convertBP, _normQuat, _edgeKey,
  _sphericalArcPoints, _gridArcPoints,
} from './geometry.js';
import { computeShellCellBuckets } from './shellCellsCompute.js';
import { buildPaintingGeometry } from '../../grid/shellGrid.js';

// 框架截面缩放
const FRAME_WORLD_SCALE = 100;

// 分段长度
const FRAME_SEG_LENGTH = 300;

// 框架网格 Z 范围
const FRAME_MESH_Z_MIN = -0.0217;
const FRAME_MESH_LENGTH = 1.0434;

// style 到 mesh 下标的偏移
const FRAME_STYLE_OFFSET = 1;

/**
 * 节点: id、位置（已缩放、已按轨道姿态旋转）、材质/涂色信息
 * @returns {{ids: Uint32Array, positions: Float32Array, paintRGBA: Float32Array, count: number}}
 */
export function computeNodes(shData, orbit, scale) {
  const renderR = orbit.radius;
  const shQuat = _normQuat(orbit);
  const ids = [];
  const positions = [];
  const paintRGBA = [];
  if (shData.nodes) {
    for (let ni = 1; ni < shData.nodes.length; ni++) {
      const nd = shData.nodes[ni];
      if (!nd) continue;
      const d = new THREE.Vector3(nd.coordinate.x, nd.coordinate.y, nd.coordinate.z).normalize();
      d.applyQuaternion(shQuat);
      const pos = _convertBP(d).multiplyScalar(renderR * scale);
      ids.push(nd.id);
      positions.push(pos.x, pos.y, pos.z);
      const c = nd.color;
      // a 只是涂色标记，不是透明度
      const paintedFlag = c && typeof c.a === 'number' ? c.a : 0;
      if (paintedFlag > 0) {
        const col = new THREE.Color((c.r << 16) | (c.g << 8) | c.b);
        paintRGBA.push(col.r, col.g, col.b, 1);
      } else {
        paintRGBA.push(0, 0, 0, 0);
      }
    }
  }
  return {
    ids: new Uint32Array(ids),
    positions: new Float32Array(positions),
    paintRGBA: new Float32Array(paintRGBA),
    count: ids.length,
  };
}

/**
 * 框架杆件: 按段长切分，输出每种 style 的实例矩阵与涂色。
 * 网格由主线程按 style 构建，这里只算实例变换。
 * @param {Map<number, THREE.Vector3>} nodeMap
 * @param {number} orbitRadius  蓝图半径（不是缩放后的渲染半径）
 * @returns {{instances: Array<{style:number,count:number,matrices:Float32Array,
 *   paintRGBA:Float32Array}>, edgeTypes: Array<[string, number]>}}
 */
export function computeFrames(shData, nodeMap, shPole, scale, orbitRadius) {
  const ftMap = new Map();
  const frameList = [];
  const styleCounts = [0, 0, 0];
  const radius = Number.isFinite(orbitRadius) && orbitRadius > 0 ? orbitRadius : 10000;

  // 第一遍: 去重、按 style 统计段数
  if (shData.frames) {
    shData.frames.forEach(fr => {
      if (!fr) return;
      const k = _edgeKey(fr.relation[0], fr.relation[1]);
      if (ftMap.has(k)) return;
      const type = fr.type ?? 0;
      ftMap.set(k, type);
      const a = nodeMap.get(fr.relation[0]);
      const b = nodeMap.get(fr.relation[1]);
      if (!a || !b) return;
      const lenA = a.length();
      const lenB = b.length();
      if (lenA < 1e-9 || lenB < 1e-9) return;
      const dot = THREE.MathUtils.clamp(a.dot(b) / (lenA * lenB), -1, 1);
      const angle = Math.acos(dot);
      const segCount = Math.max(2, Math.round(angle * radius / (FRAME_SEG_LENGTH * 2)) * 2);
      const protoId = Number.isInteger(fr.style) ? fr.style : FRAME_STYLE_OFFSET;
      const style = Math.max(0, Math.min(2, protoId - FRAME_STYLE_OFFSET));
      const c = fr.color;
      // a 只是涂色标记，不是透明度
      const paintedFlag = c && typeof c.a === 'number' ? c.a : 0;
      const paintColor = paintedFlag > 0 ? new THREE.Color((c.r << 16) | (c.g << 8) | c.b) : null;
      frameList.push({ a, b, type, style, segCount, paintColor });
      styleCounts[style] += segCount;
    });
  }

  const batches = styleCounts.map((count, style) => count > 0 ? {
    style,
    count,
    matrices: new Float32Array(count * 16),
    paintRGBA: new Float32Array(count * 4),
    cursor: 0,
  } : null);

  // 第二遍: 采样弧线，生成每段的实例矩阵
  const m = new THREE.Matrix4();
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const rad = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const start = new THREE.Vector3();
  const barScale = FRAME_WORLD_SCALE * scale;

  for (const item of frameList) {
    const batch = batches[item.style];
    if (!batch) continue;
    const pts = (item.type === 1 && shPole)
      ? _gridArcPoints(item.a, item.b, item.segCount, shPole)
      : _sphericalArcPoints(item.a, item.b, item.segCount);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      dir.subVectors(p1, p0);
      const len = dir.length();
      if (len < 1e-9) continue;
      dir.divideScalar(len);
      rad.copy(p0).normalize();
      // 用径向做 up，投影到垂直于段方向，得到局部 Y；局部 X = Y × Z
      yAxis.copy(rad).addScaledVector(dir, -rad.dot(dir));
      if (yAxis.lengthSq() < 1e-12) yAxis.set(0, 1, 0);
      yAxis.normalize();
      xAxis.crossVectors(yAxis, dir).normalize();
      zAxis.copy(dir);
      m.makeBasis(xAxis, yAxis, zAxis);
      // 把网格 Z 映射到段长的 1%–99%
      const zScale = len * 0.98 / FRAME_MESH_LENGTH;
      const zOffset = len * 0.01 - zScale * FRAME_MESH_Z_MIN;
      start.copy(p0).addScaledVector(dir, zOffset);
      m.setPosition(start);
      scl.set(barScale, barScale, zScale);
      m.scale(scl);
      const o = batch.cursor * 16;
      for (let k = 0; k < 16; k++) batch.matrices[o + k] = m.elements[k];
      const c = batch.cursor * 4;
      if (item.paintColor) {
        batch.paintRGBA[c] = item.paintColor.r;
        batch.paintRGBA[c + 1] = item.paintColor.g;
        batch.paintRGBA[c + 2] = item.paintColor.b;
        batch.paintRGBA[c + 3] = 1;
      } else {
        batch.paintRGBA[c] = 0;
        batch.paintRGBA[c + 1] = 0;
        batch.paintRGBA[c + 2] = 0;
        batch.paintRGBA[c + 3] = 0;
      }
      batch.cursor++;
    }
  }

  return {
    instances: batches.filter(Boolean).map(b => ({
      style: b.style,
      count: b.cursor,
      matrices: b.matrices,
      paintRGBA: b.paintRGBA,
    })),
    edgeTypes: [...ftMap],
  };
}

/**
 * 涂色网格: 顶点按轨道姿态旋转并缩放到轨道半径（纯数据，材质留主线程建）
 * @returns {Array<{positions: Float32Array, colors: Float32Array}>|null}
 *          colors 为 RGBA: rgb 线性色 + a = 涂色状态
 */
export async function computePainting(shData, orbit, scale) {
  // 无涂色数据的壳层直接短路
  if (!shData.fillGrid || !shData.fillGrid.colors) return null;
  const parts = await buildPaintingGeometry(shData.fillGrid);
  if (!parts) return null;
  const renderR = orbit.radius;
  const shQuat = _normQuat(orbit);
  const paintR = renderR * scale;
  const qx = shQuat.x, qy = shQuat.y, qz = shQuat.z, qw = shQuat.w;
  return parts.map((part) => {
    const src = part.positions;
    const out = new Float32Array(src.length);
    for (let vi = 0; vi < src.length; vi += 3) {
      const x = src[vi], y = src[vi + 1], z = src[vi + 2];
      const tx = 2 * (qy * z - qz * y);
      const ty = 2 * (qz * x - qx * z);
      const tz = 2 * (qx * y - qy * x);
      const rx = x + qw * tx + (qy * tz - qz * ty);
      const ry = y + qw * ty + (qz * tx - qx * tz);
      const rz = z + qw * tz + (qx * ty - qy * tx);
      out[vi] = rx * paintR;
      out[vi + 1] = ry * paintR;
      out[vi + 2] = -rz * paintR;
    }
    return { positions: out, colors: part.colors };
  });
}

/**
 * 整层几何: 节点 → 框架 → 细胞 → 涂色（不计时，时限由主线程看门狗负责）
 * @param {object} shData  壳层数据
 * @param {object} orbit   轨道（radius + 姿态）
 * @param {number} scale   缩放系数
 * @returns {{nodes: object, frames: object, cells: Array|null, painting: Array|null, pole: {x:number,y:number,z:number}}}
 */
export async function computeLayerGeometry(shData, orbit, scale) {
  const shQuat = _normQuat(orbit);
  const poleRaw = new THREE.Vector3(0, 1, 0); poleRaw.applyQuaternion(shQuat);
  const shPole = _convertBP(poleRaw);

  const nodes = computeNodes(shData, orbit, scale);

  // 节点位置表（框架与细胞都要用；键是节点 id，面的 relation 里存的就是 id）
  const nodeMap = new Map();
  for (let i = 0; i < nodes.count; i++) {
    nodeMap.set(nodes.ids[i], new THREE.Vector3(
      nodes.positions[i * 3], nodes.positions[i * 3 + 1], nodes.positions[i * 3 + 2]));
  }

  const frames = computeFrames(shData, nodeMap, shPole, scale, orbit.radius);
  const cells = computeShellCellBuckets(
    shData, nodeMap, shPole, new Map(frames.edgeTypes), orbit, scale);
  const painting = await computePainting(shData, orbit, scale);

  return { nodes, frames, cells, painting, pole: { x: shPole.x, y: shPole.y, z: shPole.z } };
}
