/**
 * toast — 全局提示条
 *
 * 用法: `import { show } from './toast'` → `show('...')`。
 * 提示条组件直接导入 message / visible / transitionEnabled。
 */
import { ref } from 'vue'

export const message = ref('')
export const visible = ref(false)
/** false 时瞬时隐藏（用于重播进入动画，见 show） */
export const transitionEnabled = ref(true)

let hideTimer: ReturnType<typeof setTimeout> | undefined

/** 显示一条提示，duration 毫秒后自动隐藏 */
export function show(text: string, duration = 3000) {
  if (hideTimer) clearTimeout(hideTimer)

  console.log(`[${new Date().toLocaleString()}] [toast]`, text)

  message.value = text

  if (visible.value) {
    // 当前正在显示时，先禁用过渡瞬时隐藏，
    // 下一帧恢复过渡并重新显示，从而重播进入动画
    transitionEnabled.value = false
    visible.value = false
    requestAnimationFrame(() => {
      transitionEnabled.value = true
      visible.value = true
    })
  } else {
    visible.value = true
  }

  hideTimer = setTimeout(() => {
    visible.value = false
  }, duration)
}
