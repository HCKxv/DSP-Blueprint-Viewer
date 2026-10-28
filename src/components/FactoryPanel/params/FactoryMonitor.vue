<script setup lang="ts">
/** 流速监测器（2030）的参数 */
import { computed } from 'vue'
import { itemName } from '../../../lib/blueprint/factory/factoryItems.js'
import { itemIconUrl } from '../../../lib/markup/itemIcons'
import { colorPaletteColor } from '../../../lib/markup/colorPalette.js'

const props = defineProps<{
  /** 这栋建筑的参数对象 */
  parameters: Record<string, any>
}>()

/** 监测条件（passOperator）→ 名字 */
const OPERATOR_NAMES: Record<number, string> = {
  0: '等于',
  1: '不等于',
  2: '大于等于',
  3: '大于',
  4: '小于等于',
  5: '小于',
}

/** 系统警报 / 声音警报的模式名 */
const ALARM_MODE_NAMES: Record<number, string> = {
  0: '无',
  1: '未满足条件',
  2: '满足条件',
  3: '有货物响',
  4: '无货物响',
  5: '未满足且有货物',
  6: '未满足且无货物',
}

/** 生成/消耗货物模式名（0 = 没勾选） */
const SPAWN_MODE_NAMES: Record<number, string> = {
  0: '生成/消耗货物',
  1: '生成货物',
  2: '消耗货物',
}

/** 参数值（缺省都按 0） */
const periodTicks = computed(() => Number(props.parameters?.periodTicksCount ?? 0))
const targetAmount = computed(() => Number(props.parameters?.targetCargoAmount ?? 0))
const passOperator = computed(() => Number(props.parameters?.passOperator ?? 0))
const passColorId = computed(() => Number(props.parameters?.passColorId ?? 0))
const failColorId = computed(() => Number(props.parameters?.failColorId ?? 0))
const cargoFilter = computed(() => Number(props.parameters?.cargoFilter ?? 0))
const spawnMode = computed(() => Number(props.parameters?.spawnItemOperator ?? 0))
const systemWarningMode = computed(() => Number(props.parameters?.systemWarningMode ?? 0))
const systemWarningIconId = computed(() => Number(props.parameters?.systemWarningIconId ?? 0))
const alarmMode = computed(() => Number(props.parameters?.alarmMode ?? 0))
const signalId = computed(() => Number(props.parameters?.digitalSignalId ?? 0))

/** 监测周期：参数按 tick 存，显示成秒 */
const periodText = computed(() => (periodTicks.value / 60).toFixed(2))
/** 目标流量：参数以 0.1 个为单位 */
const targetText = computed(() => (targetAmount.value / 10).toFixed(1))

const operatorText = computed(() => OPERATOR_NAMES[passOperator.value] ?? String(passOperator.value))
/** 颜色 0 在游戏数据里是透明，监测器面板上按白色显示 */
function swatchColor(index: number) {
  return index === 0 ? '#ffffff' : colorPaletteColor(index)
}
/** 生成/消耗货物：勾选框只看有没有开启 */
const spawnText = computed(() => SPAWN_MODE_NAMES[spawnMode.value] ?? String(spawnMode.value))
const systemWarningText = computed(() => ALARM_MODE_NAMES[systemWarningMode.value] ?? String(systemWarningMode.value))
/** 系统警报图标（信号 id）的图片地址；0 或没有对应图标时为空 */
const warningIcon = computed(() => (systemWarningIconId.value > 0 ? itemIconUrl(systemWarningIconId.value) : ''))
const alarmText = computed(() => ALARM_MODE_NAMES[alarmMode.value] ?? String(alarmMode.value))
</script>

<template>
  <div class="factory-selection-params factory-monitor">
    <div class="factory-monitor-head">监测设置</div>

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">监测周期：</span>
      <input
        class="factory-monitor-field factory-monitor-num"
        :value="periodText"
        readonly
        tabindex="-1"
      />
      <span class="factory-monitor-unit">秒</span>
      <span class="factory-selection-label factory-monitor-label-gap">目标流量：</span>
      <input
        class="factory-monitor-field factory-monitor-num"
        :value="targetText"
        readonly
        tabindex="-1"
      />
      <span class="factory-monitor-unit">个</span>
    </div>

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">检测条件：</span>
      <input
        class="factory-monitor-field factory-monitor-op"
        :value="operatorText"
        readonly
        tabindex="-1"
      />

      <span
        class="factory-monitor-color"
        :style="{ background: swatchColor(passColorId) }"
      ></span>
      <span class="factory-monitor-text">满足</span>
      <span
        class="factory-monitor-color"
        :style="{ background: swatchColor(failColorId) }"
      ></span>
      <span class="factory-monitor-text">不满足</span>
      <span class="factory-monitor-id-label">id：</span>
      <input
        class="factory-monitor-field factory-monitor-id"
        :value="signalId"
        readonly
        tabindex="-1"
      />
    </div>

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">货物过滤：</span>
      <span class="factory-monitor-item">
        <img
          v-if="cargoFilter > 0"
          class="factory-icon"
          :src="itemIconUrl(cargoFilter)"
          :alt="itemName(cargoFilter)"
        />
      </span>
      <input
        class="factory-monitor-check"
        type="checkbox"
        :checked="spawnMode > 0"
        disabled
        tabindex="-1"
      />
      <span class="factory-monitor-text">{{ spawnText }}</span>
    </div>

    <div class="factory-monitor-head factory-monitor-head-alarm">警报设置</div>

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">系统警报：</span>
      <input
        class="factory-monitor-field factory-monitor-mode"
        :value="systemWarningText"
        readonly
        tabindex="-1"
      />
      <template v-if="systemWarningMode !== 0">
        <span class="factory-selection-label">警报图标：</span>
        <span class="factory-monitor-alert-icon">
          <img v-if="warningIcon" class="factory-icon" :src="warningIcon" alt="" />
        </span>
      </template>
    </div>

    <div class="factory-selection-row factory-selection-param">
      <span class="factory-selection-label">声音警报：</span>
      <input
        class="factory-monitor-field factory-monitor-mode"
        :value="alarmText"
        readonly
        tabindex="-1"
      />
    </div>
  </div>
</template>

<style scoped>
/* .factory-selection-* 那套参数行是共用件（在 styles/shared.css 里）：
   它们挂在父组件 FactorySelection 的模板结构下，写成本组件的 scoped 会失效 */

.factory-monitor-head {
  font-size: 12px;
  font-weight: bold;
  color: #8fa3c8;
}

/* 文本框与颜色块共用的高度 */
.factory-monitor {
  --factory-monitor-control-h: 22px;
}

/* 两段之间留一行空 */
.factory-monitor-head-alarm {
  margin-top: 7px;
}

/* 同一行里的第二组（监测周期 / 目标流量） */
.factory-monitor-label-gap {
  margin-left: 4px;
}

/* 只读文本框 */
.factory-monitor-field {
  min-width: 0;
  height: var(--factory-monitor-control-h);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: var(--bg-slot);
  color: var(--fg-value);
  font-family: inherit;
  font-size: 14px;
  line-height: 18px;
  cursor: default;
}

/* 只读框不走焦点高亮 */
.factory-monitor-field:focus {
  outline: none;
}

.factory-monitor-num {
  /* 目标流量最大 7200.0（6 个字符），留够宽度 */
  width: 68px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.factory-monitor-unit {
  flex-shrink: 0;
  font-size: 13px;
  color: #8fa3c8;
}

.factory-monitor-op {
  /* 最长的「大于等于」是 4 个字 */
  width: 72px;
  text-align: center;
}

.factory-monitor-id-label {
  flex-shrink: 0;
  color: #8fa3c8;
  white-space: nowrap;
}

.factory-monitor-id {
  width: 56px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 颜色方块；高度跟输入框一致，底色由 colorPalette256 按索引给出 */
.factory-monitor-color {
  flex-shrink: 0;
  width: var(--factory-monitor-control-h);
  height: var(--factory-monitor-control-h);
  border-radius: 3px;
  border: 1px solid var(--line-strong);
  background: var(--bg-slot);
}

.factory-monitor-text {
  flex-shrink: 0;
  color: var(--fg-secondary);
  white-space: nowrap;
}

/* 货物过滤：只读图标格 */
.factory-monitor-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: var(--bg-slot);
}

.factory-monitor-item .factory-icon {
  width: 80%;
  height: 80%;
}

/* 系统警报图标：和输入框同高 */
.factory-monitor-alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--factory-monitor-control-h);
  height: var(--factory-monitor-control-h);
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: var(--bg-slot);
}

.factory-monitor-alert-icon .factory-icon {
  width: 80%;
  height: 80%;
}

.factory-monitor-mode {
  width: 118px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 只读勾选项：还能看出勾没勾，但点不动 */
.factory-monitor-check {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
  cursor: default;
}
</style>
