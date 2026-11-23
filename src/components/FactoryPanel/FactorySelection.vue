<script setup lang="ts">
/** 详情: 预览里点中的那栋建筑 */
import { computed, reactive, ref, watch } from 'vue'
import { convertStationType, deleteBuilding, factory, flipInserter, labStackCount, updateBuilding, selectedBuilding, selectedBuildingCoord, selectedBuildingEndCoord } from '../../stores/factory'
import type { BuildingChanges } from '../../stores/factory'
import { isAssembler, isBelt, isInserter, isLab, isStation, isTurret, itemName } from '../../blueprint/factory/factoryItems.js'
import { cloneData } from '../../utils/clonePlain.js'
import { itemIconUrl } from '../../factory/icon/itemIcons'
import type { IconCategories } from '../../factory/icon/iconCatalog'
import { ICON_CATEGORIES } from '../../factory/icon/iconCatalog'
import { show } from '../../stores/toast'
import { experimentalFeatures } from '../../stores/tool'
import FactoryAssembler from './params/FactoryAssembler.vue'
import FactoryBelt from './params/FactoryBelt.vue'
import FactoryDispenser from './params/FactoryDispenser.vue'
import FactoryEjector from './params/FactoryEjector.vue'
import FactoryInserter from './params/FactoryInserter.vue'
import FactoryMonitor from './params/FactoryMonitor.vue'
import FactoryMarker from './params/FactoryMarker.vue'
import FactoryParamSelect from './params/FactoryParamSelect.vue'
import FactoryStation from './params/FactoryStation.vue'
import FactoryStorage from './params/FactoryStorage.vue'
import FactoryTurret from './params/FactoryTurret.vue'

/** 储液罐的输出/输入；参数解析后是 bool */
const TANK_SWITCH_OPTIONS = [
  { value: true, name: '开' },
  { value: false, name: '关' },
]

/** 图标与名字 */
const icon = computed(() => (selectedBuilding.value ? itemIconUrl(selectedBuilding.value.itemId) : ''))
const name = computed(() => (selectedBuilding.value ? itemName(selectedBuilding.value.itemId) : ''))

/** 网格坐标（格） */
const coord = computed(() => selectedBuildingCoord.value)
/** 分拣器的第 2 组坐标（格）: 爪臂末端；其余建筑不显示 */
const endCoord = computed(() => (isInserter(selectedBuilding.value?.itemId)
  ? selectedBuildingEndCoord.value
  : null))
/** 原始坐标 */
const localCoord = computed(() => {
  const building = selectedBuilding.value
  if (!building) return null
  const offset = building?.localOffset?.[0]
  if (!offset) return null
  return {
    area: building?.areaIndex,
    x: offset.x,
    y: offset.y,
    z: offset.z,
  }
})
/** 原始坐标的第 2 组（分拣器 = 爪臂末端） */
const localCoordEnd = computed(() => {
  const building = selectedBuilding.value
  if (!building) return null
  const offset = building?.localOffset?.[1] ?? building?.localOffset?.[0]
  if (!offset) return null
  return {
    area: building?.areaIndex,
    x: offset.x,
    y: offset.y,
    z: offset.z,
  }
})

/** 问号提示里的原始坐标 */
function rawHint(point: { area?: number, x: number, y: number, z: number } | null) {
  return point ? `区域${point.area}：x=${point.x}, y=${point.y}, z=${point.z}` : ''
}

/** 头部坐标行: 分拣器两组（抓取端 / 放下端），其余建筑只有一组 */
const coordRows = computed(() => {
  const first = coord.value
  if (!first) return []
  const inserter = isInserter(selectedBuilding.value?.itemId)
  const rows = [{
    label: inserter ? '抓取端' : '位置',
    coord: first,
    hint: rawHint(localCoord.value),
  }]
  if (inserter && endCoord.value) {
    rows.push({
      label: '放下端',
      coord: endCoord.value,
      hint: rawHint(localCoordEnd.value),
    })
  }
  return rows
})

/** 调整传送带和分拣器的坐标 */
const canAdjustCoord = computed(() => {
  const building = selectedBuilding.value
  if (!building || !Array.isArray(building.localOffset)) return false
  return isBelt(building.itemId) || isInserter(building.itemId)
})

/** 坐标微调的增量 */
const coordOffset = reactive([
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
])

/** X / Y / Z 三个输入框 */
const COORD_AXES = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'z', label: 'Z' },
] as const

/** 增量行 */
const coordOffsetRows = computed(() => {
  const inserter = isInserter(selectedBuilding.value?.itemId)
  const labels = inserter ? ['抓取', '卸下'] : ['坐标']
  const points = inserter ? [localCoord.value, localCoordEnd.value] : [localCoord.value]
  return labels.map((label, i) => {
    const point = points[i]
    return {
      label,
      index: i,
      values: point?? { x: '', y: '', z: '' },
    }
  })
})

/** 有没有填过增量 */
const coordOffsetDirty = computed(() => (
  coordOffset.some((point) => point.x !== 0 || point.y !== 0 || point.z !== 0)
))

/** 改一项增量 */
function onCoordOffsetChange(i: number, axis: 'x' | 'y' | 'z', e: Event) {
  const el = e.target as HTMLInputElement
  const typed = Number(el.value)
  const value = Number.isFinite(typed) ? +typed.toFixed(4) : 0
  coordOffset[i][axis] = value === 0 ? 0 : value // -0 收成 0
  el.value = String(coordOffset[i][axis])
}

/** 增量归零 */
function resetCoordOffset() {
  for (const point of coordOffset) {
    point.x = 0
    point.y = 0
    point.z = 0
  }
}

/** 留 4 位小数 */
function round4(value: number) {
  return Number.isFinite(value) ? +value.toFixed(4) : 0
}

/** 坐标数值 */
function num(value: number) {
  const ticks = Math.round(Math.abs(value) * 10000) // 先回到 4 位小数的整数刻度
  const rounded = Math.sign(value) * Math.round(ticks / 100) / 100
  return String(rounded === 0 ? 0 : rounded) // -0 收成 0
}

/** 暂存的改动 */
const staged = reactive<Record<string, any>>({})

/**
 * 建筑参数（用来显示）
 */
const parameters = computed(() => staged.parameters ?? selectedBuilding.value?.parameters ?? {})

/**
 * 拿到「正在编辑的建筑参数」: 第一次改时拷一份。
 * 用 cloneData 而不是 structuredClone —— 选中建筑的参数是 Vue 响应式代理，克隆代理会抛 DataCloneError
 */
function editParameters(): Record<string, any> {
  if (staged.parameters === undefined) {
    const current = selectedBuilding.value?.parameters
    staged.parameters = current ? cloneData(current) : {}
  }
  return staged.parameters
}

/** 子组件改了一项参数: 落进暂存（点保存才写回蓝图） */
function onParametersChange(key: string, value: unknown) {
  editParameters()[key] = value
}

/** 物品栏图标选择器用的分类: 「物品」+「建筑」 */
const itemIcons = computed<IconCategories>(() => {
  const out: IconCategories = {}
  for (const name of ['物品', '建筑']) {
    const list = ICON_CATEGORIES[name]
    if (list) out[name] = list
  }
  return out
})

/** 有没有改过 */
const dirty = computed(() => Object.keys(staged).length > 0 || coordOffsetDirty.value)

/** 「星际 → 行星内」要丢弃的物品栏位（1-5） */
const dropSlot = ref(5)

/** 参数组件报上来的提示 */
const paramHint = ref('')

/** 这栋连在一起的研究站有几个；不是研究站给 0。 */
const labCount = computed(() => (isLab(selectedBuilding.value?.itemId)
  ? labStackCount(Number(selectedBuilding.value?.index))
  : 0))

/** 分拣器两端连接：inputObjIdx / outputObjIdx 指向的建筑 */
const inserterConnection = computed(() => {
  const building = selectedBuilding.value
  const buildings = factory.blueprint?.buildings
  if (!building || !Array.isArray(buildings)) return { input: null, output: null }
  const at = (target: unknown) => {
    const index = Number(target)
    const targetBuilding = buildings[index]
    if (!targetBuilding || Number(targetBuilding.index) !== index) return null
    return { index, itemId: Number(targetBuilding.itemId) }
  }
  return {
    input: at(building.inputObjIdx),
    output: at(building.outputObjIdx),
  }
})

/** 清空暂存 */
function resetStaged() {
  for (const key of Object.keys(staged)) delete staged[key]
  resetCoordOffset()
}

/** 保存: 把改过的项交出 */
function onSave() {
  const building = selectedBuilding.value
  if (!building || !dirty.value) return

  const changes: BuildingChanges = { ...staged }
  if (experimentalFeatures && coordOffsetDirty.value && Array.isArray(building.localOffset)) {
    const points = building.localOffset as Array<{ x: number, y: number, z: number }>
    const inserter = isInserter(building.itemId)
    changes.localOffset = points.map((item, i) => {
      const delta = inserter ? (coordOffset[i] ?? coordOffset[0]) : coordOffset[0]
      return {
        x: round4(item.x + delta.x),
        y: round4(item.y + delta.y),
        z: round4(item.z + delta.z),
      }
    })
  }

  const ok = updateBuilding(Number(building.index), changes)
  // 保存成功就清空暂存
  if (ok) resetStaged()
  show(ok ? '已保存该建筑的修改' : '保存失败：没找到该建筑')
}

/** 删除选中的建筑: 立即生效 */
function onDeleteBuilding() {
  const building = selectedBuilding.value
  if (!building) return

  const index = Number(building.index)
  const label = name.value
  if (!deleteBuilding(index)) {
    show('删除失败：没找到该建筑')
    return
  }
  show(`已删除 #${index} ${label}`)
}

/** 反转分拣器: 交换抓取端和放下端（立即生效） */
function onReverseInserter() {
  const building = selectedBuilding.value
  if (!building) return
  const ok = flipInserter(Number(building.index))
  show(ok ? '已反转分拣器' : '反转失败：没找到该分拣器')
}

// 换选中建筑时清空暂存和提示
watch(() => selectedBuilding.value?.index, () => {
  resetStaged()
  paramHint.value = ''
})

</script>

<template>
  <div v-if="selectedBuilding" class="factory-selection">
    <div class="factory-selection-row">
      <span class="factory-selection-index">#{{ selectedBuilding.index }}</span>
      <div class="factory-selection-title">
        <img v-if="icon" class="factory-icon factory-selection-icon" :src="icon" :alt="name" />
        <span class="factory-selection-name">{{ name }}</span>
      </div>
      <span v-if="labCount > 1" class="factory-selection-group">×{{ labCount }}</span>
      <span v-if="coordRows.length" class="factory-selection-coord">
        <span
          v-for="row in coordRows"
          :key="row.label"
          class="factory-selection-coord-line"
        >
          <span>{{ row.label }} ({{ num(row.coord.x) }}, {{ num(row.coord.y) }})</span>
          <span>高 {{ num(row.coord.z) }}</span>
          <span class="factory-selection-coord-hint" :title="row.hint">
            <svg viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6.8" />
              <path
                class="factory-selection-coord-hint-mark"
                d="M6.1 6A2 2 0 0 1 9.99 6.67c0 1.33-2 2-2 2"
              />
              <circle class="factory-selection-coord-hint-dot" cx="8" cy="11.4" r="0.88" />
            </svg>
          </span>
        </span>
      </span>
    </div>

    <div
      v-if="[2103, 2104].includes(selectedBuilding?.itemId)"
      class="factory-selection-param factory-selection-row"
    >
      <button
        class="btn-sm"
        type="button"
        :title="dirty?'同时保存当前修改':''"
        @click="onSave(), convertStationType(selectedBuilding.index, dropSlot)"
      >{{ selectedBuilding.itemId === 2103 ? '替换为星际' : "替换为本地" }}</button>
      <template v-if="selectedBuilding.itemId === 2104">
        <span class="factory-selection-label">丢弃槽位:</span>
        <select
          class="factory-selection-select"
          :value="dropSlot"
          @change="(e) => (dropSlot = Number((e.target as HTMLSelectElement).value))"
        >
          <option
            v-for="(row, i) in parameters.storage"
            :key="i" :value="Number(i)+1"
          >槽位{{ Number(i)+1 }}-{{ row.itemId > 0 ?itemName(row.itemId) :'无' }}</option>
        </select>
      </template>
    </div>

    <!-- 分拣器连接 -->
    <div
      v-if="isInserter(selectedBuilding.itemId)"
      class="factory-selection-param factory-selection-row factory-inserter-connection"
    >
      <span class="factory-inserter-end">
        <template v-if="inserterConnection.input">
          <span class="factory-inserter-index">#{{ inserterConnection.input.index }}</span>
          <img
            class="factory-icon factory-inserter-icon"
            :src="itemIconUrl(inserterConnection.input.itemId)"
            :alt="itemName(inserterConnection.input.itemId)"
          />
          <span class="factory-inserter-name">{{ itemName(inserterConnection.input.itemId) }}</span>
        </template>
        <span v-else class="factory-inserter-none">---</span>
      </span>
      <span class="factory-inserter-arrow">→</span>
      <span class="factory-inserter-end">
        <template v-if="inserterConnection.output">
          <span class="factory-inserter-index">#{{ inserterConnection.output.index }}</span>
          <img
            class="factory-icon factory-inserter-icon"
            :src="itemIconUrl(inserterConnection.output.itemId)"
            :alt="itemName(inserterConnection.output.itemId)"
          />
          <span class="factory-inserter-name">{{ itemName(inserterConnection.output.itemId) }}</span>
        </template>
        <span v-else class="factory-inserter-none">---</span>
      </span>
      <button
        class="btn-sm btn-ghost factory-inserter-reverse"
        type="button"
        @click="onReverseInserter"
      >反转</button>
    </div>

    <div class="factory-selection-divider" />

    <!-- 制造设备 -->
    <FactoryAssembler
      v-if="isAssembler(selectedBuilding.itemId) || isLab(selectedBuilding.itemId)"
      :key="selectedBuilding.index"
      :item-id="Number(selectedBuilding.itemId)"
      :recipe-id="Number(staged.recipeId ?? selectedBuilding.recipeId ?? 0)"
      :parameters="parameters"
      @change="onParametersChange"
      @update:recipe-id="(v) => (staged.recipeId = v)"
    />

    <!-- 传送带 -->
    <FactoryBelt
      v-if="isBelt(selectedBuilding.itemId)"
      :key="selectedBuilding.index"
      :parameters="parameters"
      :item-icons="ICON_CATEGORIES"
      @change="onParametersChange"
    />

    <!-- 分拣器 -->
    <FactoryInserter
      v-if="isInserter(selectedBuilding.itemId)"
      :key="selectedBuilding.index"
      :length="Number(parameters?.length ?? 0)"
      :filter-id="Number(staged.filterId ?? selectedBuilding.filterId ?? 0)"
      :item-icons="itemIcons"
      @update:filter-id="(v) => (staged.filterId = v)"
    />

    <!-- 物流运输站类（2103 行星内 / 2104 星际 / 2316 大型采矿机） -->
    <FactoryStation
      v-if="isStation(selectedBuilding.itemId)"
      :key="selectedBuilding.index"
      :item-id="Number(selectedBuilding.itemId)"
      :parameters="parameters"
      :item-icons="itemIcons"
      @change="onParametersChange"
      @hint="(text) => (paramHint = text)"
    />

    <!-- 物流配送器（2107） -->
    <FactoryDispenser
      v-if="Number(selectedBuilding.itemId) === 2107"
      :key="selectedBuilding.index"
      :filter-id="Number(staged.filterId ?? selectedBuilding.filterId ?? 0)"
      :parameters="parameters"
      :item-icons="itemIcons"
      @update:filter-id="(v) => (staged.filterId = v)"
      @change="onParametersChange"
    />

    <!-- 射线接收站（2208） -->
    <FactoryParamSelect
      v-if="Number(selectedBuilding.itemId) === 2208"
      :key="selectedBuilding.index"
      :parameters="parameters"
      field="productId"
      name="模式"
      :options="[{ value: 0, name: '直接发电' }, { value: 1208, name: '光子生成' }]"
      @change="onParametersChange"
    />

    <!-- 电磁轨道弹射器（2311）/ 垂直发射井（2312） -->
    <FactoryEjector
      v-if="[2311, 2312].includes(Number(selectedBuilding.itemId))"
      :key="selectedBuilding.index"
      :item-id="Number(selectedBuilding.itemId)"
      :parameters="parameters"
      @change="onParametersChange"
    />

    <!-- 流速监测器（2030） -->
    <FactoryMonitor
      v-if="Number(selectedBuilding.itemId) === 2030"
      :key="selectedBuilding.index"
      :parameters="parameters"
    />

    <!-- 全息信标（2401） -->
    <FactoryMarker
      v-if="Number(selectedBuilding.itemId) === 2401"
      :key="selectedBuilding.index"
      :parameters="parameters"
      :content="selectedBuilding.content"
      :index="Number(selectedBuilding.index)"
    />

    <!-- 炮台（3001-3006 / 3010） -->
    <FactoryTurret
      v-if="isTurret(Number(selectedBuilding.itemId))"
      :key="selectedBuilding.index"
      :item-id="Number(selectedBuilding.itemId)"
      :parameters="parameters"
    />

    <!-- 储物仓（2101 / 2102）与战场分析基站（3009） -->
    <FactoryStorage
      v-if="[2101, 2102, 3009].includes(Number(selectedBuilding.itemId))"
      :key="selectedBuilding.index"
      :type="Number(selectedBuilding.itemId)"
      :parameters="parameters"
    />

    <!-- 储液罐（2106）：输出 / 输入两个下拉 -->
    <template v-if="Number(selectedBuilding.itemId) === 2106">
      <FactoryParamSelect
        :parameters="parameters"
        field="output"
        name="输出"
        :options="TANK_SWITCH_OPTIONS"
        :readonly="true"
      />
      <FactoryParamSelect
        :parameters="parameters"
        field="input"
        name="输入"
        :options="TANK_SWITCH_OPTIONS"
        :readonly="true"
      />
    </template>

    <!-- 能量枢纽（2209） -->
    <FactoryParamSelect
      v-if="Number(selectedBuilding.itemId) === 2209"
      :key="selectedBuilding.index"
      :parameters="parameters"
      field="mode"
      name="模式"
      :options="[{ value: -1, name: '放电' }, { value: 0, name: '待机' }, { value: 1, name: '充电' }]"
      :readonly="true"
    />

    <!-- 调整传送带和分拣器的坐标 -->
    <template v-if="experimentalFeatures && canAdjustCoord">
      <div class="factory-selection-divider" />
      <div class="factory-selection-params">
        <div class="factory-selection-row factory-selection-param">
          <span
            class="factory-selection-label"
            title="增量会加到蓝图里这栋建筑的 localOffset 上，点「保存修改」才写回"
          >调整坐标</span>
          <span class="factory-coord-offset-unit">偏移量</span>
          <button
            class="btn-sm btn-ghost factory-coord-offset-reset"
            type="button"
            :disabled="!coordOffsetDirty"
            @click="resetCoordOffset"
          >归零</button>
        </div>
        <div
          v-for="row in coordOffsetRows"
          :key="row.label"
          class="factory-selection-row factory-selection-param factory-coord-offset-row"
        >
          <span class="factory-selection-label">{{ row.label }}</span>
          <label
            v-for="axis in COORD_AXES"
            :key="axis.key"
            class="factory-coord-offset-field"
          >
            <span>{{ axis.label + ':' +row.values[axis.key]}}</span>
            <span>+</span>
            <form novalidate><input
              class="factory-coord-offset-input"
              type="number"
              step="0.25"
              :value="coordOffset[row.index][axis.key]"
              @change="onCoordOffsetChange(row.index, axis.key, $event)"
            /></form>
          </label>
        </div>
      </div>
    </template>

    <div class="factory-selection-divider" />

    <!-- 编辑: 有改动才可点 -->
    <div class="factory-selection-actions">
      <button
        class="btn-sm factory-selection-delete"
        type="button"
        @click="onDeleteBuilding"
      >删除建筑</button>
      <span class="factory-selection-hint" role="status">{{ paramHint }}</span>
      <button
        class="btn-sm btn-ghost"
        type="button"
        :disabled="!dirty"
        @click="resetStaged"
      >放弃修改</button>
      <button
        class="btn-sm btn-primary"
        type="button"
        :disabled="!dirty"
        @click="onSave"
      >保存修改</button>
    </div>
  </div>
  <div v-else class="factory-selection-empty">未选择建筑</div>
</template>

<style scoped>
.factory-selection {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 0;
}

.factory-selection-index {
  font-size: 14px;
  font-weight: bold;
  color: var(--fg-accent);
}

/* 分隔线 */
.factory-selection-divider {
  height: 0;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}

.factory-selection-title {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* 图标与参数字行的样式都是两处以上在用，见 styles/shared.css */

.factory-selection-name {
  font-size: 18px;
  color: var(--fg);
}

/* 贴行尾；等宽数字，换建筑时不左右抖 */
.factory-selection-coord {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}

/* 一行坐标: 位置 + 高 + 问号 */
.factory-selection-coord-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 问号提示 */
.factory-selection-coord-hint {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.8;
}

/* 线性圆圈 + 问号，颜色从坐标行继承 */
.factory-selection-coord-hint svg {
  display: block;
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.15;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.factory-selection-coord-hint-mark {
  stroke-width: 1.4;
}

/* 问号下面那一点是实心圆，不跟着走描边 */
.factory-selection-coord-hint-dot {
  fill: currentColor;
  stroke: none;
}

.factory-selection-group {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--fg-secondary);
  font-variant-numeric: tabular-nums;
}

/* 分拣器连接 */
.factory-inserter-connection {
  flex-wrap: wrap;
  row-gap: 4px;
}

.factory-inserter-end {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 4px;
}

.factory-inserter-index {
  flex-shrink: 0;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.factory-inserter-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.factory-inserter-name {
  min-width: 0;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.factory-inserter-arrow {
  flex-shrink: 0;
  color: var(--fg-secondary);
}

.factory-inserter-none {
  color: var(--fg-muted);
}

/* 反转: 交换抓取端 / 放下端 */
.factory-inserter-reverse {
  flex-shrink: 0;
  margin-left: 2px;
}

.factory-coord-offset-unit {
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
}

.factory-coord-offset-reset {
  flex-shrink: 0;
  margin-left: auto;
}

.factory-coord-offset-row {
  flex-wrap: wrap;
  row-gap: 4px;
}

.factory-coord-offset-field {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
  font-size: 12px;
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.factory-coord-offset-input {
  width: 60px;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line-strong);
  background: var(--bg-component);
  color: var(--fg-secondary);
  font-family: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.factory-coord-offset-input:focus {
  outline: none;
  border-color: var(--accent);
}

.factory-selection-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 4px;
}

/* 按钮左边的提示位 */
.factory-selection-hint {
  font-size: 12px;
  color: var(--fg-muted);
  min-height: 16px;
}

/* 删除建筑: 单独放操作行最左边，跟保存 / 放弃隔开 */
.factory-selection-delete {
  margin-right: auto;
  border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
  background: transparent;
  color: var(--danger);
}

.factory-selection-delete:hover {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
}

.factory-selection-empty {
  padding: 8px 2px;
  font-size: 14px;
  color: var(--fg-muted);
}
</style>
