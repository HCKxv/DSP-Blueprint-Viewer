/**
 * foundationLayout.js — 把蓝图自带的铺地（reformData.rects）摊到行星地基网格上
 *
 * 只按色号上色: 装饰花纹不画，无装饰地基（type 7）不显示。
 * rect 是区本地格坐标（x = 距区域西边界第几格，y = 距区域南边界第几行），落点由 blueprintLayout 给出；
 * 行/列取整按游戏粘贴公式，180° 镜像时行取 H-1-y、列取 W-2-x。
 * 产出直接喂给 planetGridMesh.buildPlanetPaintGeometry。
 */

import { FOUNDATION_PALETTE } from '../markup/colorPalette.js';

/** 未铺地基的色号（与 planetGridMesh.js 的 NO_COLOR 一致） */
export const FOUNDATION_NO_COLOR = 255;

/** 装饰类型: 0 = 没有地基，1-6 = 带装饰，7 = 无装饰（预览不显示） */
const TYPE_NONE = 0;
const TYPE_UNDECAL = 7;

/** 色号 0-15 是游戏内置色（FOUNDATION_PALETTE），16-31 是蓝图自带的自定义色 */
const BUILTIN_COLOR_COUNT = 16;
const COLOR_SLOT_COUNT = 32;

/** 色号解析不出来时的兜底色（中性灰，避免整块变黑） */
const FALLBACK_COLOR = { r: 128, g: 128, b: 128 };

/** '#rrggbb' / '#rgb' → { r, g, b }（0-255）；非法返回 null */
function parseHexColor(hex) {
  const text = String(hex ?? '').trim().replace(/^#/, '');
  const expanded = text.length === 3 ? text.split('').map((c) => c + c).join('') : text;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  const value = Number.parseInt(expanded, 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** 经度归一到 [-180, 180) */
function wrapLongitude(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

/**
 * 32 个色号的 RGB 调色板（下标 = 色号）
 * 0-15 用内置色 FOUNDATION_PALETTE，16-31 用蓝图自带的 customReformColors，缺失时退回中性灰。
 * @param {object|null} reform blueprint 的 reformData（layout.reformData）
 */
export function foundationPalette(reform) {
  const custom = Array.isArray(reform?.customReformColors) ? reform.customReformColors : [];
  const mask = Number(reform?.customReformColorMask ?? 0) >>> 0;

  const palette = new Array(COLOR_SLOT_COUNT);
  for (let slot = 0; slot < COLOR_SLOT_COUNT; slot += 1) {
    if (slot < BUILTIN_COLOR_COUNT) {
      palette[slot] = parseHexColor(FOUNDATION_PALETTE[slot]) ?? FALLBACK_COLOR;
      continue;
    }
    const packed = Number(custom[slot - BUILTIN_COLOR_COUNT]) >>> 0;
    // mask 置位 = 这一位有自定义色；有的蓝图不写 mask 但色值带 alpha，也认
    const inUse = (mask & (1 << slot)) !== 0 || (packed & 0xff) !== 0;
    if (!inUse || packed === 0) {
      palette[slot] = FALLBACK_COLOR;
      continue;
    }
    palette[slot] = {
      r: (packed >>> 24) & 0xff,
      g: (packed >>> 16) & 0xff,
      b: (packed >>> 8) & 0xff,
    };
  }
  return palette;
}

/** 色号 → 调色板下标（越界 / 非法值落到兜底色） */
function colorSlotOf(color) {
  const slot = Math.trunc(Number(color) || 0);
  return slot >= 0 && slot < COLOR_SLOT_COUNT ? slot : COLOR_SLOT_COUNT - 1;
}

/**
 * 铺地数据 → 行星网格上色
 * @param {object} layout blueprintLayout 的结果（areas + placement + reformData）
 * @param {object} grid createPlanetGrid() 的结果
 * @returns {{palette:Array,index:Uint8Array,paintedCount:number,skippedCount:number,colorsUsed:number[]}|null}
 *   没有可画的地基（无数据 / 全是无装饰地基 / 没有落点）时返回 null
 */
export function buildFoundationPaint(layout, grid) {
  const reform = layout?.reformData ?? null;
  const rects = reform?.rects;
  const areas = layout?.areas;
  if (!grid || !Array.isArray(rects) || rects.length === 0) return null;
  if (!Array.isArray(areas) || areas.length === 0) return null;

  const palette = foundationPalette(reform);
  const index = new Uint8Array(grid.total).fill(FOUNDATION_NO_COLOR);
  const rotated = !!layout.placement?.rotated;
  const latHalf = grid.latHalf;
  const rowCount = grid.latitudeCount;
  const used = new Set();
  let paintedCount = 0;
  let skippedCount = 0;

  for (const rect of rects) {
    const width = Math.trunc(Number(rect?.w) || 0);
    const height = Math.trunc(Number(rect?.h) || 0);
    if (width <= 0 || height <= 0) continue;

    const type = Math.trunc(Number(rect?.type) || 0);
    if (type === TYPE_NONE) continue;      // 没铺
    if (type === TYPE_UNDECAL) continue;   // 无装饰地基不显示

    const area = areas[Math.trunc(Number(rect?.areaIndex) || 0)];
    if (!area) {
      skippedCount += width * height;
      continue;
    }

    const southRow = Number(area.rowLo) || 0;
    const areaHeight = Math.max(1, Math.trunc(Number(area.height) || 1));
    const areaWidth = Math.max(1, Math.trunc(Number(area.width) || 1));
    const startLngDeg = Number(area.startLngDeg) || 0;
    const areaCellDeg = 360 / (Math.max(1, Math.trunc(Number(area.segmentCount) || 5)) * 5);
    // 180° 时参考行取区域北边界
    const referenceRow = rotated ? southRow + areaHeight - 1 : southRow;
    const nudge = referenceRow > 0 ? -0.4 : 0.4;
    const slot = colorSlotOf(rect?.color);
    const y0 = Math.trunc(Number(rect?.y) || 0);
    const x0 = Math.trunc(Number(rect?.x) || 0);

    for (let j = 0; j < height; j += 1) {
      const localRow = y0 + j;
      const rowOffset = rotated ? areaHeight - 1 - localRow : localRow;
      // 格中心行坐标 → 网格行号（游戏同款取整）
      const centerRow = southRow + rowOffset + (rotated ? 0.5 : -0.5) + nudge;
      const row = centerRow >= 0 ? Math.trunc(centerRow) : Math.trunc(latHalf - centerRow);
      if (row < 0 || row >= rowCount) {
        skippedCount += width;
        continue;
      }

      const info = grid.rows[row];
      const half = Math.trunc(info.cells / 2);
      const rowCellDeg = 360 / info.cells;

      for (let i = 0; i < width; i += 1) {
        const localCol = x0 + i;
        // 180° 时列镜像成 W-2-x（游戏从东边界往西数，比 W-1-x 差一格）
        const column = rotated ? areaWidth - 2 - localCol : localCol;
        // 格中心经度 → 该行格号
        const lngDeg = wrapLongitude(startLngDeg + (column + 0.5) * areaCellDeg);
        const k = Math.round(lngDeg / rowCellDeg - 0.5);
        // 绕回该行范围，再换成镜像格号（东半圈 0…half-1，西半圈 half…cells-1）
        const wrapped = (((k + half) % info.cells) + info.cells) % info.cells - half;
        const x = wrapped >= 0 ? wrapped : half - wrapped - 1;
        if (x < 0 || x >= info.cells) {
          skippedCount += 1;
          continue;
        }
        index[info.base + x] = slot;
        paintedCount += 1;
        used.add(slot);
      }
    }
  }

  if (paintedCount === 0) return null;
  return {
    palette,
    index,
    paintedCount,
    skippedCount,
    colorsUsed: [...used].sort((a, b) => a - b),
  };
}
