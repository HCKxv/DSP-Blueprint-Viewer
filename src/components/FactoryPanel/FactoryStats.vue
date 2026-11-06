<script setup lang="ts">
/** 统计 */
import { computed, ref } from 'vue'
import { factory } from '../../stores/factory'
import { 计算生产详情, 计算功率, 计算电力设施 } from '../../lib/factory/stats.js'
import { itemName } from '../../lib/blueprint/factory/factoryItems.js'
import { itemIconUrl } from '../../lib/markup/itemIcons'
import FactorySelect from './FactorySelect.vue'
import icarusIcon from '../../assets/factory/伊卡洛斯.png'

interface LogisticsState {
  输入: boolean
  输出: boolean
}

interface Row {
  id: number
  名字: string
  净产: number
  产出: number
  消耗: number
  物流?: Record<string, LogisticsState>
}

/** 能排序的列 */
type SortKey = 'id' | '净产' | '产出' | '消耗'

/** 物流类型 → 图标（星际船 / 运输机 / 配送机 / 伊卡洛斯） */
const LOGI_TYPES = [
  { key: '星际', label: '星际', icon: itemIconUrl(5002) },
  { key: '本地', label: '本地', icon: itemIconUrl(5001) },
  { key: '配送', label: '配送', icon: itemIconUrl(5003) },
  { key: '伊卡洛斯', label: '伊卡洛斯', icon: icarusIcon },
] as const

const sortKey = ref<SortKey>('净产')
const sortAsc = ref(false)

/** 统计设置的下拉选项: 值 → 显示名 / 图标（0 = 不使用） */
const proliferatorOptions = {
  0: '不使用',
  1141: itemName(1141),
  1142: itemName(1142),
  1143: itemName(1143),
}
const proliferatorIcons = {
  0: itemIconUrl(509), // 「不使用」用禁行图标
  1141: itemIconUrl(1141),
  1142: itemIconUrl(1142),
  1143: itemIconUrl(1143),
}
const lensOptions = {
  0: '不使用',
  1209: itemName(1209),
  1211: itemName(1211),
}
const lensIcons = {
  0: itemIconUrl(509), // 「不使用」用禁行图标
  1209: itemIconUrl(1209),
  1211: itemIconUrl(1211),
}
const fuelOptions = {
  1803: itemName(1803),
  1804: itemName(1804),
}
const fuelIcons = {
  1803: itemIconUrl(1803),
  1804: itemIconUrl(1804),
}

/** 直接读写 store 里的统计设置，改完生产详情和峰值功率会跟着重算 */
const proliferator = computed({
  get: () => factory.statsSettings.使用增产剂,
  set: (id: number) => { factory.statsSettings.使用增产剂 = id },
})
const lens = computed({
  get: () => factory.statsSettings.使用透镜,
  set: (id: number) => { factory.statsSettings.使用透镜 = id },
})
/** 质能燃料: 人造恒星烧的燃料棒，影响它的发电量 */
const fuel = computed({
  get: () => factory.statsSettings.使用质能燃料,
  set: (id: number) => { factory.statsSettings.使用质能燃料 = id },
})

/** 设施列表（建筑统计）里有没有这类建筑 */
function hasFacility(id: number): boolean {
  return (factory.stats.建筑统计?.get(id) ?? 0) > 0
}

/** 有射线接收站才给透镜选项 */
const hasReceiver = computed(() => hasFacility(2208))

/** 有人造恒星才给质能燃料选项 */
const hasArtificialStar = computed(() => hasFacility(2210))

/** 换列时给个默认方向: id 从小到大，数值从大到小（富余的在前） */
function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
    return
  }
  sortKey.value = key
  sortAsc.value = key === 'id'
}

/** 这一行的物品在哪些物流里出现过（顺序固定: 星际 / 本地 / 配送 / 伊卡洛斯） */
function logisticsOf(row: Row) {
  const logistics = row.物流
  if (!logistics) return []
  return LOGI_TYPES.filter((type) => logistics[type.key]).map((type) => ({
    key: type.key,
    label: type.label,
    icon: type.icon,
    输入: !!logistics[type.key].输入,
    输出: !!logistics[type.key].输出,
  }))
}

/** 点物流列头: 有物流的项是否置顶（默认关） */
const logisticsFirst = ref(false)

const rows = computed(() => {
  const detail = 计算生产详情(factory.stats, factory.statsSettings) as Row[]
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  return detail
    .map((row) => ({ ...row, icon: itemIconUrl(row.id), logi: logisticsOf(row) }))
    .sort((a, b) => {
      // 置顶开关先比"有没有物流"，同组里再按当前排序列
      if (logisticsFirst.value) {
        const group = Number(b.logi.length > 0) - Number(a.logi.length > 0)
        if (group) return group
      }
      return (a[key] - b[key]) * dir || a.id - b.id
    })
})

/** 电力汇总: 峰值功率 / 运输站充能 */
const power = computed(() => 计算功率(factory.stats, factory.statsSettings) as {
  峰值功率: number
  运输站充能: number
  峰值功率文本: string
  运输站充能文本: string
})

/** 两个功率都是 0 时整行不显示 */
const hasPower = computed(() => power.value.峰值功率 > 0 || power.value.运输站充能 > 0)

/** 发电设施: 图标 × 数量 */
const powerFacilities = computed(() =>
  (计算电力设施(factory.stats, factory.statsSettings) as Array<{ id: number; 名字: string; 数量: number; 备注: string; 标注: string }>)
    .map((item) => ({ ...item, icon: itemIconUrl(item.id) })),
)

/** 最多两位小数，去掉多余的 0（2550.00 → 2550，367.50 → 367.5） */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const text = value.toFixed(2).replace(/\.?0+$/, '')
  return text === '' || text === '-0' ? '0' : text
}
</script>

<template>
  <div class="factory-stats">
    <div v-if="factory.blueprint" class="stats-settings">
      <span class="setting">
        <span class="setting-label">增产剂</span>
        <FactorySelect v-model="proliferator" :options="proliferatorOptions" :icons="proliferatorIcons" />
      </span>
      <span v-if="hasReceiver" class="setting">
        <span class="setting-label">透镜</span>
        <FactorySelect v-model="lens" :options="lensOptions" :icons="lensIcons" />
      </span>
      <span v-if="hasArtificialStar" class="setting">
        <span class="setting-label">质能燃料</span>
        <FactorySelect v-model="fuel" :options="fuelOptions" :icons="fuelIcons" />
      </span>
    </div>

    <div v-if="powerFacilities.length" class="stats-generators">
      <span class="generators-label">电力：</span>
      <span v-for="item in powerFacilities" :key="`${item.id}-${item.标注}`" class="generator">
        <img class="generator-icon" :src="item.icon" :alt="item.名字">
        <span v-if="item.标注" class="generator-note">({{ item.标注 }})</span>
        <span class="generator-count">×{{ item.数量 }}</span>
        <span v-if="item.备注" class="generator-range">({{ item.备注 }})</span>
      </span>
    </div>

    <div v-if="factory.blueprint && hasPower" class="stats-power">
      <span class="power-item">
        <span class="power-label">峰值功率</span>
        <span class="power-value">{{ power.峰值功率文本 }}</span>
      </span>
      <span class="power-item">
        <span class="power-label">运输站充能</span>
        <span class="power-value">{{ power.运输站充能文本 }}</span>
      </span>
    </div>

    <div v-if="rows.length" class="stats-table">
      <div class="stats-row stats-header">
        <button
          type="button"
          class="stats-sort"
          @click="toggleSort('id')"
        >
          物品<span v-if="sortKey === 'id'" class="stats-arrow">{{ sortAsc ? '↑' : '↓' }}</span>
        </button>
        <button
          type="button"
          class="stats-sort"
          @click="logisticsFirst = !logisticsFirst"
        >
          物流<span v-if="logisticsFirst" class="stats-arrow">↑</span>
        </button>
        <button
          v-for="col in ['净产', '产出', '消耗']"
          :key="col"
          type="button"
          class="stats-sort stats-num"
          @click="toggleSort(col)"
        >
          {{ col }}<span v-if="sortKey === col" class="stats-arrow">{{ sortAsc ? '↑' : '↓' }}</span>
        </button>
      </div>
      <div
        v-for="row in rows"
        :key="row.id"
        class="stats-row"
      >
        <span class="stats-name">
          <img v-if="row.icon" class="stats-icon" :src="row.icon" :alt="row.名字">
          <span class="stats-name-text">{{ row.名字 }}</span>
        </span>
        <span class="stats-logi">
          <span v-for="item in row.logi" :key="item.key" class="logi">
            <img class="logi-icon" :src="item.icon" :alt="item.label">
            <span class="logi-arrows">
              <svg v-if="item.输出" class="logi-arrow out" viewBox="0 0 6 8" aria-hidden="true">
                <polygon points="3,0 6,4 4.2,4 4.2,8 1.8,8 1.8,4 0,4" />
              </svg>
              <svg v-if="item.输入" class="logi-arrow in" viewBox="0 0 6 8" aria-hidden="true">
                <polygon points="3,8 0,4 1.8,4 1.8,0 4.2,0 4.2,4 6,4" />
              </svg>
            </span>
          </span>
        </span>
        <span class="stats-num">{{ fmt(row.净产) }}</span>
        <span class="stats-num">{{ fmt(row.产出) }}</span>
        <span class="stats-num">{{ fmt(row.消耗) }}</span>
      </div>
    </div>

    <div v-if="rows.length" class="stats-note">
      <div>仅供参考，请以实际运行为准</div>
      <div>增产剂的消耗包含自喷涂消耗</div>
    </div>
  </div>
</template>

<style scoped>
.factory-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* 增产剂 / 透镜设置 */
.stats-settings {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.setting {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.setting-label {
  font-size: 12px;
  color: var(--fg-secondary);
}

/* 峰值功率 / 运输站充能 */
.stats-power {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 18px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

/* 电力设施:  */
.stats-generators {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.generators-label {
  font-size: 12px;
  color: var(--fg-secondary);
}

.generator {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--fg-value);
}

.generator-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.generator-note {
  font-size: 11px;
  color: var(--fg-secondary);
}

.generator-count {
  color: var(--fg-secondary);
}

.generator-range {
  font-size: 11px;
  color: var(--fg-muted);
}

.power-item {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
}

.power-label {
  color: var(--fg-secondary);
}

.power-value {
  color: var(--fg-value);
  font-variant-numeric: tabular-nums;
}

/* 表头和数据行共用同一套栅格: 行不生成盒子（display: contents），
   所有格子直接落到这张栅格上，物流列才能用 auto 按内容自适应、每行又对齐 */
.stats-table {
  display: grid;
  /* 物品 | 物流 | 净产 | 产出 | 消耗；各列按内容自适应并留最小宽度，名称列吃剩余空间 */
  grid-template-columns:
    minmax(0, 1fr)
    minmax(30px, auto)
    minmax(40px, auto)
    minmax(40px, auto)
    minmax(40px, auto);
  /* 格子必须撑满整行: 否则各格高度不同，各自的 border-bottom 会错开 */
  align-items: stretch;
  min-width: 0;
}

.stats-row {
  display: contents;
}

.stats-row > * {
  display: flex;
  align-items: center;
  padding: 5px 4px;
  border-bottom: 1px solid var(--line-soft);
  font-size: 12px;
  color: var(--fg-value);
  min-width: 0;
}

.stats-row:not(.stats-header):hover > * {
  background: #16233c;
}

/* 列头就是排序按钮: 铺满整格 */
.stats-sort {
  display: flex;
  align-items: center;
  gap: 1px;
  width: 100%;
  margin: 0;
  background: none;
  border: none;
  color: inherit;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.stats-sort.stats-num {
  justify-content: flex-end;
}

.stats-sort:hover {
  color: var(--fg);
}

/* 表头吸顶: 行是 display: contents，只能让每个表头格子自己 sticky */
.stats-header > * {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 5px 4px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-panel);
  color: var(--fg-secondary);
}

.stats-arrow {
  font-size: 10px;
  color: #6ea8ff;
}

.stats-num {
  justify-content: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stats-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.stats-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.stats-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 生产详情表下方的说明 */
.stats-note {
  padding: 0 4px;
  font-size: 12px;
  color: var(--fg-muted);
}

/* ── 物流列（auto 宽度，内容多就整列变宽） ─────────────── */
.stats-logi {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 5px;
  min-width: 0;
}

.logi {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.logi-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
}

/* 输出 ↑ / 输入 ↓；两者都有时上下叠一对 */
.logi-arrows {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logi-arrow {
  display: block;
  width: 5px;
  height: 7px;
  fill: currentColor;
}

.logi-arrow.out {
  color: #5fd3f2; /* 供应侧 青 */
}

.logi-arrow.in {
  color: #ef9a5a; /* 需求侧 橙 */
}
</style>
