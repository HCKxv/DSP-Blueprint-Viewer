<script setup lang="ts">
/**
 * 工厂蓝图预览: 3D 场景由 factory/preview/FactoryPreview.js 负责，
 * 这里只管挂载 / 卸载画布与界面开关。
 */
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { FactoryPreview } from '../../factory/preview/FactoryPreview.js'
import { attachPreview } from '../../stores/factory'

const canvasEl = ref<HTMLCanvasElement | null>(null)

/** 3D 场景实例: 挂载时创建，切走工具就销毁 */
let preview: FactoryPreview | null = null

/** 地基网格线开关 */
const showGrid = ref(true)

/**
 * 画布底部那一排显示层开关（key 就是 factory/preview/FactoryPreview.js 的层名）
 */
const layerState = reactive({ buildings: true, belts: true, inserters: true, icons: true })
const layerKeys = ['buildings', 'belts', 'inserters', 'icons'] as const
type LayerKey = typeof layerKeys[number]

/** 一个显示层的文案与提示 */
const LAYER_LABELS: Record<LayerKey, { text: string }> = {
  buildings: { text: '建筑' },
  belts: { text: '带子' },
  inserters: { text: '爪子' },
  icons: { text: '图标' },
}

/** 某个显示层当前是否显示 */
function layerOn(key: LayerKey) {
  return layerState[key]
}

/** 点一下工具条上的层按钮: 翻转该层并交给场景 */
function toggleLayer(key: LayerKey) {
  layerState[key] = !layerState[key]
  preview?.setLayerVisible(key, layerState[key])
}

/** 目标纬度: 南北下拉 + 0~90 输入框，默认「北 0°」 */
const targetNorth = ref<'N' | 'S'>('N')
const targetLatValue = ref(0)

/** 目标纬度（南为负） */
function currentTarget() {
  return (targetNorth.value === 'S' ? -1 : 1) * targetLatValue.value
}

/** 夹到 0~90，非数字当 0 */
function normalizeLatValue() {
  const value = Number(targetLatValue.value)
  targetLatValue.value = Number.isFinite(value) ? Math.min(90, Math.max(0, Math.round(value))) : 0
}

/** 提交: 回车 / 失焦（@change）都算，夹取后按新目标重摆；打字过程中不动场景 */
function commitLatValue() {
  normalizeLatValue()
  preview?.setTargetLatitude(currentTarget(), targetNorth.value === 'N')
}

/** 操作提示浮窗（? 按钮）: 开关与浮窗元素（点外面 / Esc 关掉要用） */
const tipsOpen = ref(false)
const tipsEl = ref<HTMLElement | null>(null)
const tipsBtnEl = ref<HTMLButtonElement | null>(null)

/** ? 按钮弹出的操作提示: [操作, 按键 / 手势] */
const TIPS = [
  { action: '平移', keys: '左键拖动 / WASD / 单指拖动' },
  { action: '旋转', keys: '中键左右拖动 / QE / 双指旋转' },
  { action: '俯仰', keys: '中键上下拖动 / RF / 双指上下拖动' },
  { action: '缩放', keys: '滚轮 / ZX / 双指捏合' },
  { action: '对准蓝图', keys: 'C / 右上角按钮' },
  { action: '选中建筑', keys: '左键点击 / 单指长按 / 选中空白=取消选中' },
]

/** 点浮窗与 ? 按钮以外的地方关掉浮窗 */
function closeTipsOnOutside(event: PointerEvent) {
  if (!tipsOpen.value) return
  const target = event.target as Node
  if (tipsEl.value?.contains(target) || tipsBtnEl.value?.contains(target)) return
  tipsOpen.value = false
}

/** Esc 关掉浮窗 */
function closeTipsOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') tipsOpen.value = false
}

onMounted(() => {
  if (!canvasEl.value) return
  preview = new FactoryPreview()
  preview.init(canvasEl.value)
  preview.setGridVisible(showGrid.value)
  // 先按界面上的开关设定各层，再摆蓝图（重摆时会照着开关跳过不显示的层）
  for (const key of layerKeys) preview.setLayerVisible(key, layerState[key])
  preview.setTargetLatitude(currentTarget(), targetNorth.value === 'N')
  attachPreview(preview)

  document.addEventListener('pointerdown', closeTipsOnOutside)
  window.addEventListener('keydown', closeTipsOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeTipsOnOutside)
  window.removeEventListener('keydown', closeTipsOnEscape)
  attachPreview(null)
  preview?.dispose()
  preview = null
})

// 网格线开关 → 场景
watch(showGrid, (visible) => preview?.setGridVisible(visible))

// 目标半球（下拉框）→ 立刻重摆
watch(targetNorth, () => preview?.setTargetLatitude(currentTarget(), targetNorth.value === 'N'))

/** 复位视角: 有蓝图回到蓝图中心，没有则回到默认视角，见 factory/preview/FactoryPreview.js */
function onResetView() {
  preview?.resetView()
}
</script>

<template>
  <div class="factory-preview">
    <div class="factory-preview-stage">
      <!-- draggable=false: 左键拖动挪观察点，别让浏览器把画布当成可拖拽的图片 -->
      <canvas ref="canvasEl" draggable="false"></canvas>

      <div class="factory-preview-top">
        <button
          class="btn-sm btn-ghost factory-preview-reset"
          type="button"
          @click="onResetView"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.3" />
            <path class="factory-reset-needle" d="M11.32 4.68 9.1 9.1 6.9 6.9Z" />
            <path d="M11.32 4.68 9.1 9.1 4.68 11.32 6.9 6.9Z" />
          </svg>
        </button>
      </div>

      <div class="factory-preview-bar">
        <div class="factory-preview-layers">
          <button
            v-for="key in layerKeys"
            :key="key"
            class="btn-sm btn-ghost factory-layer-btn"
            :class="{ active: layerOn(key) }"
            type="button"
            @click="toggleLayer(key)"
          >
            {{ LAYER_LABELS[key].text }}
          </button>
        </div>

        <div class="factory-preview-tools">
          <div class="factory-preview-fields">
            <label class="factory-preview-check">
              <input v-model="showGrid" type="checkbox" /> 显示网格
            </label>
            <label class="factory-preview-check">
              目标纬度
              <select v-model="targetNorth" class="factory-preview-select">
                <option value="N">北</option>
                <option value="S">南</option>
              </select>
              <input
                v-model.number="targetLatValue"
                class="factory-preview-lat"
                type="number"
                min="0"
                max="90"
                step="1"
                @change="commitLatValue"
                @keyup.enter="commitLatValue"
              />
              <span class="factory-preview-unit">°</span>
            </label>
          </div>

          <div class="factory-preview-help-wrap">
            <button
              ref="tipsBtnEl"
              class="factory-preview-help"
              :class="{ active: tipsOpen }"
              type="button"
              @click="tipsOpen = !tipsOpen"
            >?</button>
          </div>

          <div v-if="tipsOpen" ref="tipsEl" class="factory-preview-tips">
            <div class="factory-preview-tips-head">
              <span>操作</span>
              <button class="factory-preview-tips-close" type="button" @click="tipsOpen = false">✕</button>
            </div>
            <dl class="factory-preview-tips-list">
              <template v-for="tip in TIPS" :key="tip.action">
                <dt>{{ tip.action }}</dt>
                <dd>{{ tip.keys }}</dd>
              </template>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.factory-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

/* 尺寸由 CSS 定，渲染器跟着它走（ResizeObserver） */
.factory-preview-stage {
  position: relative;
  flex: 1;
  min-height: 240px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--bg-stage);
}

.factory-preview-stage canvas {
  width: 100%;
  height: 100%;
  display: block;
  /* 压掉左键拖动时的文本选择 / 原生拖拽 */
  user-select: none;
  -webkit-user-select: none;
}

/* 画布顶部一行: 复位视角靠右 */
.factory-preview-top {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  justify-content: flex-end;
  z-index: 2;
  pointer-events: none;
}

/* 复位视角: 顶部一行最右 */
.factory-preview-reset {
  flex-shrink: 0;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
}

.factory-preview-reset:hover {
  background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
}

/* 指南针图标 */
.factory-preview-reset svg {
  width: 18px;
  height: 18px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.05;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.factory-preview-reset .factory-reset-needle {
  fill: currentColor;
  stroke: none;
}

/* 画布底部一行 */
.factory-preview-bar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  flex-direction: row-reverse;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  z-index: 2;
  pointer-events: none;
}

/* 底栏左侧一组: 半透明底板 + 底板上外面的 ? */
.factory-preview-tools {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  pointer-events: none;
}

/* 左边两个开关共用一条半透明底 */
.factory-preview-fields {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
  pointer-events: auto;
}

.factory-preview-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--fg-secondary);
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
}

.factory-preview-check + .factory-preview-check {
  padding-left: 8px;
  border-left: 1px solid var(--line);
}

/* 目标纬度下拉 */
.factory-preview-select {
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
  border: 1px solid var(--line);
  color: var(--fg-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.factory-preview-select:focus {
  outline: none;
  border-color: var(--accent);
}

.factory-preview-lat {
  width: 36px;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--bg-secondary);
  border: 1px solid var(--line);
  color: var(--fg-secondary);
  font-size: 12px;
  font-family: inherit;
  text-align: right;
}

.factory-preview-lat:focus {
  outline: none;
  border-color: var(--accent);
}

/* 这么窄的框里放不下上下箭头 */
.factory-preview-lat::-webkit-outer-spin-button,
.factory-preview-lat::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.factory-preview-unit {
  margin-left: -2px;
  color: var(--fg-muted);
}

/* ? 按钮: 圆环，亮起 = 浮窗开着 */
.factory-preview-help-wrap {
  display: inline-flex;
  pointer-events: auto;
}

.factory-preview-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
  color: var(--fg-muted);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
}

.factory-preview-help:hover,
.factory-preview-help.active {
  color: var(--fg);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
}

/* 操作提示浮窗: 左边缘对齐整组（底板左侧），贴在底栏上方 */
.factory-preview-tips {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 3;
  min-width: 232px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.5;
  pointer-events: auto;
}

.factory-preview-tips-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--fg);
}

.factory-preview-tips-close {
  padding: 0 2px;
  border: none;
  background: none;
  color: var(--fg-muted);
  font-size: 12px;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
}

.factory-preview-tips-close:hover {
  color: var(--fg);
}

.factory-preview-tips-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 10px;
  row-gap: 4px;
  margin: 6px 0 0;
}

.factory-preview-tips-list dt {
  color: var(--fg-accent);
  white-space: nowrap;
}

.factory-preview-tips-list dd {
  margin: 0;
  white-space: nowrap;
}

/* 显示层开关 */
.factory-preview-layers {
  display: flex;
  gap: 4px;
  pointer-events: auto;
}

.factory-layer-btn {
  text-align: center;
  white-space: nowrap;
}

/* 亮着 = 该层显示；关掉时退回 btn-ghost 的暗底色 */
.factory-layer-btn.active,
.factory-layer-btn.active:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--fg);
}
</style>
