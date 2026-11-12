<script setup lang="ts">
/** 全息信标（2401）的参数显示 */
import { computed } from 'vue'
import { itemIconUrl } from '../../../factory/ui/itemIcons'
import { colorPaletteColor } from '../../../factory/data/colorPalette.js'
import RichText from '../RichText.vue'
import TodoTextView from './TodoTextView.vue'

const props = defineProps<{
  /** 这栋建筑的参数对象 */
  parameters: Record<string, any>
  /** 建筑的 content：标记词\n标签\n标题\n待办文字 */
  content?: string | null
  /** 建筑序号；标题为空时显示 全息信标#序号 */
  index: number
}>()

/** 游戏：\\ → \，\n → 换行，其它反斜杠原样保留 */
function unescapeContent(value: string) {
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== '\\' || i + 1 >= value.length) {
      out += value[i]
      continue
    }
    i += 1
    if (value[i] === '\\') out += '\\'
    else if (value[i] === 'n') out += '\n'
    else out += `\\${value[i]}`
  }
  return out
}

/** content 的四段：word / tags / title / todo（和游戏一样，第 4 段保留后续换行） */
const contentParts = computed(() => {
  const parts = String(props.content ?? '').split('\n')
  const fields = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', parts.slice(3).join('\n')]
  return fields.map((part) => unescapeContent(part))
})

const word = computed(() => contentParts.value[0])
const tags = computed(() => contentParts.value[1])
const title = computed(() => contentParts.value[2])
const todoText = computed(() => contentParts.value[3])
const todoColors = computed(() => (
  Array.isArray(props.parameters?.todoColorIndexes) ? props.parameters.todoColorIndexes : []
))

/** 标签按游戏规则拆成多块：; / ； 分隔，去空白、去重、去空段 */
const tagList = computed(() => {
  const out: string[] = []
  for (const raw of tags.value.split(/[;；]/)) {
    const tag = raw.replace(/\s+/g, '')
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
})

/** 可见性 / 信息常显的枚举名 */
const VISIBILITY_NAMES = ['离线', '视野范围内', '本地星球', '本地星系', '全星区']
const DETAIL_NAMES = ['不常显信息', '常显图标', '常显标题', '常显待办事项']

const colorId = computed(() => Number(props.parameters?.color ?? 0))
const colorSwatch = computed(() => colorPaletteColor(colorId.value) ?? 'transparent')
const signalId = computed(() => Number(props.parameters?.digitalSignalId ?? 0))
const visibilityText = computed(() => VISIBILITY_NAMES[Number(props.parameters?.visibility ?? 0)] ?? '---')
const detailText = computed(() => DETAIL_NAMES[Number(props.parameters?.detailLevel ?? 0)] ?? '---')

/** 黑雾投放信标：开关没开 = 未开启；开了但可见性不到本地星系 = 未生效 */
const dfBeaconText = computed(() => {
  const flags = Number(props.parameters?.dfAttractionFlags ?? 0)
  if ((flags & 1) === 0) return '未开启'
  return Number(props.parameters?.visibility ?? 0) >= 3 ? '已开启' : '未生效'
})

/** 投影高度 / 半径：游戏单位按米显示 */
function formatMeters(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '---'
}
const heightText = computed(() => formatMeters(props.parameters?.height))
const radiusText = computed(() => formatMeters(props.parameters?.radius))

/** 图标优先；没有图标资源时退回 word */
const iconId = computed(() => Number(props.parameters?.icon ?? 0))
const briefIcon = computed(() => (iconId.value > 0 ? itemIconUrl(iconId.value) : ''))
/** 游戏里 brief 只显示前两个字符 */
const briefWord = computed(() => {
  const text = word.value.trim()
  return text ? Array.from(text).slice(0, 2).join('') : '---'
})
</script>

<template>
  <div class="factory-selection-params factory-marker">
    <div class="factory-marker-title-box">
      <RichText v-if="title.trim()" :text="title" />
      <span v-else class="factory-marker-empty">全息信标#{{ index }}</span>
    </div>

    <TodoTextView :text="todoText" :colors="todoColors" empty-text="待办事项" />

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label factory-marker-label">黑雾投放信标：</span>
      <input
        class="factory-marker-field factory-marker-mode"
        :value="dfBeaconText"
        readonly
        tabindex="-1"
      />
    </div>

    <div class="factory-selection-row factory-selection-param factory-marker-cols">
      <div class="factory-marker-col">
        <span class="factory-selection-label factory-marker-label">信标颜色：</span>
        <span class="factory-marker-color" :style="{ background: colorSwatch }"></span>
      </div>
      <div class="factory-marker-col">
        <span class="factory-selection-label factory-marker-label2">id：</span>
        <input
          class="factory-marker-field factory-marker-id"
          :value="signalId"
          readonly
          tabindex="-1"
        />
      </div>
    </div>

    <div class="factory-selection-row factory-selection-param factory-marker-cols">
      <div class="factory-marker-col">
        <span class="factory-selection-label factory-marker-label">可见性：</span>
        <input
          class="factory-marker-field factory-marker-mode"
          :value="visibilityText"
          readonly
          tabindex="-1"
        />
      </div>
      <div class="factory-marker-col">
        <span class="factory-selection-label factory-marker-label2">信息常显：</span>
        <input
          class="factory-marker-field factory-marker-mode"
          :value="detailText"
          readonly
          tabindex="-1"
        />
      </div>
    </div>

    <div class="factory-selection-row factory-selection-param factory-marker-cols">
      <div class="factory-marker-col">
        <span class="factory-selection-label factory-marker-label">投影高度：</span>
        <input
          class="factory-marker-field factory-marker-num"
          :value="heightText"
          readonly
          tabindex="-1"
        />
        <span class="factory-marker-unit">m</span>
      </div>
      <div class="factory-marker-col">
        <span class="factory-selection-label factory-marker-label2">投影半径：</span>
        <input
          class="factory-marker-field factory-marker-num"
          :value="radiusText"
          readonly
          tabindex="-1"
        />
        <span class="factory-marker-unit">m</span>
      </div>
    </div>

    <div class="factory-selection-row factory-selection-param factory-marker-tags-row">
      <span class="factory-selection-label factory-marker-label">标签：</span>
      <div class="factory-marker-tags">
        <span
          v-for="(tag, i) in tagList"
          :key="`${tag}-${i}`"
          class="factory-marker-tag"
        >{{ tag }}</span>
        <span v-if="!tagList.length" class="factory-marker-tag factory-marker-tag-empty">---</span>
      </div>
    </div>

    <div class="factory-selection-row factory-selection-param factory-marker-brief">
      <span class="factory-marker-brief-box">
        <img
          v-if="briefIcon"
          class="factory-icon factory-marker-brief-icon"
          :src="briefIcon"
        />
        <span
          v-else
          class="factory-marker-brief-word"
          :class="{ 'is-empty': !word.trim() }"
        >{{ briefWord }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* 只读框与流速监测器保持一致；.factory-selection-* 共用件在 styles/shared.css */
.factory-marker {
  --factory-marker-control-h: 22px;
  --factory-marker-col-w: 180px;
}

/* 两列对齐：标签 70px，第二列从中间开始 */
.factory-marker-label {
  min-width: 70px;
}

.factory-marker-label2 {
  flex: 0 0 70px;
  min-width: 70px;
  text-align: right;
}

.factory-marker-cols {
  display: flex;
  gap: 8px;
}

.factory-marker-col {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 var(--factory-marker-col-w);
  width: var(--factory-marker-col-w);
  min-width: 0;
}

.factory-marker-field {
  min-width: 0;
  height: var(--factory-marker-control-h);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line-strong);
  background: var(--bg-component);
  color: var(--fg-secondary);
  font-family: inherit;
  font-size: 14px;
  line-height: 18px;
  cursor: default;
}

/* 只读框不走焦点高亮 */
.factory-marker-field:focus {
  outline: none;
}

/* 标题 / 标签 / word 占满剩余宽度 */
.factory-marker-grow {
  flex: 1 1 auto;
  width: 0;
}

.factory-marker-num {
  flex: 0 0 68px;
  width: 68px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.factory-marker-mode {
  flex: 0 0 98px;
  width: 98px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.factory-marker-id {
  flex: 0 0 56px;
  width: 56px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 颜色方块；高度跟输入框一致 */
.factory-marker-color {
  flex-shrink: 0;
  width: var(--factory-marker-control-h);
  height: var(--factory-marker-control-h);
  border-radius: var(--radius-xs);
  border: 1px solid var(--line-strong);
  background: var(--bg-component);
}

.factory-marker-unit {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.factory-marker-brief {
  min-height: 32px;
}

/* 标题：富文本只读框，空时显示 全息信标#序号 */
.factory-marker-title-box {
  min-height: 30px;
  padding: 3px 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-component);
  color: var(--fg-secondary);
  font-size: 16px;
  line-height: 20px;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.factory-marker-title-box :deep(.rich-text-view) {
  white-space: normal;
}

.factory-marker-empty {
  color: var(--fg-muted);
}

/* 标签块：按游戏里的小块显示，多个时换行 */
.factory-marker-tags-row {
  align-items: flex-start;
  gap: 5px;
}

.factory-marker-tags-row .factory-marker-label {
  padding-top: 2px;
}

.factory-marker-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.factory-marker-tag {
  display: inline-flex;
  align-items: center;
  height: var(--factory-marker-control-h);
  padding: 0 7px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line-strong);
  background: var(--bg-component);
  color: var(--fg-secondary);
  font-size: 14px;
  white-space: nowrap;
}

.factory-marker-tag-empty {
  color: var(--fg-muted);
}

/* 图标或 word 统一的大方框 */
.factory-marker-brief-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  overflow: hidden;
  border-radius: var(--radius-xs);
  border: 1px solid var(--line-strong);
  background: var(--bg-component);
}

.factory-marker-brief-icon {
  width: 80%;
  height: 80%;
  object-fit: contain;
}

.factory-marker-brief-word {
  max-width: 100%;
  color: var(--fg-secondary);
  font-size: 14px;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
}

.factory-marker-brief-word.is-empty {
  color: var(--fg-muted);
}
</style>
