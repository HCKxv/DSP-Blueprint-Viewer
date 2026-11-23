<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { openGenerateBlueprintModal, store } from '../../stores/preview'
import { experimentalFeatures } from '../../stores/tool'
import StatSection from './StatSection.vue'
import StatBox from './StatBox.vue'
import type { StatNode, StatNodeAction } from '../../sphere/statsTree'

const menuActions = ref<StatNodeAction[]>([])
const menuOpen = ref(false)
const menuElement = ref<HTMLElement | null>(null)
const menuPosition = ref({ left: 0, top: 0 })

function showContextMenu(actions: StatNodeAction[], event: MouseEvent) {
  if (!actions.length) return

  event.preventDefault()
  menuActions.value = actions
  menuPosition.value = { left: event.clientX, top: event.clientY }
  menuOpen.value = true

  nextTick(() => {
    const menu = menuElement.value
    if (!menu) return
    const margin = 8
    menuPosition.value = {
      left: Math.max(margin, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - margin)),
      top: Math.max(margin, Math.min(event.clientY, window.innerHeight - menu.offsetHeight - margin)),
    }
  })
}

function openContextMenu(node: StatNode, event: MouseEvent) {
  const actions = node.contextMenuActions
  if (!actions?.length) return
  showContextMenu(actions, event)
}

function openGenerateMenu(event: MouseEvent) {
  showContextMenu([{ label: '生成蓝图', onClick: openGenerateBlueprintModal }], event)
}

const generateNode:StatNode = {
  kind: 'stat',
  label: '蓝图生成器',
  button: {label:'生成蓝图',onClick:openGenerateBlueprintModal}
}

function closeContextMenu() {
  menuOpen.value = false
}

function onDocumentPointer(event: PointerEvent) {
  if (menuElement.value?.contains(event.target as Node)) return
  closeContextMenu()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}

function bindMenuListeners(open: boolean) {
  const method = open ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onDocumentPointer)
  window[method]('keydown', onKeydown)
  window[method]('resize', closeContextMenu)
  window[method]('scroll', closeContextMenu, true)
}

watch(menuOpen, bindMenuListeners)
onBeforeUnmount(() => bindMenuListeners(false))
</script>

<template>
  <div class="scroll-y stats-panel" @contextmenu.capture.prevent>
    <div class="stat-grid">
      <!-- 解析失败 -->
      <div v-if="store.errorMessage" class="stat-box">
        <strong>❌ 解析失败</strong><br />
        {{ store.errorMessage }}
      </div>

      <!-- 未解析 -->
      <div v-else-if="store.statsTree.length === 0" class="stat-box">
        请输入蓝图字符串并点击解析
      </div>

      <!-- 信息节点树 -->
      <template v-else>
        <template v-for="(node, i) in store.statsTree" :key="i">
          <StatSection v-if="node.kind === 'section'" :node="node" @contextmenu="openContextMenu" />
          <StatBox v-else :node="node" @contextmenu="openContextMenu" />
        </template>
      </template>

      <StatBox v-if="experimentalFeatures && !store.parsed && !store.parsing" :node="generateNode" />
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="menuOpen"
      ref="menuElement"
      class="stat-context-menu"
      role="menu"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
    >
      <button
        v-for="(action, i) in menuActions"
        :key="i"
        type="button"
        class="stat-context-menu-item"
        role="menuitem"
        :title="action.title"
        @click="action.onClick(); closeContextMenu()"
      >
        {{ action.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.stats-panel {
  position: relative;
}

.stat-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-context-menu {
  position: fixed;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  min-width: 120px;
  padding: 3px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-component);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

.stat-context-menu-item {
  padding: 5px 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--fg);
  font: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.stat-context-menu-item:hover {
  background: var(--state-hover);
}
</style>
