/** buildShell — 壳层渲染对象组装 */
import * as THREE from 'three';
import { applyCellPatterns, buildBackCells } from './shellPattern.js';
import nodeMesh0 from '../../assets/dyson/node-0.json';
import frameMesh0 from '../../assets/dyson/frame-0.json';
import frameMesh1 from '../../assets/dyson/frame-1.json';
import frameMesh2 from '../../assets/dyson/frame-2.json';
import frameEmission0 from '../../assets/dyson/sphere-e.png';
import frameEmission1 from '../../assets/dyson/frame-1-e.png';

// 整层几何计算的 Worker 调度，详细/简化模型共用
let layerWorker = null;
let pendingAbort = null;

const LAYER_BUILD_TIMEOUT_MS = 10000;

/** 立即中止正在进行的层构建 */
export function cancelLayerWorker() {
  pendingAbort?.(new Error('构建已取消'));
}

/**
 * 把一整层的几何计算交给 Worker，并用主线程看门狗限时。
 * @param {{model?: 'detailed'|'simplified', shData: object, orbit: object, scale: number}} payload
 * @returns {Promise<object>}
 */
function computeLayerInWorker(payload, timeoutMs = LAYER_BUILD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let w;
    try {
      if (!layerWorker) {
        layerWorker = new Worker(new URL('./shellLayer.worker.js', import.meta.url), { type: 'module' });
      }
      w = layerWorker;
    } catch (err) { reject(err); return; }
    let settled = false;
    const cleanup = () => {
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
      clearTimeout(timer);
      pendingAbort = null;
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      layerWorker?.terminate();
      layerWorker = null;
      reject(err);
    };
    pendingAbort = fail;
    function onMsg(e) {
      if (settled) return;
      settled = true;
      cleanup();
      if (e.data && e.data.error) { fail(new Error(e.data.error)); return; }
      resolve((e.data && e.data.layer) || null);
    }
    function onErr(e) { fail(new Error((e && e.message) || 'Worker 执行出错')); }
    const timer = setTimeout(
      () => fail(new Error('构建超时')), timeoutMs);
    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    w.postMessage(payload);
  });
}

// 材质色固定；背面色直接用壳面背面的 sharedBackMaterial 颜色
const FIXED_FRAME_MATERIAL = 0x3f464d;
const FIXED_NODE_MATERIAL = 0x4a4f55;
const FRAME_MATERIAL_TINT = 0.02;
const NODE_MATERIAL_TINT = 0.02;

/** 框架/节点共用材质：固定材质色，按涂色计算发光，内侧面混入壳面背色。 */
function makeDysonColorMaterial({
  isNode, emissiveMap, emissionIntensity, sharedBackMaterial, starEmissionColor, materialTint = 0,
}) {
  const mat = new THREE.MeshStandardMaterial({
    color: isNode ? FIXED_NODE_MATERIAL : FIXED_FRAME_MATERIAL,
    metalness: isNode ? 0.35 : 0.55,
    roughness: isNode ? 0.55 : 0.5,
    emissive: 0xffffff,
    emissiveMap,
    side: THREE.FrontSide,
  });
  if (isNode) mat.defines = { DYSON_NODE: '' };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStarEmission = { value: starEmissionColor ?? new THREE.Color(0xffffff) };
    shader.uniforms.uBackColor = { value: sharedBackMaterial?.color ?? new THREE.Color(0xffffff) };
    shader.uniforms.uBackStrength = { value: 1.0 };
    shader.uniforms.uEmissionIntensity = { value: emissionIntensity };
    shader.uniforms.uMaterialTint = { value: materialTint };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aPaintRGBA; // rgb=涂色，a=涂色标记
varying vec4 vPaintRGBA;
varying float vRadialDot;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 dysonRadial = normalize(instanceMatrix[3].xyz);
  vec3 dysonNormal = normalize(mat3(instanceMatrix) * objectNormal);
  vRadialDot = dot(dysonNormal, dysonRadial);
#else
  vRadialDot = 0.0;
#endif
vPaintRGBA = aPaintRGBA;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uStarEmission;
uniform vec3 uBackColor;
uniform float uBackStrength;
uniform float uEmissionIntensity;
uniform float uMaterialTint;
varying vec4 vPaintRGBA;
varying float vRadialDot;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dysonPainted = step(0.5, vPaintRGBA.a);
vec3 dysonPaint = vPaintRGBA.rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, dysonPaint, dysonPainted * uMaterialTint);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec3 dysonEmTex = texture2D(emissiveMap, vEmissiveMapUv).rgb;
float dysonEmLum = dot(dysonEmTex, vec3(0.3, 0.6, 0.1));
#ifdef DYSON_NODE
vec3 dysonEm = mix(dysonEmTex, dysonEmLum * dysonPaint, dysonPainted);
#else
vec3 dysonEm = dysonEmLum * mix(uStarEmission, dysonPaint, dysonPainted);
#endif
totalEmissiveRadiance = dysonEm * uEmissionIntensity;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
// 仅明显朝向恒星的面用背色，侧面保持材质色
float dysonBack = (1.0 - smoothstep(-0.65, -0.35, vRadialDot)) * uBackStrength;
gl_FragColor.rgb = mix(gl_FragColor.rgb, uBackColor, dysonBack);`);
  };
  mat.customProgramCacheKey = () => (isNode ? 'dyson-node-color-v1' : 'dyson-frame-color-v1');
  return mat;
}
/** 节点几何：局部 +Y 为径向，由 assembleNodes 放到节点位置。 */
export function buildNodeGeometries() {
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(nodeMesh0.positions, 3));
  body.setAttribute('normal', new THREE.Float32BufferAttribute(nodeMesh0.normals, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(nodeMesh0.uvs, 2));
  body.setIndex(nodeMesh0.indices);
  return { body, cap: null, yAxis: new THREE.Vector3(0, 1, 0) };
}

// ═══════════════════════════════════════════════════════════════
// 组装
// ═══════════════════════════════════════════════════════════════

/**
 * 细胞板: 按「图案 × 空间八分块」分组的多个 Mesh（一个材质只能采样一套图案贴图，同一壳面可混用多种图案；分块后启用视锥剔除，放大看局部时只提交命中视锥的块）
 *
 * 图案补丁由 buildShellLayer 统一补上（applyCellPatterns），这里只管几何与材质。
 * @param {Array<{pattern:number, chunk:number, positions:Float32Array, normals:Float32Array,
 *   colors:Float32Array, patternUV:Float32Array, patternMN:Float32Array, indices:Uint32Array}>} bucketList
 * @returns {THREE.Group|null}
 */
function assembleShellCells(bucketList) {
  if (!bucketList || !bucketList.length) return null;
  const group = new THREE.Group();
  group.name = 'shellCells';
  for (const buf of bucketList) {
    if (!buf.positions.length) continue;
    const pattern = buf.pattern;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    geom.setAttribute('aPatternUV', new THREE.Float32BufferAttribute(buf.patternUV, 2));
    geom.setAttribute('aPatternMN', new THREE.Float32BufferAttribute(buf.patternMN, 2));
    // 索引显式包 BufferAttribute: setIndex 对 TypedArray 会原样存下，渲染器随后会崩
    geom.setIndex(new THREE.Uint32BufferAttribute(buf.indices, 1));
    // 提前算好包围球，供逐块视锥剔除使用（不再整体关闭 frustumCulled）
    geom.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
      depthWrite: true,
      metalness: 0.25,
      roughness: 0.55,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `shellCells:${pattern}:${buf.chunk}`;
    mesh.userData.shellPattern = pattern;
    group.add(mesh);
  }
  return group.children.length ? group : null;
}

/** 节点实例。 */
function assembleNodes(nodes, shellGroup, nodeGeoms, scale, sharedBackMaterial, starEmissionColor) {
  if (!nodes || !nodes.count || !nodeGeoms?.body) return;
  // 每层克隆一份，挂本层实例属性
  const geom = nodeGeoms.body.clone();
  geom.setAttribute('aPaintRGBA', new THREE.InstancedBufferAttribute(nodes.paintRGBA, 4));
  const mat = makeDysonColorMaterial({
    isNode: true,
    emissiveMap: getFrameEmission(0),
    emissionIntensity: 5.5,
    sharedBackMaterial,
    starEmissionColor,
    materialTint: NODE_MATERIAL_TINT,
  });
  const inst = new THREE.InstancedMesh(geom, mat, nodes.count);
  const m4 = new THREE.Matrix4();
  const dir = new THREE.Vector3();
  const xAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const s = 100 * scale;
  const sc = new THREE.Vector3(s, s, s);
  for (let i = 0; i < nodes.count; i++) {
    pos.set(nodes.positions[i * 3], nodes.positions[i * 3 + 1], nodes.positions[i * 3 + 2]);
    dir.copy(pos).normalize();
    // 局部 Y 对齐径向
    xAxis.crossVectors(dir, up);
    if (xAxis.lengthSq() < 1e-10) xAxis.set(1, 0, 0);
    xAxis.normalize();
    zAxis.crossVectors(xAxis, dir).normalize();
    m4.makeBasis(xAxis, dir, zAxis);
    m4.setPosition(pos);
    m4.scale(sc);
    inst.setMatrixAt(i, m4);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  shellGroup.add(inst);
}

// 框架网格与发光图集（按 style 索引）
const FRAME_MESHES = [frameMesh0, frameMesh1, frameMesh2];
const FRAME_EMISSION_URLS = [frameEmission0, frameEmission1, frameEmission1];
const frameEmissionTextures = [];

/** 只加载发光贴图。 */
function getFrameEmission(style) {
  if (!frameEmissionTextures[style]) {
    const tex = new THREE.TextureLoader().load(FRAME_EMISSION_URLS[style]);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    frameEmissionTextures[style] = tex;
  }
  return frameEmissionTextures[style];
}

/** 构建框架几何。 */
function buildFrameGeometry(data) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geom.setIndex(data.indices);
  return geom;
}

/** 框架实例。 */
function assembleFrames(frames, shellGroup, sharedBackMaterial, starEmissionColor) {
  const instances = frames?.instances;
  if (!instances || !instances.length) return;

  for (const inst of instances) {
    if (!inst || inst.count <= 0) continue;
    const style = Math.max(0, Math.min(2, inst.style | 0));
    const data = FRAME_MESHES[style];
    if (!data) continue;

    const geom = buildFrameGeometry(data);
    geom.setAttribute('aPaintRGBA', new THREE.InstancedBufferAttribute(inst.paintRGBA, 4));
    const mat = makeDysonColorMaterial({
      isNode: false,
      emissiveMap: getFrameEmission(style),
      emissionIntensity: 2.0,
      sharedBackMaterial,
      starEmissionColor,
      materialTint: FRAME_MATERIAL_TINT,
    });
    const matrixAttr = new THREE.InstancedBufferAttribute(inst.matrices, 16);

    const mesh = new THREE.InstancedMesh(geom, mat, inst.count);
    mesh.name = 'shellFrame';
    mesh.instanceMatrix = matrixAttr;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    shellGroup.add(mesh);
  }
}

/**
 * 涂色烘焙材质: 顶点色的 (rgb 原色, a 涂色状态) 原样写进贴图两半，
 * 亮度与压暗都由壳面着色器按这个状态算（见 shellPattern.js）。
 *
 * 要绕开的坑: three 的 color_fragment 会把 diffuseColor 乘上 vColor 整体（含 a），
 * a 是状态不是透明度，被乘进去颜色就按状态衰减了 —— 这里直接覆写，不做乘法。
 * 配 NoBlending: 涂色网格互不重叠，没涂色的方向保持清除色（全黑、a=0）。
 */
function makePaintingMaterial() {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthWrite: true,
    // 从球心往外烘焙，相机看到的是内侧 ⇒ BackSide
    side: THREE.BackSide,
    blending: THREE.NoBlending,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vPaintColor;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvPaintColor = vColor;\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vPaintColor;')
      .replace('#include <color_fragment>', '\tdiffuseColor = vPaintColor;');
  };
  return mat;
}

/** 涂色: 建烘焙源 Group（不加入场景，交给 bakeShellPainting 烘成立方体贴图） */
function assemblePainting(parts) {
  if (!parts || !parts.length) return null;
  const group = new THREE.Group();
  group.name = 'shellPaintingSource';
  for (const part of parts) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(part.colors, 4));
    const mesh = new THREE.Mesh(geom, makePaintingMaterial());
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/**
 * 构建一个壳层的全部渲染对象（节点、框架、细胞板、背面图案层、涂色烘焙源）。
 *
 * 几何在 Worker 里算（不回退主线程）；失败或超时直接抛出，由上层放弃整次构建。
 *
 * @param {object} shData               壳层数据（nodes / frames / faces / fillGrid）
 * @param {object} orbit                轨道对象，取 radius 与姿态四元数
 * @param {number} scale                缩放系数（= 1 / 最大轨道半径）
 * @param {{body: THREE.BufferGeometry, cap: THREE.BufferGeometry|null}} nodeGeoms  共享的节点几何
 * @param {THREE.Material} sharedBackMaterial  壳面背面材质
 * @param {THREE.Color} starEmissionColor       未涂色框架发光色
 * @returns {Promise<{group: THREE.Group, pole: THREE.Vector3, cells: THREE.Group|null, paintingGroup: THREE.Group|null}>}
 *          group 为整层（含背面），cells 仅正面细胞，paintingGroup 为涂色烘焙源
 */
export async function buildShellLayer(shData, orbit, scale, nodeGeoms, sharedBackMaterial, starEmissionColor) {
  const layer = await computeLayerInWorker({ shData, orbit, scale });
  if (!layer) throw new Error('Worker 未返回壳层数据');

  const shellGroup = new THREE.Group();

  assembleNodes(layer.nodes, shellGroup, nodeGeoms, scale, sharedBackMaterial, starEmissionColor);
  assembleFrames(layer.frames, shellGroup, sharedBackMaterial, starEmissionColor);

  const cellMesh = assembleShellCells(layer.cells);
  if (cellMesh) {
    shellGroup.add(cellMesh);
    // 图案补丁（按各细胞的图案）+ 背面图案层（几何共用、只画图案）
    applyCellPatterns(cellMesh, orbit);
    buildBackCells(cellMesh, shellGroup, sharedBackMaterial, orbit);
  }

  const paintingGroup = assemblePainting(layer.painting);

  return {
    group: shellGroup,
    pole: new THREE.Vector3(layer.pole.x, layer.pole.y, layer.pole.z).normalize(),
    cells: cellMesh,
    paintingGroup,
  };
}

const STENCIL_BASE = 200;

export async function buildShellSimpleLayer(shData, orbit, scale, sharedBackMaterial) {
  const data = await computeLayerInWorker({ model: 'simplified', shData, orbit, scale });
  if (!data) throw new Error('Worker 未返回简化壳层数据');

  const group = new THREE.Group();
  const stencilRef = STENCIL_BASE + (orbit.id || 0);

  if (data.nodes?.count) {
    const nodeGeom = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.6 });
    const inst = new THREE.InstancedMesh(nodeGeom, mat, data.nodes.count);
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    const s = 50 * scale;
    for (let i = 0; i < data.nodes.count; i++) {
      m4.makeScale(s, s, s);
      m4.setPosition(
        data.nodes.positions[i * 3],
        data.nodes.positions[i * 3 + 1],
        data.nodes.positions[i * 3 + 2],
      );
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, c.setHex(data.nodes.colors[i]));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }

  if (data.frames?.positions?.length) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(data.frames.positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(data.frames.colors, 3));
    geom.setIndex(new THREE.Uint32BufferAttribute(data.frames.indices, 1));
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.6 });
    group.add(new THREE.Mesh(geom, mat));
  }

  if (data.faces?.positions?.length) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(data.faces.positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(data.faces.colors, 3));
    geom.setIndex(new THREE.Uint32BufferAttribute(data.faces.indices, 1));
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.FrontSide, depthWrite: true });
    mat.stencilWrite = true;
    mat.stencilWriteMask = 0xff;
    mat.stencilRef = stencilRef;
    mat.stencilFunc = THREE.AlwaysStencilFunc;
    mat.stencilZPass = THREE.ReplaceStencilOp;
    const faceGroup = new THREE.Group();
    faceGroup.add(new THREE.Mesh(geom, mat));
    faceGroup.add(new THREE.Mesh(geom, sharedBackMaterial));
    group.add(faceGroup);
  }

  const paintingMeshes = [];
  for (const part of data.painting ?? []) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(part.colors, 4));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
      blending: part.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.stencilWrite = true;
    mat.stencilWriteMask = 0x00;
    mat.stencilRef = stencilRef;
    mat.stencilFunc = THREE.EqualStencilFunc;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    group.add(mesh);
    paintingMeshes.push(mesh);
  }

  return {
    group,
    pole: new THREE.Vector3(data.pole.x, data.pole.y, data.pole.z),
    paintingMeshes,
    cells: null,
    paintingGroup: null,
  };
}
