<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BaseModal from '../BaseModal.vue'
import { closeGenerateBlueprintModal, parseBlueprint, saveBlueprintText, store } from '../../stores/preview'
import { 壳层描述转壳层数据 } from '../../blueprint/sphere/singleShellTextParser.js'
import { blueprintTypeName } from '../../blueprint/sphere/sphereUtils.js'
import { stringifyBlueprint } from '../../blueprint/sphere/sphereEncoder.js'
import { show } from '../../stores/toast'

const PLACEHOLDER = `节点:
X, Y, Z || 经, 纬  // 例如: 3543,1328,1297 或 116.4,39.9
...（换行或者间隔“;”表示下一个节点）
框架:(可选)
节点A(序号), 节点B(序号), 类型(测地/经纬 || 0/1)  // 例如: 5,9,测地
...（同上）
壳面:(可选)
节点序号, ...  // 例如: 1,2,3
...（同上）
样式:(可选)
节点,框架,壳面(#RRGGBB)  // 第一行是颜色行, 可留空, 例如: ,,#EE1C25
框架,壳面(编号或名字)  // 样式行, 可留空

# 支持全角/半角符号; 节点序号从 1 开始;
# 壳面样式编号与名字：0-蜂巢, 1-锁子, 2-棱形, 3-鱼鳞, 4-十字, 5-电路, 6-三六边形嵌套;
# 框架样式编号：1, 2, 3;`

const text = ref('')
const errorMessage = ref('')
const busy = ref<'' | 'preview' | 'copy' | 'save'>('')

const canGenerate = computed(() => text.value.trim() !== '' && !busy.value)
const canClear = computed(() => text.value !== '' && !busy.value)

watch(
  () => store.showGenerateBlueprintModal,
  (open) => {
    if (!open) return
    busy.value = ''
    errorMessage.value = ''
  },
)

// 输入变化后清掉上一次的格式错误
watch(text, () => {
  errorMessage.value = ''
})

/** 把壳层描述文本转换为单层壳蓝图对象 */
function buildBlueprint(): Record<string, any> {
  const raw = text.value.trim()
  if (!raw) throw new Error('请输入壳层描述')
  const shell = 壳层描述转壳层数据(raw)
  return {
    header: {},
    typeId: 1,
    typeName: blueprintTypeName(1),
    singleShell: shell,
  }
}

async function generateText(): Promise<string> {
  errorMessage.value = ''
  try {
    return await stringifyBlueprint(buildBlueprint())
  } catch (error) {
    errorMessage.value = (error as Error).message
    throw error
  }
}

/** 生成后写回输入框并解析，直接进入预览 */
async function generateAndPreview(): Promise<void> {
  if (!canGenerate.value) return
  busy.value = 'preview'
  try {
    const blueprintText = await generateText()
    store.input = blueprintText
    parseBlueprint()
    closeGenerateBlueprintModal()
  } catch (error) {
    if (!errorMessage.value) show(`生成蓝图失败：\n${(error as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function copyToClipboard(): Promise<void> {
  if (!canGenerate.value) return
  busy.value = 'copy'
  try {
    const blueprintText = await generateText()
    await navigator.clipboard.writeText(blueprintText)
    show('生成的蓝图已复制到剪贴板')
  } catch (error) {
    if (!errorMessage.value) show(`生成或复制失败：\n${(error as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function downloadToFile(): Promise<void> {
  if (!canGenerate.value) return
  busy.value = 'save'
  try {
    const blueprintText = await generateText()
    const saved = await saveBlueprintText(blueprintText, '生成的单层壳')
    if (!saved) return
    show(saved)
  } catch (error) {
    if (!errorMessage.value) show(`生成或下载失败：\n${(error as Error).message}`)
  } finally {
    busy.value = ''
  }
}

function clearInput(): void {
  if (busy.value) return
  text.value = ''
  errorMessage.value = ''
}

function closeModal(): void {
  if (busy.value) return
  closeGenerateBlueprintModal()
}

onBeforeUnmount(closeGenerateBlueprintModal)
</script>

<template>
  <BaseModal :open="store.showGenerateBlueprintModal" title="生成蓝图" :width="600" @close="closeModal">
    <div class="generate-blueprint">
      <textarea
        v-model="text"
        class="generate-blueprint-input"
        :placeholder="PLACEHOLDER"
        :disabled="!!busy"
        spellcheck="false"
      ></textarea>

      <div v-if="errorMessage" class="generate-blueprint-error">{{ errorMessage }}</div>

      <span class="btn-group center">
        <button class="btn-sm" type="button" :disabled="!canGenerate" @click="generateAndPreview">
          {{ busy === 'preview' ? '生成中...' : '生成并预览' }}
        </button>
        <button class="btn-sm" type="button" :disabled="!canGenerate" @click="copyToClipboard">
          {{ busy === 'copy' ? '生成中...' : '复制到剪贴板' }}
        </button>
        <button class="btn-sm" type="button" :disabled="!canGenerate" @click="downloadToFile">
          {{ busy === 'save' ? '生成中...' : '下载到文件' }}
        </button>
        <button class="btn-sm btn-ghost" type="button" :disabled="!canClear" @click="clearInput">
          清空
        </button>
        <button class="btn-sm btn-ghost" type="button" :disabled="!!busy" @click="closeModal">
          取消
        </button>
      </span>
    </div>
  </BaseModal>
</template>

<style scoped>
.generate-blueprint {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.generate-blueprint .btn-group {
  flex-wrap: wrap;
  justify-content: center;
}

.generate-blueprint-input {
  flex: none;
  width: 100%;
  min-height: 340px;
  max-height: 1200px;
  resize: vertical;
  text-align: left;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.generate-blueprint-input::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.generate-blueprint-input::-webkit-scrollbar-corner {
  background: var(--bg-secondary);
}

.generate-blueprint-error {
  color: var(--danger);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
