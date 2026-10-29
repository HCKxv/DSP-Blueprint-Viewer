<script setup lang="ts">
/** 炮台的只读参数：分组 / 相位偏移、四层优先级 */
import { computed } from 'vue'
import offIcon from '../../../assets/factory/turret/priority-0-off.png'
import lowIcon from '../../../assets/factory/turret/priority-1-low.png'
import normalIcon from '../../../assets/factory/turret/priority-2-normal.png'
import highIcon from '../../../assets/factory/turret/priority-3-high.png'

/** 下标就是 VSLayerMask 的 2 bit 值：0 关闭 / 1 低优先 / 2 均衡 / 3 高优先 */
const TURRET_PRIORITY_ICONS = [offIcon, lowIcon, normalIcon, highIcon]

const props = defineProps<{
  /** 建筑 id（3006 是干扰塔） */
  itemId: number
  parameters: Record<string, any>
}>()

/** 干扰塔不显示分组，改显示相位偏移 */
const isDisturb = computed(() => Number(props.itemId) === 3006)

const groupText = computed(() => {
  const group = Number(props.parameters?.group ?? 0)
  if (group === 0) return '未分组'
  return group >= 1 && group <= 5 ? `分组${group}` : '---'
})

const phaseText = computed(() => {
  const value = Number(props.parameters?.phasePos)
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '---'
})

const PRIORITY_LABELS = ['地面', '低空', '高空', '太空']
const PRIORITY_NAMES = ['关闭', '低优先', '均衡', '高优先']

/** vsSettings 是 [地面, 低空, 高空, 太空] 四个 0-3 */
const priorityStates = computed(() => {
  const raw = props.parameters?.vsSettings
  return PRIORITY_LABELS.map((_, i) => {
    const value = Number(Array.isArray(raw) ? raw[i] : 0)
    return Math.min(3, Math.max(0, Number.isFinite(value) ? value : 0))
  })
})
</script>

<template>
  <div class="factory-selection-params factory-turret">
    <div v-if="!isDisturb" class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">分组：</span>
      <span class="factory-selection-value">{{ groupText }}</span>
    </div>
    <div v-else class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">相位偏移：</span>
      <span class="factory-selection-value">{{ phaseText }} 秒</span>
    </div>

    <div class="factory-turret-priority">
      <div class="factory-turret-priority-grid">
        <div
          v-for="(label, i) in PRIORITY_LABELS"
          :key="label"
          class="factory-turret-priority-item"
        >
          <span class="factory-turret-priority-label">{{ label }}</span>
          <img
            class="factory-turret-priority-icon"
            :src="TURRET_PRIORITY_ICONS[priorityStates[i]] ?? TURRET_PRIORITY_ICONS[0]"
            :title="PRIORITY_NAMES[priorityStates[i]] ?? '关闭'"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.factory-turret-priority {
  width: 100%;
}

.factory-turret-priority-grid {
  display: flex;
  width: 100%;
  justify-content: flex-start;
  align-items: center;
  gap: 20px;
}

.factory-turret-priority-item {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.factory-turret-priority-label {
  font-size: 12px;
  color: #8fa3c8;
  white-space: nowrap;
}

.factory-turret-priority-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
</style>
