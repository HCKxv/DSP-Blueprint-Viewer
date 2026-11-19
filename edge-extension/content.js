// 右键检测蓝图文本：命中时通知后台显示「查看蓝图」菜单

/** 蓝图格式：<DYBP:|BLUEPRINT:><头部>"<base64>"<32 位十六进制校验码> */
const BLUEPRINT_PATTERN = /^(?:DYBP:|BLUEPRINT:)[\s\S]*"[^"]*"[0-9A-Fa-f]{32}$/
/** 右键检测结果在内存里保留的时间（毫秒），后台点菜单时来取 */
const PENDING_TTL = 120000

let pending = null

/** 返回去掉首尾空白后的蓝图文本；不是蓝图返回空串 */
function blueprintText(raw) {
  const value = (raw || '').trim()
  return BLUEPRINT_PATTERN.test(value) ? value : ''
}

/** 取元素里可能承载蓝图的那段文本 */
function elementText(element) {
  if (!element) return ''
  if (element instanceof HTMLTextAreaElement) return element.value
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase()
    return ['text', 'search', 'url', 'email', 'tel', 'password'].includes(type) ? element.value : ''
  }
  if (element.isContentEditable) return element.innerText || element.textContent || ''
  const code = element.closest ? element.closest('pre, code') : null
  return code ? code.innerText || code.textContent || '' : ''
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
