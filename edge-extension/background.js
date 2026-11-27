// 右键菜单 → 通过 postMessage 在蓝图工具中查看蓝图

const MENU_ID = 'dyson-open-blueprint'
const VIEWER_URL = 'https://hckxv.github.io/DSP-Blueprint-Viewer/'
const CONTEXT_MESSAGE = 'blueprint:context'
const GET_TARGET_MESSAGE = 'blueprint:get-target'
const VIEWER_REQUEST_READY_MESSAGE = 'blueprint:viewer-request-ready'
const VIEWER_SEND_LOAD_MESSAGE = 'blueprint:viewer-send-load'

/** 重建菜单项（默认隐藏，内容脚本命中蓝图后再显示） */
function ensureMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '查看蓝图',
      contexts: ['all'],
      visible: false,
      documentUrlPatterns: ['http://*/*', 'https://*/*', 'file:///*'],
    })
  })
}

function hideMenu() {
  chrome.contextMenus.update(MENU_ID, { visible: false }, () => {
    void chrome.runtime.lastError
  })
}

chrome.runtime.onInstalled.addListener(ensureMenu)
chrome.runtime.onStartup.addListener(ensureMenu)

chrome.tabs.onActivated.addListener(hideMenu)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') hideMenu()
})
chrome.windows.onFocusChanged.addListener(hideMenu)

// 内容脚本在右键时同步检测结果，据此显示 / 隐藏菜单项
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== CONTEXT_MESSAGE) return
  chrome.contextMenus.update(MENU_ID, { visible: Boolean(message.hasBlueprint) }, () => {
    void chrome.runtime.lastError
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return
  hideMenu()
  if (!tab || tab.id === undefined) return
  openFromTab(tab.id, info.frameId || 0).catch((error) => {
    console.warn('[蓝图] 打开失败：', error)
  })
})

/** 从被右键的页面取回蓝图文本，再交给查看器 */
async function openFromTab(tabId, frameId) {
  const target = await chrome.tabs
    .sendMessage(tabId, { type: GET_TARGET_MESSAGE }, { frameId })
    .catch(() => null)
  const text = target && typeof target.text === 'string' ? target.text.trim() : ''
  if (!text) {
    console.warn('[蓝图] 没有取到蓝图文本')
    return
  }
  await openInViewer(text)
}

/** 打开查看器标签页，通过 postMessage 握手并投递蓝图 */
async function openInViewer(text) {
  const viewerTab = await chrome.tabs.create({ url: VIEWER_URL })
  if (viewerTab.id === undefined) return
  await waitForTabComplete(viewerTab.id)

  const origin = new URL(VIEWER_URL).origin
  const ready = await chrome.tabs.sendMessage(viewerTab.id, {
    type: VIEWER_REQUEST_READY_MESSAGE,
    origin,
  }, { frameId: 0 })
  if (!ready || ready.ok === false) {
    console.warn('[蓝图] 打开失败：' + (ready && ready.message ? ready.message : '查看器没有完成握手'))
    return
  }

  const result = await chrome.tabs.sendMessage(viewerTab.id, {
    type: VIEWER_SEND_LOAD_MESSAGE,
    origin,
    text,
  }, { frameId: 0 })

  if (!result || result.ok === false) {
    console.warn('[蓝图] 打开失败：' + (result && result.message ? result.message : '查看器没有返回结果'))
  }
}

/** 等待标签页 load 完成；超时抛错 */
function waitForTabComplete(tabId, timeout = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      callback(value)
    }
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish(resolve)
    }
    const timer = setTimeout(() => finish(reject, new Error('页面加载超时')), timeout)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish(resolve)
    }).catch(() => {})
  })
}
