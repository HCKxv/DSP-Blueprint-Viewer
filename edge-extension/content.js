// 右键检测蓝图文本：命中时通知后台显示「查看蓝图」菜单

/** 蓝图格式：<DYBP:|BLUEPRINT:><头部>"<base64>"<32 位十六进制校验码> */
const BLUEPRINT_PATTERN = /^(?:DYBP:|BLUEPRINT:)[\s\S]*"[^"]*"[0-9A-Fa-f]{32}$/
/** 右键检测结果在内存里保留的时间（毫秒），后台点菜单时来取 */
const PENDING_TTL = 120000
const VIEWER_REQUEST_READY_MESSAGE = 'blueprint:viewer-request-ready'
const VIEWER_SEND_LOAD_MESSAGE = 'blueprint:viewer-send-load'

let pending = null

/** 返回去掉首尾空白后的蓝图文本；不是蓝图返回空串 */
function blueprintText(raw) {
  const value = (raw || '').trim()
  return BLUEPRINT_PATTERN.test(value) ? value : ''
}

/** 只读取右键目标本身的文本，不向祖先元素查找 */
function elementText(element) {
  if (!element) return ''
  if (element instanceof HTMLTextAreaElement) return element.value
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase()
    return ['text', 'search', 'url', 'email', 'tel', 'password'].includes(type) ? element.value : ''
  }
  if (element.isContentEditable) return element.innerText || element.textContent || ''
  return element.innerText || element.textContent || ''
}

/** 优先用选中的文本，其次用右键目标自身的文本 */
function readCandidate(element) {
  const selection = (window.getSelection()?.toString() || '').trim()
  if (blueprintText(selection)) return selection
  return elementText(element)
}

function sendContext(hasBlueprint) {
  try {
    const request = chrome.runtime.sendMessage({ type: 'blueprint:context', hasBlueprint })
    if (request && typeof request.catch === 'function') request.catch(() => {})
  } catch {
    /* 扩展更新 / 卸载后忽略 */
  }
}

function sync(element) {
  const text = blueprintText(readCandidate(element))
  pending = text ? { text, at: Date.now() } : null
  sendContext(Boolean(text))
}

/** 等待查看器页面发回指定消息，并拒绝其他来源的消息 */
function waitForViewerMessage(type, origin) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('等待蓝图工具响应超时'))
    }, 10000)

    function onMessage(event) {
      if (event.source !== window || event.origin !== origin) return
      if (!event.data || event.data.type !== type) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve(event.data)
    }

    window.addEventListener('message', onMessage)
  })
}

// mousedown 比 contextmenu 早，先同步一次，给后台留出更新菜单的时间
window.addEventListener('mousedown', (event) => {
  if (event.button === 2) sync(event.target)
}, true)

window.addEventListener('contextmenu', (event) => {
  sync(event.target)
}, true)

// 后台点菜单时来取刚检测到的蓝图文本
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'blueprint:get-target') return
  if (pending && Date.now() - pending.at <= PENDING_TTL) sendResponse({ text: pending.text })
  else sendResponse(null)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return
  if (message.type !== VIEWER_REQUEST_READY_MESSAGE && message.type !== VIEWER_SEND_LOAD_MESSAGE) return

  const origin = typeof message.origin === 'string' ? message.origin : ''
  if (!origin || origin !== window.location.origin) {
    sendResponse({ ok: false, message: '查看器域名不匹配' })
    return
  }

  const isReadyRequest = message.type === VIEWER_REQUEST_READY_MESSAGE
  const response = waitForViewerMessage(
    isReadyRequest ? 'dsp-blueprint:ready' : 'dsp-blueprint:result',
    origin,
  )
  const pageMessage = isReadyRequest
    ? { type: 'dsp-blueprint:request-ready' }
    : { type: 'dsp-blueprint:load', text: message.text }

  window.postMessage(pageMessage, origin)
  response.then((data) => {
    sendResponse(isReadyRequest
      ? { ok: true }
      : { ok: Boolean(data.ok), message: String(data.message || '') })
  }).catch((error) => {
    sendResponse({ ok: false, message: error.message })
  })
  return true
})
