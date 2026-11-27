/**
 * 跨页蓝图投递（postMessage）
 *
 * 宿主页（打开本页的标签页，或嵌入本页的父页面）流程：
 *   1. 先挂 message 监听，再打开 / 嵌入本页；
 *   2. 收到 { type: 'dsp-blueprint:ready' } 后发送
 *      { type: 'dsp-blueprint:load', text: 'DYBP:...' }（可以连续发送）；
 *   3. 收到 { type: 'dsp-blueprint:result', ok, message, kind } 得知处理结果。
 *
 * 如宿主错过 ready，可发送 { type: 'dsp-blueprint:request-ready' } 请求重新握手，
 * 本页会再次向该来源发送 { type: 'dsp-blueprint:ready' }。
 */

/** 本页 → 宿主：页面已就绪，可以投递蓝图 */
export const READY_MESSAGE_TYPE = 'dsp-blueprint:ready'
/** 宿主 → 本页：投递蓝图文本 */
export const LOAD_MESSAGE_TYPE = 'dsp-blueprint:load'
/** 本页 → 宿主：投递处理结果 */
export const RESULT_MESSAGE_TYPE = 'dsp-blueprint:result'
/** 宿主 → 本页：请求重新握手（重新发送 ready） */
export const REQUEST_READY_MESSAGE_TYPE = 'dsp-blueprint:request-ready'

export interface BridgeResult {
  ok: boolean
  message: string
  /** 识别出的蓝图种类：sphere / factory；内容不合法时为空 */
  kind?: string
}

/** 一条 load 消息解析出的内容 */
export interface LoadMessage {
  text: string
}

/** 只认 { type: 'dsp-blueprint:load', text: string }，其余消息忽略 */
export function readLoadMessage(data: unknown): LoadMessage | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (record.type !== LOAD_MESSAGE_TYPE) return null
  if (typeof record.text !== 'string') return null
  return { text: record.text }
}

export interface StartBridgeOptions {
  onText: (text: string) => BridgeResult | Promise<BridgeResult>
}

/**
 * 挂上 message 监听，并向宿主宣告就绪
 * @returns 解绑函数
 */
export function startBlueprintMessageBridge(options: StartBridgeOptions): () => void {
  let tail: Promise<unknown> = Promise.resolve()

  function onMessage(event: MessageEvent) {
    const data = event.data as Record<string, unknown> | null
    if (data?.type === REQUEST_READY_MESSAGE_TYPE) {
      const source = event.source as Window | null
      // 不透明来源（沙箱 iframe、file:// 页面）没法当 targetOrigin，只能写 *
      const targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*'
      try {
        source?.postMessage({ type: READY_MESSAGE_TYPE }, targetOrigin)
      } catch {
        /* 对方窗口已关闭时忽略 */
      }
      return
    }

    const message = readLoadMessage(event.data)
    if (!message) return

    const source = event.source as Window | null
    // 不透明来源（沙箱 iframe、file:// 页面）没法当 targetOrigin，只能写 *
    const targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*'

    // 串行处理：连续投递时，避免两条蓝图同时解析、互相覆盖
    tail = tail.then(async () => {
      let result: BridgeResult
      try {
        result = await options.onText(message.text)
      } catch (error) {
        result = { ok: false, message: (error as Error)?.message || String(error) }
      }
      try {
        // 只回给发消息的那个窗口
        source?.postMessage({ type: RESULT_MESSAGE_TYPE, ...result }, targetOrigin)
      } catch {
        /* 对方窗口已关闭时忽略 */
      }
    })
  }

  window.addEventListener('message', onMessage)
  announceReady()

  return () => window.removeEventListener('message', onMessage)
}

/** 告诉宿主可以投递了：opener（新标签页）与父窗口（iframe） */
function announceReady() {
  const message = { type: READY_MESSAGE_TYPE }
  const targets = [window.opener as Window | null, window.parent as Window | null]
  for (const target of targets) {
    if (!target || target === window) continue
    try {
      target.postMessage(message, '*')
    } catch {
      /* 跨域不可达时忽略 */
    }
  }
}
