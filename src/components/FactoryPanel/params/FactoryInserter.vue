<script setup lang="ts">
/**
 * 分拣器的参数（2011~2014）
 */
import { ref } from 'vue'
import { itemIconUrl } from '../../../lib/markup/itemIcons'
import type { IconCategories, IconRef } from '../../../lib/markup/itemIcons'
import { itemName } from '../../../lib/blueprint/factory/factoryItems.js'
import IconPickerModal from '../IconPickerModal.vue'

defineProps<{
  /** 蓝图里这个分拣器的长度（parameters[0]，1~3 格） */
  length: number
  /** 筛选物品 id（建筑的 filterId，0 = 不筛选） */
  filterId: number
  /** 物品图标（「物品」+「建筑」两类） */
  itemIcons: IconCategories
  /** 输入端连接到的建筑 */
  input?: { index: number, itemId: number } | null
  /** 输出端连接到的建筑 */
  output?: { index: number, itemId: number } | null
}>()

const emit = defineEmits<{ 'update:filter-id': [number] }>()

/** 筛选物品浮层 */
const picker = ref(false)
const anchor = ref<HTMLElement | null>(null)

function openPicker(e: MouseEvent) {
  anchor.value = e.currentTarget as HTMLElement
  picker.value = true
}

function onPick(icon: IconRef) {
  emit('update:filter-id', Number(icon.id))
}

/** 右键图标 = 清除筛选 */
function onClear() {
  emit('update:filter-id', 0)
}
</script>

<template>
  <div class="factory-selection-params">
    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">筛选物品</span>
      <button
        class="factory-inserter-filter"
        type="button"
        :title="filterId > 0 ? '右键清除' : '选择物品'"
        @click="openPicker"
        @contextmenu.prevent="onClear"
      >
        <img
          v-if="filterId > 0"
          class="factory-icon"
          :src="itemIconUrl(filterId)"
          :alt="itemName(filterId)"
        />
        <span v-else class="factory-inserter-empty">+</span>
      </button>
    </div>

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">长度</span>
      <span class="factory-selection-value">{{ length }} 格</span>
    </div>

    <div class="factory-selection-row factory-selection-param factory-inserter-connection">
      <span class="factory-selection-label">连接：</span>
      <span class="factory-inserter-end">
        <template v-if="input">
          <span class="factory-inserter-index">#{{ input.index }}</span>
          <img
            class="factory-icon factory-inserter-icon"
            :src="itemIconUrl(input.itemId)"
            :alt="itemName(input.itemId)"
          />
          <span class="factory-inserter-name">{{ itemName(input.itemId) }}</span>
        </template>
        <span v-else class="factory-inserter-none">---</span>
      </span>
      <span class="factory-inserter-arrow">→</span>
      <span class="factory-inserter-end">
        <template v-if="output">
          <span class="factory-inserter-index">#{{ output.index }}</span>
          <img
            class="factory-icon factory-inserter-icon"
            :src="itemIconUrl(output.itemId)"
            :alt="itemName(output.itemId)"
          />
          <span class="factory-inserter-name">{{ itemName(output.itemId) }}</span>
        </template>
        <span v-else class="factory-inserter-none">---</span>
      </span>
    </div>

    <IconPickerModal
      :open="picker"
      :categories="itemIcons"
      :current="filterId"
      :anchor="anchor"
      title="筛选物品"
      @select="onPick"
      @close="picker = false"
    />
  </div>
</template>

<style scoped>
/* .factory-selection-* 那套参数行是共用件（在 styles/shared.css 里）：
   它们挂在父组件 FactorySelection 的模板结构下，写成本组件的 scoped 会失效 */

/* 输入端 → 输出端 */
.factory-inserter-connection {
  flex-wrap: wrap;
  row-gap: 4px;
}

.factory-inserter-end {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 4px;
}

.factory-inserter-index {
  flex-shrink: 0;
  color: #8fa3c8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.factory-inserter-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.factory-inserter-name {
  min-width: 0;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.factory-inserter-arrow {
  flex-shrink: 0;
  color: #8fa3c8;
}

.factory-inserter-none {
  color: #8fa3c8;
}

/* 点图标选（跟运输站物品栏那个大图标同一副长相，小一号） */
.factory-inserter-filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: var(--bg-slot);
  color: #6f8ec0;
  cursor: pointer;
}

.factory-inserter-filter:hover {
  border-color: var(--accent);
}

.factory-inserter-filter .factory-icon {
  width: 80%;
  height: 80%;
}

.factory-inserter-empty {
  font-size: 16px;
  line-height: 1;
}
</style>
