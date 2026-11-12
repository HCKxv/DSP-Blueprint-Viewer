<script setup lang="ts">
/**
 * 批量编辑
 *
 * 规则和图标选择器的注册表都在 factory/batchRules.ts。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import IconPickerModal from './IconPickerModal.vue'
import { applyBatchEdit, batchRules } from '../../stores/factory'
import { BATCH_RULE_TYPES, createRule, hasReplace, hintOf, labelOf, pickerIconUrl, pickerName, pickerTypeOf, ruleTypeOf } from '../../factory/batchRules'
import type { BatchRule, BatchRuleSelect } from '../../factory/batchRules'
import type { IconCategories, IconRef } from '../../factory/ui/itemIcons'
import { show } from '../../stores/toast'

/** 「添加规则」的下拉框 */
const addOpen = ref(false)
const addBox = ref<HTMLElement | null>(null)

/** 选择浮窗: 给哪条规则的哪个格子选 */
const picker = reactive({
  open: false,
  /** 正在改哪条规则的 values（和规则里是同一个对象） */
  values: null as Record<string, any> | null,
  /** 图标选择器类型 id（来自替换选项的 typeId）: 决定浮窗里列哪些项 */
  type: '',
  /** from = 被替换；to = 替换为（只在被替换那一类/组里选） */
  field: 'from' as 'from' | 'to',
  anchor: null as HTMLElement | null,
})

/** 下拉当前选中的下标（值对不上就给第一项） */
function selectIndex(rule: BatchRule, select: BatchRuleSelect): number {
  const index = select.items.findIndex((item) => Object.is(item.value, rule.values[select.field]))
  return index >= 0 ? index : 0
}

/** 选了某个下拉项: 按存下来的 value 写回 values，数字 / null 等原始类型不变 */
function onSelectChange(rule: BatchRule, select: BatchRuleSelect, e: Event) {
  const item = select.items[(e.target as HTMLSelectElement).selectedIndex]
  if (item) rule.values[select.field] = item.value
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
  if (picker.values === rule.values) closePicker()
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

/** 关掉浮窗，顺便松开对 values 的引用 */
function closePicker() {
  picker.open = false
  picker.values = null
}

function openPicker(rule: BatchRule, pickerType: string, field: 'from' | 'to', e: MouseEvent) {
  // 「替换为」要先有「被替换」: 不知道类型就不知道该列哪些项
  if (field === 'to' && !(Number(rule.values.from) > 0)) return
  picker.values = rule.values
  picker.type = pickerType
  picker.field = field
  picker.anchor = e.currentTarget as HTMLElement
  picker.open = true
}

/** 浮窗里列哪些项: 按注册的图标选择器类型和当前格子定 */
const pickerCategories = computed<IconCategories>(() => {
  const values = picker.values
  const pickerType = pickerTypeOf(picker.type)
  if (!values || !pickerType) return {}
  return pickerType.categories(values, picker.field)
})

/** 浮窗标题: 选择 + 注册的名词 */
const pickerTitle = computed(() => `选择${pickerTypeOf(picker.type)?.noun ?? ''}`)

/** 当前这一格上的图标 id（高亮用）: 交给注册的图标选择器类型换算 */
const pickerCurrent = computed(() => {
  const pickerType = pickerTypeOf(picker.type)
  const value = Number(picker.values?.[picker.field]) || 0
  if (!pickerType || value <= 0) return 0
  return pickerType.iconId(value)
})

/** 「替换为」这一格还合不合法（换了被替换之后） */
function toStillValid(type: string, from: unknown, to: number): boolean {
  return pickerTypeOf(type)?.toValid?.(from, to) ?? true
}

function onPick(icon: IconRef) {
  const values = picker.values
  const pickerType = pickerTypeOf(picker.type)
  if (!values || !pickerType) return
  const value = pickerType.valueOf(icon)
  if (!value) return

  values[picker.field] = value
  // 换了「被替换」就换了可选项，原来的「替换为」可能已经不在里头 → 清掉重选
  const to = Number(values.to) || 0
  if (picker.field === 'from' && to > 0 && !toStillValid(picker.type, values.from, to)) values.to = 0

  closePicker()
}

// ── 确认 ──────────────────────────────────────────────────

function onConfirm() {
  const res = applyBatchEdit()
  if (!res.ok) {
    show(res.message)
    return
  }
  // 浮窗可能正指着一条已经没了的规则，关掉
  closePicker()
  show('已应用规则')
}
</script>

<template>
  <div class="factory-batch">
    <!-- 规则数组: 按 createRule 编译进来的选项（替换 / 下拉）画 -->
    <div v-if="batchRules.length" class="factory-batch-list">
      <div v-for="(rule, index) in batchRules" :key="index" class="factory-batch-rule">
        <span class="factory-batch-label">{{ labelOf(rule.type) }}：</span>

        <template v-for="(option, optionIndex) in rule.options" :key="optionIndex">
          <!-- 选项类型: 替换（两格图标） -->
          <template v-if="option.kind === 'replace'">
            <button
              class="factory-batch-slot"
              type="button"
              @click="openPicker(rule, option.typeId, 'from', $event)"
            >
              <img
                v-if="rule.values.from"
                class="factory-icon"
                :src="pickerIconUrl(option.typeId, rule.values.from)"
                :alt="pickerName(option.typeId, rule.values.from)"
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
              :disabled="!rule.values.from"
              @click="openPicker(rule, option.typeId, 'to', $event)"
            >
              <img
                v-if="rule.values.to"
                class="factory-icon"
                :src="pickerIconUrl(option.typeId, rule.values.to)"
                :alt="pickerName(option.typeId, rule.values.to)"
              />
              <svg v-else viewBox="0 0 16 16">
                <path d="M8 3.4v9.2" />
                <path d="M3.4 8h9.2" />
              </svg>
            </button>
          </template>

          <!-- 选项类型: 下拉 -->
          <template v-else>
            <span v-if="option.label" class="factory-batch-label factory-batch-accel">
              {{ option.label }}
            </span>
            <select
              class="factory-batch-select"
              :value="selectIndex(rule, option)"
              @change="onSelectChange(rule, option, $event)"
            >
              <option
                v-for="(item, itemIndex) in option.items"
                :key="itemIndex"
                :value="itemIndex"
              >{{ item.label }}</option>
            </select>
          </template>
        </template>

        <!-- 一个选项都没有: 显示规则表里的补充说明 -->
        <span v-if="!rule.options.length" class="factory-batch-hint">{{ hintOf(rule.type) }}</span>

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

    <!-- 添加规则: 跟规则项同尺寸的一整行，点开类型下拉；满 9 条就不显示 -->
    <div v-if="batchRules.length < 9" ref="addBox" class="factory-batch-add">
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
        class="btn-sm btn-primary"
        type="button"
        :disabled="!batchRules.length
          || batchRules.some((rule) => hasReplace(rule) && (!rule.values.from || !rule.values.to))"
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
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  min-width: 0;
}

.factory-batch-label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--fg-secondary);
}

/* 规则行里的补充说明 */
.factory-batch-hint {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--fg-muted);
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
  border-radius: var(--radius-xs);
  background: var(--bg-component);
  color: var(--fg-muted); /* 空框里那个加号 */
  cursor: pointer;
}

/* 全局 button:hover 是蓝的，会把这块涂蓝，所以背景要自己写 */
.factory-batch-slot:hover:enabled {
  background: var(--state-hover);
  border-color: var(--accent);
  color: var(--fg);
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
  border-radius: var(--radius-xs);
  background: var(--bg-component);
  color: var(--fg-secondary);
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
  color: var(--fg-secondary);
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
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--fg-secondary);
  cursor: pointer;
}

.factory-batch-remove:hover {
  background: var(--state-hover);
  border-color: var(--accent);
  color: var(--fg);
}

.factory-batch-add {
  position: relative;
}

.factory-batch-plus {
  width: 100%;
  justify-content: center;
  color: var(--fg-secondary);
  cursor: pointer;
}

.factory-batch-plus:hover {
  background: var(--state-hover);
  border-color: var(--accent);
  color: var(--fg);
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
  border-radius: var(--radius-xs);
  background: var(--bg-component);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.factory-batch-menu-item {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--fg-secondary);
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.factory-batch-menu-item:hover {
  background: var(--state-hover);
  color: var(--fg);
}

.factory-batch-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
