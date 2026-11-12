<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import BaseModal from '../BaseModal.vue'
import { closeColorReplaceModal, parseBlueprint, saveBlueprintText, store } from '../../stores/preview'
import {
  extractDysonShellColorList,
  extractShellColorList,
  replaceBlueprintShellColors,
  rgbaColorKey,
} from '../../sphere/edit.js'
import { stringifyBlueprint } from '../../blueprint/sphere/sphereEncoder.js'
import { hexToRgba } from '../../blueprint/sphere/sphereUtils.js'
import { show } from '../../stores/toast'

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

interface ColorLists {
  节点: (Rgba | null)[]
  框架: (Rgba | null)[]
  壳面: (Rgba | null)[]
}

/** 一种待替换的源颜色（默认颜色也占一行） */
interface ColorRow {
  key: string
  isDefault: boolean
  label: string
  hex: string
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const DEFAULT_COLOR_TEXT = '默认颜色'
/** 输入框里表示「默认颜色」的特殊写法，对应 RGBA(0,0,0,0) */
const DEFAULT_TARGET_TEXT = '#默认'
const DEFAULT_RGBA: Rgba = { r: 0, g: 0, b: 0, a: 0 }

function isDefaultTarget(value: string): boolean {
  return value === DEFAULT_TARGET_TEXT
}

function isValidTarget(value: string): boolean {
  return isDefaultTarget(value) || HEX_RE.test(value)
}

const form = reactive({
  node: true,
  frame: true,
  face: true,
})

const colorLists = ref<ColorLists | null>(null)
/** 源颜色 key → 颜色输入框里的 #RRGGBB 或 #默认 */
const targets = ref<Record<string, string>>({})
const busy = ref<'' | 'copy' | 'save'>('')

/** 由弹窗自己按当前蓝图判断单层壳 / 多层壳，无需外部传入 */
const isSingleShell = computed(() => store.parsed?.typeId === 1)

function hexOf(color: Rgba | null): string {
  if (!color) return '#FFFFFF'
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase()
}

function keyOf(color: Rgba | null): string {
  return color && color.a !== 0 ? rgbaColorKey(color) : DEFAULT_COLOR_TEXT
}

/** 勾选的组件类型里出现过的颜色（去重，顺序为节点 → 框架 → 壳面） */
const rows = computed<ColorRow[]>(() => {
  const lists = colorLists.value
  if (!lists) return []

  const selected: (Rgba | null)[] = []
  if (form.node) selected.push(...lists.节点)
  if (form.frame) selected.push(...lists.框架)
  if (form.face) selected.push(...lists.壳面)

  const seen = new Set<string>()
  const result: ColorRow[] = []
  for (const color of selected) {
    const key = keyOf(color)
    if (seen.has(key)) continue
    seen.add(key)
    const isDefault = key === DEFAULT_COLOR_TEXT
    result.push({
      key,
      isDefault,
      label: isDefault ? DEFAULT_COLOR_TEXT : hexOf(color),
      hex: hexOf(color),
    })
  }
  return result
})

function targetOf(key: string): string {
  return targets.value[key] ?? ''
}

function setTarget(key: string, value: string): void {
  targets.value[key] = value
}

function isRowInvalid(row: ColorRow): boolean {
  const value = targetOf(row.key).trim()
  return value !== '' && !isValidTarget(value)
}

const invalidInput = computed(() => rows.value.some(isRowInvalid))

const replacementCount = computed(() => rows.value.filter(row => targetOf(row.key).trim() !== '').length)

const canGenerate = computed(() => !busy.value && !invalidInput.value && replacementCount.value > 0)

/** 颜色选择块显示输入框里的 #RRGGBB；为空、#默认或不合法时退回待替换颜色 */
function pickerValue(row: ColorRow): string {
  const value = targetOf(row.key).trim()
  if (HEX_RE.test(value)) return value.toLowerCase()
  return row.isDefault ? '#ffffff' : row.hex.toLowerCase()
}

/** 取色块是否显示「默认颜色」样式：目标为 #默认，或目标为空/非法且源色就是默认色 */
function pickerIsDefault(row: ColorRow): boolean {
  const value = targetOf(row.key).trim()
  if (isDefaultTarget(value)) return true
  if (HEX_RE.test(value)) return false
  return row.isDefault
}

function onPickerInput(row: ColorRow, event: Event): void {
  setTarget(row.key, (event.target as HTMLInputElement).value.toUpperCase())
}

function onTextInput(row: ColorRow, event: Event): void {
  setTarget(row.key, (event.target as HTMLInputElement).value)
}

function onTextBlur(row: ColorRow): void {
  const value = targetOf(row.key).trim()
  if (value === '') setTarget(row.key, '')
  else if (isDefaultTarget(value)) setTarget(row.key, DEFAULT_TARGET_TEXT)
  else if (HEX_RE.test(value)) setTarget(row.key, value.toUpperCase())
}

/** 读取当前蓝图的颜色列表；单层 / 多层由 isSingleShell 决定 */
function loadColorLists(): void {
  const parsed = store.parsed
  targets.value = {}
  if (!parsed) {
    colorLists.value = null
    return
  }
  try {
    if (isSingleShell.value) {
      if (!parsed.singleShell) throw new Error('蓝图缺少单层壳数据')
      colorLists.value = extractShellColorList(parsed.singleShell)
    } else {
      if (!parsed.dysonShell) throw new Error('蓝图缺少戴森壳数据')
      colorLists.value = extractDysonShellColorList(parsed.dysonShell)
    }
  } catch (error) {
    colorLists.value = null
    show(`读取壳层颜色失败：\n${(error as Error).message}`)
  }
}

watch(
  () => store.showColorReplaceModal,
  (open) => {
    if (!open) return
    busy.value = ''
    form.node = true
    form.frame = true
    form.face = true
    loadColorLists()
    if (colorLists.value && rows.value.length === 0) {
      show('当前蓝图没有可替换的颜色')
    }
  },
)

// 弹窗打开期间换了蓝图：重新读取颜色
watch(
  () => store.parsed,
  () => {
    if (!store.showColorReplaceModal) return
    loadColorLists()
  },
)

/** 源颜色 key → 目标 RGBA；留空 / 格式错误的行不参与替换 */
function buildEntries(): Record<string, Rgba> {
  const entries: Record<string, Rgba> = {}
  for (const row of rows.value) {
    const value = targetOf(row.key).trim()
    if (isDefaultTarget(value)) {
      entries[row.key] = { ...DEFAULT_RGBA }
      continue
    }
    if (!HEX_RE.test(value)) continue
    entries[row.key] = hexToRgba(value)
  }
  return entries
}

/** 用当前颜色映射生成替换后的蓝图副本 */
function generateBlueprint(): Record<string, any> {
  const parsed = store.parsed
  if (!parsed) throw new Error('没有已解析的蓝图')
  return replaceBlueprintShellColors(parsed, buildEntries(), { ...form })
}

async function generateText(): Promise<string> {
  return stringifyBlueprint(generateBlueprint())
}

/** 把替换结果写回输入框并重新解析，让预览、统计和发电量整体刷新 */
async function applyToPreview(): Promise<void> {
  if (!canGenerate.value) return
  try {
    const text = await generateText()
    store.input = text
    parseBlueprint()
    closeColorReplaceModal()
  } catch (error) {
    show(`应用到预览失败：\n${(error as Error).message}`)
  }
}

async function copyToClipboard(): Promise<void> {
  if (!canGenerate.value) return
  busy.value = 'copy'
  try {
    const text = await generateText()
    await navigator.clipboard.writeText(text)
    closeColorReplaceModal()
    show('颜色替换后的蓝图已复制到剪贴板')
  } catch (error) {
    show(`生成或复制失败：\n${(error as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function downloadToFile(): Promise<void> {
  if (!canGenerate.value) return
  busy.value = 'save'
  try {
    const text = await generateText()
    const saved = await saveBlueprintText(
      text,
      isSingleShell.value ? '单层戴森壳-颜色替换' : '戴森壳-颜色替换',
    )
    if (!saved) return
    closeColorReplaceModal()
    show(saved)
  } catch (error) {
    show(`生成或下载失败：\n${(error as Error).message}`)
  } finally {
    busy.value = ''
  }
}

function closeModal(): void {
  if (busy.value) return
  closeColorReplaceModal()
}

onBeforeUnmount(closeColorReplaceModal)
</script>

<template>
  <BaseModal :open="store.showColorReplaceModal" title="更改颜色" @close="closeModal">
    <div class="color-replace">
      <div class="menu color-replace-types">
        <label>
          <input type="checkbox" v-model="form.node" />
          节点
        </label>
        <label>
          <input type="checkbox" v-model="form.frame" />
          框架
        </label>
        <label>
          <input type="checkbox" v-model="form.face" />
          壳面
        </label>
      </div>

      <hr class="menu-divider" />

      <div v-if="rows.length" class="color-replace-list scroll-y">
        <div v-for="row in rows" :key="row.key" class="color-replace-row">
          <span class="color-replace-source">
            <span
              class="color-replace-swatch"
              :class="{ 'is-default': row.isDefault }"
              :style="row.isDefault ? undefined : { backgroundColor: row.hex }"
            ></span>
            <span
              class="color-replace-source-text"
              :class="{ 'is-default': row.isDefault }"
            >{{ row.label }}</span>
          </span>

          <span class="color-replace-arrow">→</span>

          <span
            class="color-picker-frame"
            :class="{ 'is-default': pickerIsDefault(row) }"
            title='选择替换颜色'
          >
            <input
              type="color"
              class="paint-color"
              :value="pickerValue(row)"
              @input="onPickerInput(row, $event)"
            />
          </span>
          <input
            type="text"
            class="input-dark color-replace-input"
            :class="{ 'is-invalid': isRowInvalid(row) }"
            :value="targetOf(row.key)"
            placeholder="#"
            maxlength="7"
            spellcheck="false"
            @input="onTextInput(row, $event)"
            @blur="onTextBlur(row)"
          />
        </div>
      </div>
      <div v-else class="color-replace-empty">
        {{ form.node || form.frame || form.face ? '没有可替换的颜色' : '请至少勾选一项' }}
      </div>

      <div v-if="invalidInput" class="color-replace-error">颜色格式须为 #RRGGBB 或 #默认</div>

      <hr class="menu-divider" />

      <span class="btn-group center">
        <button class="btn-sm" type="button" :disabled="!canGenerate" @click="applyToPreview">
          应用到预览
        </button>
        <button class="btn-sm" type="button" :disabled="!canGenerate" @click="copyToClipboard">
          {{ busy === 'copy' ? '生成中...' : '复制到剪贴板' }}
        </button>
        <button class="btn-sm" type="button" :disabled="!canGenerate" @click="downloadToFile">
          {{ busy === 'save' ? '生成中...' : '下载到文件' }}
        </button>
        <button class="btn-sm btn-ghost" type="button" :disabled="!!busy" @click="closeModal">
          取消
        </button>
      </span>
    </div>
  </BaseModal>
</template>

<style scoped>
/* 高度不够时只让颜色栏滚动：弹窗主体不再整体滚动 */
:deep(.modal-body.scroll-y) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.color-replace {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

/* 勾选项、分隔线、错误提示和按钮固定，不参与收缩 */
.color-replace-types,
.color-replace > hr,
.color-replace-error,
.color-replace > .btn-group {
  flex: none;
}

.color-replace > .btn-group {
  flex-wrap: wrap;
  justify-content: center;
}

.color-replace-types {
  gap: 14px;
}

.color-replace-types label {
  white-space: nowrap;
}

/* 颜色栏是唯一的滚动容器；basis 用 auto 才能让弹窗按内容自适应高度 */
.color-replace-list {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.color-replace-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 左边：色块 + #RRGGBB（默认颜色显示文字） */
.color-replace-source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 96px;
  min-width: 0;
}

/* 正方形，边长与行内颜色输入框的高度一致 */
.color-replace-swatch {
  width: 25px;
  height: 25px;
  flex: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
}

/* 默认颜色没有色值：用斜线表示「未设置」 */
.color-replace-swatch.is-default,
.color-picker-frame.is-default {
  border-color: var(--line-strong);
  background-image: linear-gradient(
    135deg,
    transparent 44%,
    var(--fg-muted) 44%,
    var(--fg-muted) 56%,
    transparent 56%
  );
}

.color-replace-source-text {
  overflow: hidden;
  color: var(--fg-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.color-replace-source-text.is-default {
  color: var(--fg-muted);
  font-family: inherit;
}

.color-replace-arrow {
  flex: none;
  color: var(--fg-muted);
}

/* 取色块外框：默认颜色时显示斜线底纹，原生 input 铺满外框 */
.color-picker-frame {
  position: relative;
  flex: none;
  align-self: stretch;
  width: 36px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
  cursor: pointer;
}

.paint-color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}

.paint-color::-webkit-color-swatch-wrapper {
  padding: 0;
}

.paint-color::-webkit-color-swatch {
  border: none;
  border-radius: 0;
}

/* 默认颜色：隐藏原生色块，露出外框的斜线底纹 */
.color-picker-frame.is-default .paint-color {
  opacity: 0;
}

.color-replace-input {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.color-replace-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}

.color-replace-input.is-invalid {
  border-color: var(--danger);
}

.color-replace-input.is-invalid:focus {
  border-color: var(--danger);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--danger) 40%, transparent);
}

.color-replace-empty {
  padding: 4px 0;
  color: var(--fg-muted);
  font-size: 12px;
  text-align: center;
}

.color-replace-error {
  color: var(--danger);
  font-size: 12px;
}
</style>
