<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppToast from './components/AppToast.vue'
import SphereParse from './components/SphereParse.vue'
import FactoryParse from './components/FactoryParse.vue'
import FooterBar from './components/FooterBar.vue'
import PaintingParse from './components/PaintingParse.vue'
import { loadVisitorStats } from './utils/visitorStats'
import { clearTxtParamFromUrl, loadBlueprintFromUrl } from './utils/urlLoader'
import { activeTool } from './stores/tool'
import { applyBlueprintText } from './stores/blueprintImport'
import { startBlueprintMessageBridge } from './utils/postMessageBridge'
import { show } from './stores/toast'

const enableExternalLoad = import.meta.env.VITE_ENABLE_EXTERNAL_LOAD === 'true'
const showFooter = import.meta.env.VITE_SHOW_FOOTER === 'true'
const visitorStatsEnabled = import.meta.env.VITE_VISITOR_STATS === 'true'

/** URL 参数加载（?txt=...） */
function loadUrlBlueprint() {
  // 关闭时也要清掉 ?txt=，否则参数会留在地址栏
  if (!enableExternalLoad) {
    clearTxtParamFromUrl()
    return
  }
  loadBlueprintFromUrl({
    onLoadStart: () => show('正在加载蓝图',10_000),
    onLoaded: (text) => {
      applyBlueprintText(text).catch((e: Error) => show(`加载蓝图失败：\n${e.message}`))
    },
    onError: (e) => show(`加载蓝图失败：\n${e.message}`),
  }).catch((e: Error) => show(`加载蓝图失败：\n${e.message}`))
}

let stopBlueprintBridge: (() => void) | undefined

// 全局拖放拦截 / 中键自动滚动阻止
function onGlobalDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}
function onGlobalDrop(e: DragEvent) {
  e.preventDefault()
}
function onMouseDown(e: MouseEvent) {
  if (e.button === 1) e.preventDefault()
}

onMounted(() => {
  if (visitorStatsEnabled) loadVisitorStats()
  window.addEventListener('dragover', onGlobalDragOver)
  window.addEventListener('drop', onGlobalDrop)
  document.addEventListener('mousedown', onMouseDown)

  // URL 参数加载（?txt=...）
  loadUrlBlueprint()

  // postMessage 投递：宿主页打开 / 嵌入本页后可直接发送蓝图文本
  if (enableExternalLoad) {
    stopBlueprintBridge = startBlueprintMessageBridge({
      onText: (text) => applyBlueprintText(text),
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', onGlobalDragOver)
  window.removeEventListener('drop', onGlobalDrop)
  document.removeEventListener('mousedown', onMouseDown)
  stopBlueprintBridge?.()
})
</script>

<template>
  <div class="app">
    <AppHeader />
    <SphereParse v-if="activeTool === 'preview'" />
    <PaintingParse v-else-if="activeTool === 'paint'" />
    <FactoryParse v-else />
  </div>

  <FooterBar v-if="showFooter" />
  <AppToast />
</template>
