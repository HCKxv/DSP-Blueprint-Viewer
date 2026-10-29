<script setup lang="ts">
/**
 * 批量编辑
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import IconPickerModal from './IconPickerModal.vue'
import { applyBatchEdit, batchRules } from '../../stores/factory'
import type { BatchRule, FactoryBlueprint } from '../../stores/factory'
import { batchUp, editAutoOrbit, editFilter, editRecipe, editStationItems } from '../../lib/factory/batchEdit.js'
import { recipeCategoriesAll, recipeCategoriesOfType } from '../../lib/markup/recipeCatalog'
import { recipeName, recipeType } from '../../lib/blueprint/factory/factoryRecipes.js'
import { itemName } from '../../lib/blueprint/factory/factoryItems.js'
import { ICON_CATEGORIES } from '../../lib/markup/iconCatalog'
import { itemIconUrl } from '../../lib/markup/itemIcons'
import type { IconCategories, IconRef } from '../../lib/markup/itemIcons'
import { useToast } from '../../composables/useToast'

const toast = useToast()

/** 一条规则类型: 生成初始 options、把规则作用到蓝图 */
interface BatchRuleType {
  id: string
  kind: 'replace' | 'action'
  /** 菜单 / 列表里的名字 */
  label: string
  /** 规则行里的补充说明 */
  hint?: string
  /** 新规则的初始 options */
  options: () => Record<string, any>
  /** 把规则作用到蓝图上 */
  run: (blueprint: FactoryBlueprint, options: Record<string, any>) => boolean
}

/**
 * 按规则类型生成一条规则
 *
 * run 只接 blueprint；界面上改 rule.options 改的就是闭包捕获的这一份。
 */
function createRule(type: BatchRuleType): BatchRule {
  const options = type.options()
  return {
    type: type.id,
    kind: type.kind,
    run: (blueprint: FactoryBlueprint) => type.run(blueprint, options),
    options,
  }
}

/** 批量编辑的规则类型表 */
const BATCH_RULE_TYPES: BatchRuleType[] = [
  {
    id: 'upgrade',
    kind: 'replace',
    label: '升降级建筑',
    options: () => ({ from: 0, to: 0 }),
    run: batchUp,
  },
  {
    id: 'recipe',
    kind: 'replace',
    label: '替换配方',
    options: () => ({ from: 0, to: 0, acceleratorMode: null }),
    run: editRecipe,
  },
  {
    id: 'stationItem',
    kind: 'replace',
    label: '修改物流塔物品',
    options: () => ({ from: 0, to: 0 }),
    run: editStationItems,
  },
  {
    id: 'filter',
    kind: 'replace',
    label: '修改物品过滤',
    options: () => ({ from: 0, to: 0, target: '分拣器' }),
    run: editFilter,
  },
  {
    id: 'autoOrbit',
    kind: 'action',
    label: '设为自动轨道弹射',
    hint: '全部电磁轨道弹射器',
    options: () => ({}),
    run: editAutoOrbit,
  },
]

/** 配方图标 id = 20000 + 配方 id */
const RECIPE_ICON_BASE = 20000

/** 浮窗标题 */
const PICKER_NOUN: Record<string, string> = {
  recipe: '配方',
  upgrade: '建筑',
  stationItem: '物品',
  filter: '物品',
}

/** 增产模式下拉选项（替换配方用）: 「不修改」= null */
const ACCELERATOR_OPTIONS: { value: string, label: string }[] = [
  { value: 'null', label: '不修改' },
  { value: '0', label: '额外产出' },
  { value: '1', label: '生产加速' },
]

/** 下拉当前该显示哪一项 */
function acceleratorValue(options: Record<string, any>): string {
  const value = options?.acceleratorMode
  return value === null || value === undefined ? 'null' : String(value)
}

/** 选了增产模式: 'null' 记号转回 null，其余转成挡位数字 */
function onAcceleratorChange(options: Record<string, any>, e: Event) {
  const raw = (e.target as HTMLSelectElement).value
  options.acceleratorMode = raw === 'null' ? null : Number(raw)
}

/** 「类型」下拉的选项（替换物品过滤用，跟 batchEdit.js 的 editFilter 对应） */
const FILTER_TARGETS = ['全部', '分拣器', '四向', '配送器']

/** 选了要改哪些建筑上的过滤 */
function onTargetChange(options: Record<string, any>, e: Event) {
  options.target = (e.target as HTMLSelectElement).value
}

/** 物流塔物品替换: 物品 + 建筑两类 */
const ITEM_CATEGORIES: IconCategories = (() => {
  const out: IconCategories = {}
  for (const name of ['物品', '建筑']) {
    const list = ICON_CATEGORIES[name]
    if (list) out[name] = list
  }
  return out
})()

/** 建筑 id → 浮窗里的一项 */
function buildingEntry(id: number): IconRef {
  return { id, name: itemName(id) || `#${id}` }
}

/** 可升降级的建筑 */
const UPGRADE_GROUPS = [
  { label: '传送带', items: [2001, 2002, 2003] },
  { label: '分拣器', items: [2011, 2012, 2013, 2014] },
  { label: '熔炉', items: [2302, 2315, 2319] },
  { label: '化工厂', items: [2309, 2317] },
  { label: '制造台', items: [2303, 2304, 2305, 2318] },
  { label: '研究站', items: [2901, 2902] },
]

/** 这栋建筑属于哪一组可升降级建筑；不在表里给 null */
function upgradeGroupOf(itemId: unknown) {
  const id = Number(itemId) || 0
  return UPGRADE_GROUPS.find((group) => group.items.includes(id)) ?? null
}

/** 可升降级建筑的浮窗选项 */
const UPGRADE_CATEGORIES: IconCategories = {
  可升降级建筑: UPGRADE_GROUPS.flatMap((group) => group.items.map(buildingEntry)),
}

/** 「添加规则」的下拉框 */
const addOpen = ref(false)
const addBox = ref<HTMLElement | null>(null)

/** 选择浮窗: 给哪条规则的哪个格子选 */
const picker = reactive({
  open: false,
  /** 正在改哪条规则的 options（和规则里是同一个对象） */
  options: null as Record<string, any> | null,
  /** 规则类型: 决定浮窗里列哪些项 */
  type: '',
  /** from = 被替换；to = 替换为（只在被替换那一类/组里选） */
  field: 'from' as 'from' | 'to',
  anchor: null as HTMLElement | null,
})

/** 按 id 取规则类型 */
function ruleTypeOf(type: string) {
  return BATCH_RULE_TYPES.find((item) => item.id === type)
}

/** 规则类型的中文名 */
function labelOf(type: string): string {
  return ruleTypeOf(type)?.label ?? type
}

/** 是不是「被替换 → 替换为」两格的规则 */
function isReplaceRule(kind: string): boolean {
  return kind === 'replace'
}

/** 规则行里的补充说明 */
function hintOf(type: string): string {
  return ruleTypeOf(type)?.hint ?? ''
}

/** 格子里的图标地址: 配方图标 id = 20000 + 配方 id，物品 / 建筑直接用 id；0（没选）给空串 */
function slotIcon(type: string, id: unknown): string {
  const value = Number(id) || 0
  if (value <= 0) return ''
  return itemIconUrl(type === 'recipe' ? RECIPE_ICON_BASE + value : value)
}

/** 格子里的名字: 现在只用作图片的 alt */
function slotText(type: string, id: unknown): string {
  const value = Number(id) || 0
  if (value <= 0) return ''
  if (type === 'recipe') return recipeName(value) || `未知配方_${value}`
  return itemName(value) || `未知物品_${value}`
}

// ── 规则数组 ──────────────────────────────────────────────

/** 加一条空规则 */
function addRule(typeId: string) {
  const type = ruleTypeOf(typeId)
  if (!type) return
  batchRules.value.push(createRule(type))
  addOpen.value = false
}

function removeRule(index: number) {
  const rule = batchRules.value[index]
  if (!rule) return
  if (picker.options === rule.options) closePicker()
  batchRules.value.splice(index, 1)
}

/** 点「添加规则」的外面就收起来 */
function onDocMouseDown(e: MouseEvent) {
  if (!addBox.value?.contains(e.target as Node)) addOpen.value = false
}

watch(addOpen, (open) => {
  if (open) document.addEventListener('mousedown', onDocMouseDown)
  else document.removeEventListener('mousedown', onDocMouseDown)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))

// ── 选择浮窗 ──────────────────────────────────────────────

/** 关掉浮窗，顺便松开对 options 的引用 */
function closePicker() {
  picker.open = false
  picker.options = null
}

function openPicker(rule: BatchRule, field: 'from' | 'to', e: MouseEvent) {
  // action 规则没有格子，不该走到这儿
  if (!isReplaceRule(rule.kind)) return
  // 「替换为」要先有「被替换」: 不知道类型就不知道该列哪些配方
  if (field === 'to' && !(Number(rule.options.from) > 0)) return
  picker.options = rule.options
  picker.type = rule.type
  picker.field = field
  picker.anchor = e.currentTarget as HTMLElement
  picker.open = true
}

/** 浮窗里列哪些项: 按规则类型和当前格子定 */
const pickerCategories = computed<IconCategories>(() => {
  const options = picker.options
  if (!options) return {}

  if (picker.type === 'recipe') {
    // 被替换 = 全量配方；替换为 = 被替换那个配方所属类型里的配方
    if (picker.field === 'from') return recipeCategoriesAll()
    return recipeCategoriesOfType(recipeType(Number(options.from) || 0))
  }

  if (picker.type === 'upgrade') {
    // 被替换 = 全部可升降级建筑；替换为 = 同组里的建筑（都放一个分类，不显示分类按钮）
    if (picker.field === 'from') return UPGRADE_CATEGORIES
    const group = upgradeGroupOf(options.from)
    return group ? { 可升降级建筑: group.items.map(buildingEntry) } : {}
  }

  // 物流塔物品替换: 物品 + 建筑
  return ITEM_CATEGORIES
})

/** 浮窗标题: 选择 + 这一类东西的名字 */
const pickerTitle = computed(() => `选择${PICKER_NOUN[picker.type] ?? ''}`)

/** 当前这一格上的图标 id（高亮用）: 配方要加 20000 的基数，物品 / 建筑就是 id 本身 */
const pickerCurrent = computed(() => {
  const id = Number(picker.options?.[picker.field]) || 0
  if (!id) return 0
  return picker.type === 'recipe' ? RECIPE_ICON_BASE + id : id
})

/** 「替换为」这一格还合不合法（换了被替换之后） */
function toStillValid(type: string, from: unknown, to: number): boolean {
  if (type === 'recipe') return recipeType(to) === recipeType(Number(from) || 0)
  if (type === 'upgrade') return !!upgradeGroupOf(from)?.items.includes(to)
  return true // 物流塔物品替换: 物品 / 建筑都能换，不受被替换限制
}

function onPick(icon: IconRef) {
  const options = picker.options
  if (!options) return
  // 配方取 recipeId，物品 / 建筑取图标 id（= 物品 id）
  const value = picker.type === 'recipe' ? Number(icon?.recipeId) || 0 : Number(icon?.id) || 0
  if (!value) return

  options[picker.field] = value
  // 换了「被替换」就换了可选项，原来的「替换为」可能已经不在里头 → 清掉重选
  const to = Number(options.to) || 0
  if (picker.field === 'from' && to > 0 && !toStillValid(picker.type, options.from, to)) options.to = 0

  closePicker()
}

// ── 确认 ──────────────────────────────────────────────────

function onConfirm() {
  const res = applyBatchEdit()
  if (!res.ok) {
    toast.show(res.message)
    return
  }
  // 浮窗可能正指着一条已经没了的规则，关掉
  closePicker()
  toast.show('已应用规则')
}
</script>

<template>
  <div class="factory-batch">
    <!-- 规则数组: replace 规则是两格「被替换 → 替换为」；action 规则没有格子，只写作用范围 -->
    <div v-if="batchRules.length" class="factory-batch-list">
      <div v-for="(rule, index) in batchRules" :key="index" class="factory-batch-rule">
        <span class="factory-batch-label">{{ labelOf(rule.type) }}：</span>

        <template v-if="isReplaceRule(rule.kind)">
          <button
            class="factory-batch-slot"
            type="button"
            @click="openPicker(rule, 'from', $event)"
          >
            <img
              v-if="rule.options.from"
              class="factory-icon"
              :src="slotIcon(rule.type, rule.options.from)"
              :alt="slotText(rule.type, rule.options.from)"
            />
            <!-- 没选: 空方框 + 加号 -->
            <svg v-else viewBox="0 0 16 16">
              <path d="M8 3.4v9.2" />
              <path d="M3.4 8h9.2" />
            </svg>
          </button>

          <span class="factory-batch-arrow">
            <svg viewBox="0 0 16 16">
              <path d="M2.8 8h10.2" />
              <path d="M9.4 4.4 13 8l-3.6 3.6" />
            </svg>
          </span>

          <button
            class="factory-batch-slot"
            type="button"
            :disabled="!rule.options.from"
            @click="openPicker(rule, 'to', $event)"
          >
            <img
              v-if="rule.options.to"
              class="factory-icon"
              :src="slotIcon(rule.type, rule.options.to)"
              :alt="slotText(rule.type, rule.options.to)"
            />
            <svg v-else viewBox="0 0 16 16">
              <path d="M8 3.4v9.2" />
              <path d="M3.4 8h9.2" />
            </svg>
          </button>

          <!-- 替换配方: 增产模式（不替换 = null） -->
          <template v-if="rule.type === 'recipe'">
            <span class="factory-batch-label factory-batch-accel">增产模式</span>
            <select
              class="factory-batch-select"
              :value="acceleratorValue(rule.options)"
              @change="onAcceleratorChange(rule.options, $event)"
            >
              <option v-for="opt in ACCELERATOR_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </template>

          <!-- 替换物品过滤: 类型（改哪些建筑上的过滤） -->
          <template v-if="rule.type === 'filter'">
            <span class="factory-batch-label factory-batch-accel">类型</span>
            <select
              class="factory-batch-select"
              :value="rule.options.target"
              @change="onTargetChange(rule.options, $event)"
            >
              <option v-for="name in FILTER_TARGETS" :key="name" :value="name">{{ name }}</option>
            </select>
          </template>
        </template>

        <!-- 没有格子的规则: 显示规则表里的补充说明 -->
        <span v-else class="factory-batch-hint">{{ hintOf(rule.type) }}</span>

        <button
          class="factory-batch-remove"
          type="button"
          @click="removeRule(index)"
        >
          <svg viewBox="0 0 16 16">
            <path d="M4.4 4.4 11.6 11.6" />
            <path d="M11.6 4.4 4.4 11.6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 添加规则: 跟规则项同尺寸的一整行，点开类型下拉；满 6 条就不显示 -->
    <div v-if="batchRules.length < 6" ref="addBox" class="factory-batch-add">
      <button class="factory-batch-rule factory-batch-plus" type="button" @click="addOpen = !addOpen">
        <svg viewBox="0 0 16 16">
          <path d="M8 3.4v9.2" />
          <path d="M3.4 8h9.2" />
        </svg>
      </button>
      <div v-if="addOpen" class="factory-batch-menu">
        <button
          v-for="type in BATCH_RULE_TYPES"
          :key="type.id"
          class="factory-batch-menu-item"
          type="button"
          @click="addRule(type.id)"
        >{{ type.label }}</button>
      </div>
    </div>

    <!-- 提交 -->
    <div class="factory-batch-actions">
      <button
        class="btn-sm factory-batch-confirm"
        type="button"
        :disabled="!batchRules.length
          || batchRules.some((rule) => isReplaceRule(rule.kind) && (!rule.options.from || !rule.options.to))"
        @click="onConfirm"
      >确认</button>
    </div>
  </div>

  <!-- 配方浮窗 -->
  <IconPickerModal
    :open="picker.open"
    :categories="pickerCategories"
    :current="pickerCurrent"
    :anchor="picker.anchor"
    :title="pickerTitle"
    @select="onPick"
    @close="closePicker"
  />
</template>

<style scoped>
.factory-batch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
  min-width: 0;
}

.factory-batch-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* 行高 = 格子 24 + 上下内边距 12 + 边框 2，跟「添加规则」那一行同高 */
.factory-batch-rule {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 38px;
  padding: 6px 8px;
  border: 1px solid #1f2c44;
  border-radius: 10px;
  background: #111a2b;
  min-width: 0;
}

.factory-batch-label {
  flex-shrink: 0;
  font-size: 13px;
  color: #8fa3c8;
}

/* 规则行里的补充说明 */
.factory-batch-hint {
  flex-shrink: 0;
  font-size: 13px;
  color: #7d90b0;
}

/* 方框里只有图标（没选就是空框 + 加号），点开配方浮窗 */
.factory-batch-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--bg-slot);
  color: #6d7a92; /* 空框里那个加号 */
  cursor: pointer;
}

/* 全局 button:hover 是蓝的，会把这块涂蓝，所以背景要自己写 */
.factory-batch-slot:hover:enabled {
  background: #22314b;
  border-color: var(--accent);
  color: var(--fg-strong);
}

.factory-batch-slot:disabled {
  opacity: 0.55;
  cursor: default;
}

.factory-batch-slot .factory-icon {
  width: 20px;
  height: 20px;
}

/* 没选时的加号比「添加规则」那个小一号 */
.factory-batch-slot svg {
  width: 10px;
  height: 10px;
}

.factory-batch-accel {
  margin-left: 2px;
}

.factory-batch-select {
  height: 24px;
  min-width: 0;
  padding: 0 4px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--bg-slot);
  color: var(--fg-value);
  font-size: 13px;
  cursor: pointer;
}

.factory-batch-select:hover {
  border-color: var(--accent);
}

.factory-batch-arrow {
  display: inline-flex;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: #6f8ec0;
}

/* 批量编辑里的线性图标 */
.factory-batch-arrow svg,
.factory-batch-plus svg,
.factory-batch-remove svg,
.factory-batch-slot svg {
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.factory-batch-arrow svg,
.factory-batch-remove svg {
  width: 100%;
  height: 100%;
}

.factory-batch-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: #6f8ec0;
  cursor: pointer;
}

.factory-batch-remove:hover {
  background: #22314b;
  border-color: var(--accent);
  color: var(--fg-strong);
}

.factory-batch-add {
  position: relative;
}

.factory-batch-plus {
  width: 100%;
  justify-content: center;
  color: var(--fg-icon);
  cursor: pointer;
}

.factory-batch-plus:hover {
  background: #16233a;
  border-color: var(--accent);
  color: var(--fg-strong);
}

.factory-batch-plus svg {
  width: 12px;
  height: 12px;
}

/* 贴在「添加规则」下面，宽度与那一行统一 */
.factory-batch-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--bg-pop);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.factory-batch-menu-item {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-value);
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.factory-batch-menu-item:hover {
  background: #22314b;
  color: var(--fg-strong);
}

.factory-batch-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* 主按钮配色（跟「保存」一致） */
.factory-batch-confirm {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
  cursor: pointer;
}

.factory-batch-confirm:hover:enabled {
  background: var(--accent-hover);
}

.factory-batch-confirm:disabled {
  background: var(--bg-slot);
  border-color: var(--line-strong);
  color: #6b7a95;
  cursor: default;
}
</style>
