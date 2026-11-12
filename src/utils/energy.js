// 格式化小数位数
function formatValue(value) {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

// 格式化功率（入参单位 kW）
function fmtKW(kw) {
  if (kw < 0) return '???';
  if (kw === 0) return '0 W';
  if (kw < 1) return formatValue(kw * 1000) + ' W';
  if (kw >= 1e12) return formatValue(kw / 1e12) + ' PW';
  if (kw >= 1e9) return formatValue(kw / 1e9) + ' TW';
  if (kw >= 1e6) return formatValue(kw / 1e6) + ' GW';
  if (kw >= 1e3) return formatValue(kw / 1e3) + ' MW';
  return formatValue(kw) + ' kW';
}

// 格式化能量（入参单位 kJ）
function fmtKJ(kj) {
  if (kj === 0) return '0 J';
  if (kj < 1) return formatValue(kj * 1000) + ' J';
  if (kj >= 1e12) return formatValue(kj / 1e12) + ' PJ';
  if (kj >= 1e9) return formatValue(kj / 1e9) + ' TJ';
  if (kj >= 1e6) return formatValue(kj / 1e6) + ' GJ';
  if (kj >= 1e3) return formatValue(kj / 1e3) + ' MJ';
  return formatValue(kj) + ' kJ';
}

export { fmtKJ, fmtKW };
