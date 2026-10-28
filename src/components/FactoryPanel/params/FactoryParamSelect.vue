<script setup lang="ts">
/** 一行下拉参数：parameters[field] ↔ 选项表 */
import { computed } from 'vue'

type Option = {
  /** 写回参数的原始值 */
  value: string | number | boolean
  /** 下拉里显示的名字 */
  name: string
}

const props = defineProps<{
  parameters: Record<string, any>
  /** 参数对象里的字段名 */
  field: string
  /** 行首名称 */
  name: string
  /** 值和名字的对照表 */
  options: Option[]
  /** 只读时下拉不可操作 */
  readonly?: boolean
}>()

const emit = defineEmits<{
  change: [field: string, value: unknown]
}>()

const value = computed(() => {
  const current = props.parameters?.[props.field]
  const hit = props.options.find((option) => String(option.value) === String(current))
  return hit ? String(hit.value) : ''
})

function onChange(event: Event) {
  const raw = (event.target as HTMLSelectElement).value
  const hit = props.options.find((option) => String(option.value) === raw)
  if (hit) emit('change', props.field, hit.value)
}
</script>

<template>
  <div class="factory-selection-row factory-selection-param">
    <span class="factory-selection-label">{{ name }}</span>
    <select
      class="factory-selection-select"
      :value="value"
      :disabled="readonly"
      @change="onChange"
    >
      <option v-if="value === ''" value="" disabled>---</option>
      <option
        v-for="option in options"
        :key="String(option.value)"
        :value="String(option.value)"
      >{{ option.name }}</option>
    </select>
  </div>
</template>

<style scoped>
.factory-selection-select:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
