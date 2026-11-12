/**
 * usePwaStatus — PWA 状态
 *
 * 注册由 vite-plugin-pwa 注入的 registerSW.js 负责（见 vite.config.ts 的 injectRegister: 'auto'）。
 * 状态来源：
 *   - controller 非空 ⇒ SW 已接管，离线可用
 *   - ready（首次访问）⇒ 安装完成，离线可用
 *   - controllerchange：首次接管 ⇒ 离线可用；已接管后再触发 ⇒ 新版本就绪
 *   - updatefound（已接管）⇒ 新版本安装中，正在缓存…
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type PwaPhase = 'unsupported' | 'installing' | 'ready' | 'updated'

export function usePwaStatus() {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator

  /** 本次会话里 SW 是否已经接管过（用于区分「首次安装完成」和「新版本接管」） */
  let controlled = supported && !!navigator.serviceWorker.controller
  let disposed = false
  let registration: ServiceWorkerRegistration | null = null

  /** 初始：已接管才算就绪，其余按未启用显示 */
  const phase = ref<PwaPhase>(!supported ? 'unsupported' : controlled ? 'ready' : 'unsupported')

  function onControllerChange() {
    if (disposed) return
    if (controlled) {
      // 已接管过 ⇒ 这次是新版本接管（autoUpdate：skipWaiting + clientsClaim）
      phase.value = 'updated'
      return
    }
    controlled = true
    phase.value = 'ready'
  }

  /** 更新检查发现新版本（仅已接管）：安装期间显示「正在缓存…」，安装失败退回「离线可用」 */
  function onUpdateFound() {
    if (disposed || !registration) return
    // 首次安装（没有 controller）走 ready 分支
    if (!navigator.serviceWorker.controller) return
    const worker = registration.installing
    if (!worker) return

    phase.value = 'installing'

    const onStateChange = () => {
      if (worker.state !== 'redundant' && worker.state !== 'activated') return
      worker.removeEventListener('statechange', onStateChange)
      if (disposed) return
      // 安装失败（预缓存下不下来等）：退回可用状态；正常激活由 controllerchange 转「新版本就绪」
      if (worker.state === 'redundant' && phase.value === 'installing') phase.value = 'ready'
    }
    worker.addEventListener('statechange', onStateChange)
  }

  onMounted(() => {
    if (!supported) return

    // 首次接管（未受控页面）与新版本接管都会走这里
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // 拿 registration：挂 updatefound，同时作为「首次安装完成」的信号
    navigator.serviceWorker.ready.then((reg) => {
      if (disposed) return
      registration = reg
      reg.addEventListener('updatefound', onUpdateFound)
      // 首次访问：装完（激活）就算离线可用
      if (!controlled && phase.value === 'unsupported') phase.value = 'ready'
    })
  })

  onBeforeUnmount(() => {
    disposed = true
    if (supported) navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    registration?.removeEventListener('updatefound', onUpdateFound)
    registration = null
  })

  /** 有新版本时这枚状态变成可点击的「刷新」 */
  const canReload = computed(() => phase.value === 'updated')

  function reload() {
    if (canReload.value) window.location.reload()
  }

  return { phase, canReload, reload }
}
