<script setup lang="ts">
import { computed } from 'vue'
import { canReload, phase, reload, type PwaPhase } from '../stores/pwaStatus'

/** 状态文案 */
const LABELS: Record<PwaPhase, string> = {
  unsupported: 'PWA 未启用',
  installing: '下载中…',
  ready: '离线可用',
  updated: '新版本就绪',
}

const label = computed(() => LABELS[phase.value])

/** 不可点击状态里的补充说明 */
const TITLES: Partial<Record<PwaPhase, string>> = {
  installing: '正在后台下载新版本，完成后刷新即可启用',
}

const title = computed(() => TITLES[phase.value])
</script>

<template>
  <button
    v-if="canReload"
    type="button"
    class="pwa-status"
    :class="`pwa-${phase}`"
    title="点击刷新以载入新版本"
    @click="reload"
  >
    <span class="pwa-dot" aria-hidden="true" />
    {{ label }}
  </button>
  <span v-else class="pwa-status" :class="`pwa-${phase}`" :title="title" role="status">
    <span class="pwa-dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.pwa-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--fg-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: normal;
  line-height: 1.6;
  white-space: nowrap;
  cursor: default;
}

button.pwa-status {
  cursor: pointer;
}

button.pwa-status:hover {
  background: var(--state-hover);
  color: var(--fg);
}

.pwa-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-muted);
  box-shadow: 0 0 6px var(--fg-muted);
}

/* 新版本下载中 */
.pwa-installing .pwa-dot {
  background: var(--warn);
  box-shadow: 0 0 6px var(--warn);
}

/* 已接管，离线可用 */
.pwa-ready .pwa-dot {
  background: var(--ok);
  box-shadow: 0 0 6px var(--ok);
}

/* 新版本就绪（可点击刷新） */
.pwa-updated .pwa-dot {
  background: var(--fg-accent);
  box-shadow: 0 0 6px var(--fg-accent);
}
</style>
