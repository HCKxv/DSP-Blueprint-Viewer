/**
 * pwaStatus — PWA 状态
 *
 * 注册由 vite-plugin-pwa 注入的 registerSW.js 负责（见 vite.config.ts 的 injectRegister: 'auto'）。
 * 状态来源：
 *   - controller 非空 ⇒ SW 已接管，离线可用
 *   - ready（首次访问）⇒ 安装完成，离线可用
 *   - controllerchange：首次接管 ⇒ 离线可用；已接管后再触发 ⇒ 新版本就绪
 *   - updatefound（已接管）⇒ 新版本安装中，正在缓存…
 */
import { computed, ref } from 'vue'

export type PwaPhase = 'unsupported' | 'installing' | 'ready' | 'updated'

const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator

/** 本次会话里 SW 是否已经接管过（用于区分「首次安装完成」和「新版本接管」） */
let controlled = supported && !!navigator.serviceWorker.controller
let registration: ServiceWorkerRegistration | null = null

/** 初始：已接管才算就绪，其余按未启用显示 */
export const phase = ref<PwaPhase>(!supported ? 'unsupported' : controlled ? 'ready' : 'unsupported')

function onControllerChange() {
  if (controlled) {
    // 已接管过 ⇒ 这次是新版本接管（autoUpdate：skipWaiting + clientsClaim）
    phase.value = 'updated'
    showUpdateNotice()
    return
  }
  controlled = true
  phase.value = 'ready'
}

/** 更新检查发现新版本（仅已接管）：安装期间显示「正在缓存…」，安装失败退回「离线可用」 */
function onUpdateFound() {
  if (!registration) return
  // 首次安装（没有 controller）走 ready 分支
  if (!navigator.serviceWorker.controller) return
  const worker = registration.installing
  if (!worker) return

  phase.value = 'installing'

  const onStateChange = () => {
    if (worker.state !== 'redundant' && worker.state !== 'activated') return
    worker.removeEventListener('statechange', onStateChange)
    // 安装失败（预缓存下不下来等）：退回可用状态；正常激活由 controllerchange 转「新版本就绪」
    if (worker.state === 'redundant' && phase.value === 'installing') phase.value = 'ready'
  }
  worker.addEventListener('statechange', onStateChange)
}

if (supported) {
  // 首次接管（未受控页面）与新版本接管都会走这里
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

  // 拿 registration：挂 updatefound，同时作为「首次安装完成」的信号
  navigator.serviceWorker.ready.then((reg) => {
    registration = reg
    reg.addEventListener('updatefound', onUpdateFound)
    // 首次访问：装完（激活）就算离线可用
    if (!controlled && phase.value === 'unsupported') phase.value = 'ready'
  })
}

/** 有新版本时这枚状态变成可点击的「刷新」 */
export const canReload = computed(() => phase.value === 'updated')

export function reload() {
  if (canReload.value) window.location.reload()
}

function showUpdateNotice() {
  if (document.getElementById('sw-update-notice')) return
  const notice = document.createElement('div')
  notice.id = 'sw-update-notice'
  notice.style.cssText = [
    'position: fixed',
    'left: 50%',
    'bottom: 20px',
    'transform: translateX(-50%)',
    'display: flex',
    'align-items: center',
    'gap: 10px',
    'padding: 10px',
    'background: var(--bg-panel)',
    'border: 1px solid var(--line)',
    'border-radius: var(--radius-sm)',
    'color: var(--fg)',
    'font-size: 0.9rem',
    'box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45)',
    'z-index: 10000',
  ].join(';')
  notice.textContent = '检测到更新'

  const ignoreBtn = document.createElement('button')
  ignoreBtn.textContent = '忽略'
  ignoreBtn.style.cssText =
    'padding: 5px 14px; border-radius: var(--radius-xs); background: var(--bg-component); color: var(--fg-secondary);'
  ignoreBtn.addEventListener('click', () => notice.remove())
  ignoreBtn.addEventListener('mouseenter', () => (ignoreBtn.style.background = 'var(--state-hover)'))
  ignoreBtn.addEventListener('mouseleave', () => (ignoreBtn.style.background = 'var(--bg-component)'))

  const refreshBtn = document.createElement('button')
  refreshBtn.textContent = '刷新'
  refreshBtn.style.cssText = 'padding: 5px 14px; border-radius: var(--radius-xs);'
  refreshBtn.addEventListener('click', () => window.location.reload())

  notice.append(ignoreBtn, refreshBtn)
  document.body.appendChild(notice)
}
