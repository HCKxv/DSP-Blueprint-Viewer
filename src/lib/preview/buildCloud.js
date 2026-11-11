import * as THREE from 'three';
import { _toHexColor, _createOrbitRing, _createOrbitGlow, _normQuat, _convertBP } from './geometry.js';

// 帆/半径单位；10000 半径 -> 10000 帆
const MAX_DENSITY = 1;
const MAX_SAILS_PER_ORBIT = 100000;
// 六边形帆的世界直径（蓝图单位）
const SAIL_WORLD_SIZE = 32;

const HEX_CORNERS = [
  [1, 0],
  [0.5, 0.8660254],
  [-0.5, 0.8660254],
  [-1, 0],
  [-0.5, -0.8660254],
  [0.5, -0.8660254],
];

export const INDICES_PER_SAIL = HEX_CORNERS.length * 3;

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 三维高斯偏移: 随机方向 × 高斯长度 */
function gaussian3D(rand, sigma) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  const len = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(
    r * Math.cos(a) * len * sigma,
    r * Math.sin(a) * len * sigma,
    z * len * sigma,
  );
}

function buildSails(orb, radius, colorHex, scale, q, pole, density) {
  const count = Math.min(
    MAX_SAILS_PER_ORBIT,
    Math.max(1, Math.round(MAX_DENSITY * orb.radius)),
  );
  const rand = makeRandom((orb.id + 1) * 2654435761);
  const positions = new Float32Array(count * 7 * 3);
  const corners = new Float32Array(count * 7 * 2);
  const brightness = new Float32Array(count * 7);
  const indices = new Uint32Array(count * 18);
  const point = new THREE.Vector3();
  let vi = 0;
  let ii = 0;

  for (let i = 0; i < count; i++) {
    // 轨道平面内随机角度 + 三维高斯偏移
    const angle = rand() * Math.PI * 2;
    point.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    point.applyQuaternion(q);
    point.add(gaussian3D(rand, 200 * scale));
    point.copy(_convertBP(point));

    const b = 0.6 + rand() * 0.4;
    const base = vi;
    for (let k = -1; k < 6; k++) {
      positions[vi * 3] = point.x;
      positions[vi * 3 + 1] = point.y;
      positions[vi * 3 + 2] = point.z;
      corners[vi * 2] = k < 0 ? 0 : HEX_CORNERS[k][0];
      corners[vi * 2 + 1] = k < 0 ? 0 : HEX_CORNERS[k][1];
      brightness[vi] = b;
      vi++;
    }
    for (let k = 0; k < 6; k++) {
      indices[ii++] = base;
      indices[ii++] = base + 1 + k;
      indices[ii++] = base + 1 + ((k + 1) % 6);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geom.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
  geom.setIndex(new THREE.Uint32BufferAttribute(indices, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uSize: { value: SAIL_WORLD_SIZE * 0.5 * scale },
      uOpacity: { value: 0.45 },
      uOrbitNormal: { value: pole },
    },
    vertexShader: `
      attribute vec2 aCorner;
      attribute float aBrightness;
      varying float vBrightness;
      uniform float uSize;
      uniform vec3 uOrbitNormal;
      void main() {
        vBrightness = aBrightness;
        vec4 center = modelMatrix * vec4(position, 1.0);
        vec3 orbitNormal = normalize(mat3(modelMatrix) * uOrbitNormal);
        vec3 toStar = normalize(-center.xyz);
        vec3 right = normalize(cross(orbitNormal, toStar));
        vec3 up = orbitNormal;
        vec3 world = center.xyz + (right * aCorner.x + up * aCorner.y) * uSize;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vBrightness;
      void main() {
        gl_FragColor = vec4(uColor * vBrightness, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'cloudSails';
  mesh.frustumCulled = false;
  mesh.userData.sailMaxCount = count;
  mesh.geometry.setDrawRange(
    0,
    Math.max(1, Math.round(count * density)) * INDICES_PER_SAIL,
  );
  return mesh;
}

/**
 * 戴森云单条轨道渲染对象构建
 *
 * @param {object} orb   - cloud.orbits 项（id/radius/四元数）
 * @param {object} color - 轨道颜色
 * @param {number} scale - 缩放系数
 * @param {boolean} detailed - 精细模型: 每帆一个六边形
 * @param {number} density - 帆密度倍率
 * @returns {{group: THREE.Group, pole: THREE.Vector3}} 轨道组与旋转轴
 */
export function buildCloudOrbit(orb, color, scale, detailed = true, density = 1) {
  const colorHex = _toHexColor(color, 0xffcba6);
  const r = orb.radius * scale;
  const q = _normQuat(orb);
  const pole = _convertBP(new THREE.Vector3(0, 1, 0).applyQuaternion(q)).normalize();
  const group = new THREE.Group();
  if (detailed) {
    group.add(buildSails(orb, r, colorHex, scale, q, pole, density));
  } else {
    group.add(_createOrbitRing(r, orb, colorHex, 0.9));
    group.add(_createOrbitGlow(r, orb, colorHex, 0.18));
  }
  return { group, pole };
}
