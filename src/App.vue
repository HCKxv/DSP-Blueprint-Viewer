<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppToast from './components/AppToast.vue'
import SphereParse from './components/SphereParse.vue'
import FactoryParse from './components/FactoryParse.vue'
import FooterBar from './components/FooterBar.vue'
import PaintingParse from './components/PaintingParse.vue'
import { store, parseBlueprint } from './stores/preview'
import { loadBlueprintText } from './stores/factory'
import { activeTool } from './stores/tool'
import { loadVisitorStats } from './utils/visitorStats'
import { clearTxtParamFromUrl, loadBlueprintFromUrl } from './utils/urlLoader'
import { show } from './stores/toast'

const enableUrlLoad = import.meta.env.VITE_ENABLE_URL_LOAD === 'true'
const showFooter = import.meta.env.VITE_SHOW_FOOTER === 'true'
const visitorStatsEnabled = import.meta.env.VITE_SHOW_VISITOR_STATS === 'true'

/** URL 参数加载（?txt=...） */
function loadUrlBlueprint() {
  // 关闭时也要清掉 ?txt=，否则参数会留在地址栏
  if (!enableUrlLoad) {
    clearTxtParamFromUrl()
    return
  }
  loadBlueprintFromUrl({
    onLoadStart: () => show('正在加载蓝图',10_000),
    // type 由蓝图开头标记判定：DYBP: → 球体预览；BLUEPRINT: → 工厂预览
    onLoaded: async (text, type) => {
      if (type === 'factory') {
        activeTool.value = 'factory'
        const res = await loadBlueprintText(text)
        if (!res.ok) show(`加载蓝图失败：\n${res.message}`)
        else show(res.message)
        return
      }
      activeTool.value = 'preview'
      store.input = text
      parseBlueprint()
    },
    onError: (e) => show(`加载蓝图失败：\n${e.message}`),
  }).catch((e: Error) => show(`加载蓝图失败：\n${e.message}`))
}

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
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', onGlobalDragOver)
  window.removeEventListener('drop', onGlobalDrop)
  document.removeEventListener('mousedown', onMouseDown)
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
