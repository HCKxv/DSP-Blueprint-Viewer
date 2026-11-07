<script setup lang="ts">
/** 一行勾选参数：parameters[field] ↔ checkbox */
import { computed } from 'vue'

const props = defineProps<{
  parameters: Record<string, any>
  /** 参数对象里的字段名 */
  field: string
  /** 勾选项名称 */
  name: string
  /** 只读时不可勾选 */
  readonly?: boolean
}>()

const emit = defineEmits<{
  change: [field: string, value: unknown]
}>()

const checked = computed(() => Boolean(props.parameters?.[props.field]))

function onChange(event: Event) {
  emit('change', props.field, (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="factory-param-check" :class="{ 'is-readonly': readonly }">
    <input
      class="factory-param-checkbox"
      type="checkbox"
      :checked="checked"
      :disabled="readonly"
      @change="onChange"
    />
    <span>{{ name }}</span>
  </label>
</template>

<style scoped>
.factory-param-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--fg-secondary);
  cursor: pointer;
}

.factory-param-check.is-readonly {
  cursor: default;
}

.factory-param-checkbox {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.factory-param-checkbox:disabled {
  cursor: default;
}
</style>
