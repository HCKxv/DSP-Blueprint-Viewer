// 返回值结构（按同一个 color 参数采样）：
//   star.color / star.glow = 恒星原色 / 提亮到 0.8 的 linear 版
//   back.frame             = 节点、框架光照色
//   back.shell             = 壳面背面
//   emission               = 默认框架发光色（= star.glow）

// 恒星色停点（sRGB 0..1）。
const STAR_STOPS = [
  [0.0, [1.0, 0.2290, 0.1745]],
  [0.07, [1.0, 0.4373, 0.1765]],
  [0.32, [1.0, 0.9515, 0.1557]],
  [0.5, [0.9879, 1.0, 0.6179]],
  [0.7235, [0.9764, 1.0, 0.9780]],
  [0.82, [0.5800, 0.8963, 1.0]],
  [0.92, [0.1176, 0.6548, 1.0]],
  [1.0, [0.0991, 0.3400, 1.0]],
];

// 光照/背光色停点（sRGB 0..1）。
const SUN_STOPS = [
  [0.0, [1.0, 0.5279, 0.4009]],
  [0.1, [1.0, 0.6381, 0.4471]],
  [0.3, [1.0, 0.8911, 0.5708]],
  [0.4971, [1.0, 0.9646, 0.7877]],
  [0.5618, [1.0, 0.9879, 0.8549]],
  [0.7, [0.9886, 1.0, 0.9764]],
  [0.85, [0.5529, 0.7896, 1.0]],
  [1.0, [0.4575, 0.6063, 1.0]],
];

// 壳面背面亮度系数。
const SHELL_BACK_FACTOR = 0.73;

const STAR_LINEAR_STOPS = STAR_STOPS.map(([t, rgb]) => [t, rgb.map(srgbToLinear)]);

/** 背面色亮度上限，避免触发泛光。 */
const BACK_MAX_LUMINANCE = 0.75;

const log10 = (v) => Math.log(v) / Math.LN10;

function rgbToHex([r, g, b]) {
  const toByte = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);
}

function srgbToLinear(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 把 sRGB 颜色压暗到指定 linear 亮度以下；已经低于阈值则原样返回。 */
function darkenToLuminance(rgb, limit = BACK_MAX_LUMINANCE) {
  const lin = rgb.map(srgbToLinear);
  const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  if (l <= limit) return rgb;

  const k = limit / l;
  return lin.map((c) => Math.min(1, Math.max(0, linearToSrgb(c * k))));
}

/**
 * 在 linear 空间把亮度补到 target。
 * 返回值可能 >1。
 */
function brightenToLuminance([r, g, b], target = 0.8) {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = Math.max(1, target / Math.max(l, 0.02));
  return [r * k, g * k, b * k];
}

function sampleStops(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last[1];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * f);
    }
  }
  return last[1];
}

/**
 * 面板光度系数 → 连续 color 参数。
 * 主序星上单调；两端分别饱和到 0 / 1。
 * @param {number} luminosity 面板光度系数
 * @returns {number} 0 ~ 1
 */
export function colorFromLuminosity(luminosity) {
  if (!(luminosity > 0)) return 0;

  // 还原内部光度与质量
  const L = Math.pow(luminosity, 1 / 0.33);
  const x = Math.pow(L, 1 / 0.7);

  const e = 0.56 + 0.14 / (log10(x + 4) / log10(5));
  const T = 4450 * Math.pow(x, e) + 1300;

  let n = log10((T - 1300) / 4500) / log10(2.6) - 0.5;
  if (n < 0) n *= 4;
  n = Math.min(2, Math.max(-4, n));

  return Math.min(1, Math.max(0, (n + 3.5) * 0.2));
}

function typeFromColor(color) {
  if (color <= 0) return 'M';
  if (color < 0.2) return 'K';
  if (color < 0.4) return 'G';
  if (color < 0.6) return 'F';
  if (color < 0.8) return 'A';
  if (color < 1) return 'B';
  return 'O';
}

/**
 * 按光度系数取主序星配色。
 *
 * @param {number} luminosity 面板光度系数（0.1 ~ 10）
 * @returns {{
 *   type: string,
 *   color: number,
 *   star: { color: number, glow: number[] },
 *   back: { frame: number, shell: number },
 *   emission: number[],
 * }}
 * star.color=恒星原色（sRGB hex）；star.glow=提亮到亮度 0.8 的 linear 恒星色（可能 >1）；
 * back.frame=节点/框架光照色；back.shell=壳面背面；
 * emission=默认框架发光色（当前等于 star.glow）。
 */
export function getStarColors(luminosity) {
  const color = colorFromLuminosity(luminosity);
  const starColor = rgbToHex(sampleStops(STAR_STOPS, color));
  const starGlow = brightenToLuminance(sampleStops(STAR_LINEAR_STOPS, color));
  const sunBack = sampleStops(SUN_STOPS, color);

  return {
    type: typeFromColor(color),
    color,
    star: {
      color: starColor,
      glow: starGlow,
    },
    back: {
      frame: rgbToHex(darkenToLuminance(sunBack)),
      shell: rgbToHex(sunBack.map((c) => c * SHELL_BACK_FACTOR)),
    },
    emission: starGlow,
  };
}
