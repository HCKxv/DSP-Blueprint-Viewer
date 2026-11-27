<script setup lang="ts">
/** 只读待办文本：\tag; 图标、[-]/[+] 复选框、逐字符文本颜色 */
import { computed } from 'vue'
import { parseRichText } from '../../factory/richText/richText.js'
import { itemIconUrl } from '../../factory/icon/itemIcons.js'
import { colorPaletteTextColor } from '../../data/colorPalette.js'

const props = withDefaults(defineProps<{
  /** 已反转义的待办原文 */
  text?: string | null
  /** 每个字符一个文本色板索引；-1 / 缺省 = 默认色 */
  colors?: number[] | null
  /** 没有可显示内容时的占位文字 */
  emptyText?: string
}>(), {
  emptyText: '待办事项',
})

type Segment =
  | { type: 'text'; text: string; color: string | null }
  | { type: 'icon'; icon: string; name: string }
  | { type: 'checkbox'; checked: boolean; color: string | null }
  | { type: 'break' }

/** 当前字符的文本颜色；-1 / 越界返回 null 交给默认色 */
function colorAt(index: number) {
  const value = props.colors?.[index]
  if (value === undefined || value === null || value < 0) return null
  return colorPaletteTextColor(value)
}

const segments = computed<Segment[]>(() => {
  const text = String(props.text ?? '')
  const out: Segment[] = []
  let offset = 0

  const pushText = (value: string, color: string | null) => {
    if (!value) return
    const last = out[out.length - 1]
    if (last?.type === 'text' && last.color === color) last.text += value
    else out.push({ type: 'text', text: value, color })
  }

  const pushTextSegment = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      const char = value[i]
      if (char === '\n') {
        out.push({ type: 'break' })
        offset += 1
        continue
      }
      if (value.startsWith('[-]', i) || value.startsWith('[+]', i)) {
        out.push({ type: 'checkbox', checked: value[i + 1] === '+', color: colorAt(offset + 2) })
        i += 2
        offset += 3
        continue
      }
      pushText(char, colorAt(offset))
      offset += 1
    }
  }

  for (const part of parseRichText(text)) {
    if (part.type === 'icon') {
      const icon = itemIconUrl(part.id)
      if (icon) {
        out.push({ type: 'icon', icon, name: part.name })
        offset += part.raw.length
      } else {
        pushTextSegment(part.raw)
      }
      continue
    }
    pushTextSegment(part.text)
  }
  return out
})

/** 只有空白/换行时按空文本框处理 */
const hasContent = computed(() => segments.value.some((segment) => {
  if (segment.type === 'text') return segment.text.trim().length > 0
  return segment.type === 'icon' || segment.type === 'checkbox'
}))
</script>

<template>
  <div class="todo-text-box" role="textbox" aria-readonly="true" tabindex="-1">
    <template v-if="hasContent">
      <template v-for="(segment, index) in segments" :key="index">
        <br v-if="segment.type === 'break'" />
        <img
          v-else-if="segment.type === 'icon'"
          class="todo-text-icon"
          :src="segment.icon"
          :alt="segment.name"
        />
        <span
          v-else-if="segment.type === 'checkbox'"
          class="todo-text-checkbox"
          :class="{ 'is-checked': segment.checked }"
          :style="segment.color ? { color: segment.color } : undefined"
          aria-hidden="true"
        >
          <svg viewBox="0 0 12 12"><path d="M2.2 6.3 4.8 8.9 9.8 3.3" /></svg>
        </span>
        <span v-else :style="segment.color ? { color: segment.color } : undefined">{{ segment.text }}</span>
      </template>
    </template>
    <span v-else class="todo-text-empty">{{ emptyText }}</span>
  </div>
</template>

<style scoped>
.todo-text-box {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 46px;
  max-height: 160px;
  overflow-y: auto;
  padding: 3px 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-component);
  color: var(--fg-secondary);
  font-size: 14px;
  line-height: 20px;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-all;
  cursor: default;
  user-select: text;
}

.todo-text-box:focus {
  outline: none;
}

.todo-text-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  vertical-align: -3px;
  margin: 0 1px;
}

.todo-text-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  margin-right: 3px;
  vertical-align: -2px;
  border: 1px solid currentColor;
  border-radius: 2px;
  color: inherit;
}

.todo-text-checkbox svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  opacity: 0;
}

.todo-text-checkbox.is-checked svg {
  opacity: 1;
}

.todo-text-empty {
  color: var(--fg-muted);
}
</style>
