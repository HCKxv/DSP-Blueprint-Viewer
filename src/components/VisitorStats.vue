<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'

const SCRIPT_SRC = 'https://events.vercount.one/js'
const hasNetwork = navigator.onLine
let scriptEl: HTMLScriptElement | null = null

onMounted(() => {
  if (!hasNetwork) return

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
  if (existing) {
    scriptEl = existing
    return
  }

  const s = document.createElement('script')
  s.src = SCRIPT_SRC
  s.defer = true
  document.head.appendChild(s)
  scriptEl = s
})

onBeforeUnmount(() => {
  if (scriptEl && scriptEl.parentNode) {
    scriptEl.parentNode.removeChild(scriptEl)
  }
})
</script>

<template>
  <template v-if="hasNetwork">
    |
    <div class="footer-center">
      <span id="vercount_value_page_pv">0</span> / <span id="vercount_value_site_uv">0</span>
    </div>
  </template>
</template>
