<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  /** 弹窗宽度：数字按 px，字符串按 CSS 长度；默认 480px，最大 92vw */
  width?: number | string
}>(), {
  width: 480,
})

const emit = defineEmits<{
  close: []
}>()

const boxStyle = computed(() => {
  const width = props.width
  if (width == null || width === '') return undefined
  if (typeof width === 'number') return { width: `${width}px` }
  const trimmed = width.trim()
  return { width: /^\d+(?:\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed }
})
</script>

<template>
  <div class="modal" :class="{ hidden: !open }">
    <div class="modal-backdrop" @click="emit('close')"></div>
    <div class="modal-box" :style="boxStyle">
      <div class="modal-header">
        <span>{{ title }}</span>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>
      <div class="modal-body scroll-y">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal.hidden {
  display: none;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
}

.modal-box {
  position: relative;
  width: 480px;
  max-width: 92vw;
  max-height: 80vh;
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  font-weight: bold;
}

.modal-body {
  padding: 12px 16px;
  overflow-y: auto;
}
</style>
