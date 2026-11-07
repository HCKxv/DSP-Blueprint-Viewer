import * as THREE from 'three';
import {
  _toHexColor, _convertBP, _normQuat, _edgeKey,
  _sphericalArcPoints, _gridArcPoints,
} from './geometry.js';
import { buildPaintingGeometry } from '../grid/paintingGrid.js';

const FRAME_BAR_WIDTH = 30;
const FRAME_BAR_THICKNESS = 20;

function makeHexColorCache() {
  const cache = new Map();
  return (hex) => {
    let c = cache.get(hex);
    if (!c) { c = new THREE.Color(hex); cache.set(hex, c); }
    return c;
  };
}

function buildFrameData(shData, nodeMap, shPole, scale) {
  const ftMap = new Map();
  const hexColor = makeHexColorCache();
  const barVerts = [];
  const barCols = [];
  const barIdx = [];
  const renderedEdges = new Set();
  const halfW = (FRAME_BAR_WIDTH / 2) * scale;
  const halfT = (FRAME_BAR_THICKNESS / 2) * scale;
  const tv = new THREE.Vector3();

  const buildBar = (pts, color) => {
    const n = pts.length;
    if (n < 2) return;
    const base = barVerts.length / 3;
    let prevT = null;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const t = tv.subVectors(b, a);
      if (t.lengthSq() < 1e-12) {
        if (prevT) t.copy(prevT); else t.set(0, 1, 0);
      } else {
        t.normalize();
        if (!prevT) prevT = t.clone();
        else prevT.copy(t);
      }
      const rad = pts[i].clone().normalize();
      const u = new THREE.Vector3().crossVectors(t, rad);
      const bx = pts[i].x - rad.x * halfT, by = pts[i].y - rad.y * halfT, bz = pts[i].z - rad.z * halfT;
      const tx = pts[i].x + rad.x * halfT, ty = pts[i].y + rad.y * halfT, tz = pts[i].z + rad.z * halfT;
      const ux = u.x * halfW, uy = u.y * halfW, uz = u.z * halfW;
      barVerts.push(bx + ux, by + uy, bz + uz);
      barVerts.push(bx - ux, by - uy, bz - uz);
      barVerts.push(tx + ux, ty + uy, tz + uz);
      barVerts.push(tx - ux, ty - uy, tz - uz);
      barCols.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
    }
    for (let i = 0; i < n - 1; i++) {
      const bi = base + i * 4, bj = bi + 4;
      barIdx.push(
        bi + 3, bi + 2, bj + 2, bi + 3, bj + 2, bj + 3,
        bi + 0, bi + 1, bj + 1, bi + 0, bj + 1, bj + 0,
        bi + 0, bj + 0, bj + 2, bi + 0, bj + 2, bi + 2,
        bi + 1, bi + 3, bj + 3, bi + 1, bj + 3, bj + 1,
      );
    }
  };

  const re = (id1, id2, color, type = 0) => {
    const k = _edgeKey(id1, id2);
    if (renderedEdges.has(k)) return;
    renderedEdges.add(k);
    const f = nodeMap.get(id1), t = nodeMap.get(id2);
    if (!f || !t) return;
    const pts = (type === 1 && shPole) ? _gridArcPoints(f, t, 18, shPole) : _sphericalArcPoints(f, t, 18);
    buildBar(pts, hexColor(color));
  };

  if (shData.frames) {
    shData.frames.forEach(fr => {
      if (!fr) return;
      const k = _edgeKey(fr.relation[0], fr.relation[1]);
      ftMap.set(k, fr.type);
      re(fr.relation[0], fr.relation[1], _toHexColor(fr.color, 0x175473), fr.type);
    });
  }

  return {
    positions: new Float32Array(barVerts),
    colors: new Float32Array(barCols),
    indices: new Uint32Array(barIdx),
    edgeTypes: ftMap,
  };
}

function buildFaceGeometry(points, pole, edgeTypes) {
  if (points.length < 3) return null;
  const spherePoints = points.map(p => p.clone());
  if (edgeTypes) {
    const refined = [];
    for (let i = 0; i < points.length; i++) {
      const from = points[i], to = points[(i + 1) % points.length];
      const sub = edgeTypes[i] === 1 && pole
        ? _gridArcPoints(from, to, 9, pole)
        : _sphericalArcPoints(from, to, 5);
      for (let j = 0; j < sub.length - 1; j++) refined.push(sub[j]);
    }
    return buildFaceGeometry(refined, pole, null);
  }
  const vertices = [], indices = [];
  const addVertex = (v) => { vertices.push(v.x, v.y, v.z); return (vertices.length / 3) - 1; };
  const subdivide = (a, b, c, divs = 3) => {
    const ra = a.length(), rb = b.length(), rc = c.length();
    const rowIndices = [];
    for (let i = 0; i <= divs; i++) {
      const row = [];
      for (let j = 0; j <= divs - i; j++) {
        const k = divs - i - j;
        const tA = i / divs, tB = j / divs, tC = k / divs;
        const r = tA * ra + tB * rb + tC * rc;
        const pt = new THREE.Vector3().addScaledVector(a, tA).addScaledVector(b, tB).addScaledVector(c, tC).normalize().multiplyScalar(r);
        row.push(addVertex(pt));
      }
      rowIndices.push(row);
    }
    for (let i = 0; i < rowIndices.length - 1; i++) {
      const cur = rowIndices[i], nxt = rowIndices[i + 1];
      for (let j = 0; j < cur.length - 1; j++) {
        indices.push(cur[j], cur[j + 1], nxt[j]);
        if (j < cur.length - 2) indices.push(cur[j + 1], nxt[j + 1], nxt[j]);
      }
    }
  };
  function earClip(poly) {
    const tris = [], rem = poly.slice();
    function signedArea(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
    function isConvex(prev, curr, next) { return signedArea(prev, curr, next) > 0; }
    function ptInTri(pt, a, b, c) { const d1 = signedArea(pt, a, b), d2 = signedArea(pt, b, c), d3 = signedArea(pt, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); }
    while (rem.length > 3) {
      let found = false;
      for (let i = 0; i < rem.length; i++) {
        const prev = rem[(i - 1 + rem.length) % rem.length], curr = rem[i], next = rem[(i + 1) % rem.length];
        if (!isConvex(prev, curr, next)) continue;
        let isEar = true;
        for (let j = 0; j < rem.length; j++) { if (j === (i - 1 + rem.length) % rem.length || j === i || j === (i + 1) % rem.length) continue; if (ptInTri(rem[j], prev, curr, next)) { isEar = false; break; } }
        if (isEar) { tris.push([prev.idx, curr.idx, next.idx]); rem.splice(i, 1); found = true; break; }
      }
      if (!found) { const base = rem[0]; for (let i = 1; i < rem.length - 1; i++) tris.push([base.idx, rem[i].idx, rem[i + 1].idx]); break; }
    }
    if (rem.length === 3) tris.push([rem[0].idx, rem[1].idx, rem[2].idx]);
    return tris;
  }
  const faceNormal = new THREE.Vector3();
  for (let i = 0; i < spherePoints.length; i++) { const curr = spherePoints[i], next = spherePoints[(i + 1) % spherePoints.length]; faceNormal.x += (curr.y - next.y) * (curr.z + next.z); faceNormal.y += (curr.z - next.z) * (curr.x + next.x); faceNormal.z += (curr.x - next.x) * (curr.y + next.y); }
  faceNormal.normalize();
  const refX = Math.abs(faceNormal.x) < 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const axisU = new THREE.Vector3().crossVectors(refX, faceNormal).normalize();
  const axisV = new THREE.Vector3().crossVectors(faceNormal, axisU).normalize();
  const centroid = spherePoints.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / spherePoints.length);
  const flat = spherePoints.map(p => { const d = p.clone().sub(centroid); return { x: d.dot(axisU), y: d.dot(axisV) }; });
  const polygon = flat.map((p, idx) => ({ x: p.x, y: p.y, idx }));
  const tris2d = earClip(polygon);
  tris2d.forEach(([ai, bi, ci]) => { if (ai < spherePoints.length && bi < spherePoints.length && ci < spherePoints.length) subdivide(spherePoints[ai], spherePoints[bi], spherePoints[ci], 5); });
  if (tris2d.length === 0) return null;
  // 确保法线统一朝外（按三角形面法线判断，必要时翻转绕序）
  let avgDot = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (vertices[a] + vertices[b] + vertices[c]) / 3;
    const cy = (vertices[a + 1] + vertices[b + 1] + vertices[c + 1]) / 3;
    const cz = (vertices[a + 2] + vertices[b + 2] + vertices[c + 2]) / 3;
    avgDot += nx * cx + ny * cy + nz * cz;
  }
  if (avgDot < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
  }
  return { positions: vertices, indices };
}

function buildFaceData(shData, nodeMap, shPole, ftMap) {
  const hexColor = makeHexColorCache();
  const faceVerts = [];
  const faceCols = [];
  const faceIdx = [];
  if (shData.faces) {
    shData.faces.forEach(fc => {
      if (!fc || !Array.isArray(fc.relation) || fc.relation.length < 3) return;
      if (fc.relation.some(nid => !nodeMap.has(nid))) return;
      const rel = fc.relation.slice();
      const pts = rel.map(nid => nodeMap.get(nid));
      if (pts.some(p => !p)) return;
      const edgeTypes = rel.map((_, j) => ftMap.get(_edgeKey(rel[j], rel[(j + 1) % rel.length])) ?? 0);
      const fg = buildFaceGeometry(pts, shPole, edgeTypes);
      if (!fg) return;
      const base = faceVerts.length / 3;
      const c = hexColor(_toHexColor(fc.color, 0x175473));
      for (let i = 0; i < fg.positions.length; i += 3) {
        faceVerts.push(fg.positions[i], fg.positions[i + 1], fg.positions[i + 2]);
        faceCols.push(c.r, c.g, c.b);
      }
      for (const i of fg.indices) faceIdx.push(base + i);
    });
  }
  return {
    positions: new Float32Array(faceVerts),
    colors: new Float32Array(faceCols),
    indices: new Uint32Array(faceIdx),
  };
}

async function buildPaintingData(shData, shQuat, renderR, scale) {
  const out = [];
  if (!shData.fillGrid?.colors) return out;
  const parts = await buildPaintingGeometry(shData.fillGrid);
  if (!parts) return out;
  const paintR = renderR * scale * 1.0015;
  const qx = shQuat.x, qy = shQuat.y, qz = shQuat.z, qw = shQuat.w;
  for (const part of parts) {
    const positions = new Float32Array(part.positions);
    for (let vi = 0; vi < positions.length; vi += 3) {
      const x = positions[vi], y = positions[vi + 1], z = positions[vi + 2];
      const tx = 2 * (qy * z - qz * y);
      const ty = 2 * (qz * x - qx * z);
      const tz = 2 * (qx * y - qy * x);
      const rx = x + qw * tx + (qy * tz - qz * ty);
      const ry = y + qw * ty + (qz * tx - qx * tz);
      const rz = z + qw * tz + (qx * ty - qy * tx);
      positions[vi] = rx * paintR;
      positions[vi + 1] = ry * paintR;
      positions[vi + 2] = -rz * paintR;
    }
    out.push({ positions, colors: part.colors, additive: part.additive });
  }
  return out;
}

export async function computeShellSimpleLayer(shData, orbit, scale) {
  const renderR = orbit.radius;
  const shQuat = _normQuat(orbit);
  const poleRaw = new THREE.Vector3(0, 1, 0); poleRaw.applyQuaternion(shQuat);
  const shPole = _convertBP(poleRaw);

  const nodeMap = new Map();
  const nodePositions = [];
  const nodeColors = [];
  if (shData.nodes) {
    for (let ni = 1; ni < shData.nodes.length; ni++) {
      const nd = shData.nodes[ni];
      if (!nd) continue;
      const d = new THREE.Vector3(nd.coordinate.x, nd.coordinate.y, nd.coordinate.z).normalize();
      d.applyQuaternion(shQuat);
      const pos = _convertBP(d).multiplyScalar(renderR * scale);
      nodeMap.set(nd.id, pos);
      nodePositions.push(pos.x, pos.y, pos.z);
      nodeColors.push(_toHexColor(nd.color, 0x60D6FD));
    }
  }

  const frames = buildFrameData(shData, nodeMap, shPole, scale);
  const faces = buildFaceData(shData, nodeMap, shPole, frames.edgeTypes);
  const painting = await buildPaintingData(shData, shQuat, renderR, scale);

  return {
    pole: { x: shPole.x, y: shPole.y, z: shPole.z },
    nodes: {
      positions: new Float32Array(nodePositions),
      colors: new Uint32Array(nodeColors),
      count: nodeColors.length,
    },
    frames: {
      positions: frames.positions,
      colors: frames.colors,
      indices: frames.indices,
    },
    faces: {
      positions: faces.positions,
      colors: faces.colors,
      indices: faces.indices,
    },
    painting,
  };
}
