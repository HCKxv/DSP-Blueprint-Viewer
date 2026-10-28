<script setup lang="ts">
/** 电磁轨道弹射器（2311） / 垂直发射井（2312）的参数 */
import { computed } from 'vue'
import FactoryParamCheck from './FactoryParamCheck.vue'

const props = defineProps<{
  /** 2311 弹射器；2312 垂直发射井 */
  itemId: number
  /** 这栋建筑的参数对象 */
  parameters: Record<string, any>
}>()

const emit = defineEmits<{
  change: [field: string, value: unknown]
}>()

/** 垂直发射井只有十倍射速 */
const isSilo = computed(() => Number(props.itemId) === 2312)

const orbitId = computed(() => Number(props.parameters?.orbitId ?? 0))
</script>

<template>
  <div class="factory-selection-params factory-ejector">
    <div v-if="!isSilo" class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">送入轨道：</span>
      <span class="factory-selection-value">{{ orbitId > 0 ? orbitId : '---' }}</span>
    </div>

    <FactoryParamCheck
      v-if="!isSilo"
      :parameters="parameters"
      field="autoOrbit"
      name="自动轨道"
      @change="(field, value) => emit('change', field, value)"
    />

    <FactoryParamCheck
      :parameters="parameters"
      field="tenfoldSpeed"
      name="十倍射速"
      @change="(field, value) => emit('change', field, value)"
    />
  </div>
</template>
