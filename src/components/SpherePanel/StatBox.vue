<script setup lang="ts">
import type { StatNode } from '../../sphere/statsTree'

const props = defineProps<{ node: StatNode }>()
const emit = defineEmits<{
  contextmenu: [node: StatNode, event: MouseEvent]
}>()

function onToggle(node: StatNode, e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  node.toggle?.onChange(checked)
}

function onContextMenu(event: MouseEvent) {
  event.stopPropagation()
  emit('contextmenu', props.node, event)
}
</script>

<template>
  <div class="stat-box" @contextmenu="onContextMenu">
    <!-- 标题行 -->
    <div class="stat-title-row">
      <span class="stat-title">
        <input
          v-if="node.toggle"
          type="checkbox"
          class="stat-checkbox"
          :checked="node.toggle.checked"
          @change="onToggle(node, $event)"
        />
        <strong>{{ node.label }}</strong>
      </span>
      <button
        v-if="node.button"
        type="button"
        class="btn-sm stat-card-btn"
        :title="node.button.title"
        @click="node.button.onClick()"
      >
        {{ node.button.label }}
      </button>
    </div>
    <div v-if="node.value?.length" class="stat-value">
      <div v-for="(line, i) in node.value" :key="i">{{ line }}</div>
    </div>
  </div>
</template>

<style scoped>
.stat-checkbox {
  margin-right: 4px;
  vertical-align: middle;
}

.stat-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-title {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.stat-value {
  margin-top: 2px;
}
</style>
