import { createApp } from 'vue'
import App from './App.vue'
import './styles/index.css'

createApp(App).mount('#app')

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return
    showUpdateNotice()
  })
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
    'padding: 10px 16px',
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
