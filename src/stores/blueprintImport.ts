/** 蓝图文本的统一导入入口 */
import { activeTool } from './tool'
import { loadBlueprintText } from './factory'
import { parseBlueprint, store } from './preview'
import { show } from './toast'
import {
  FACTORY_BLUEPRINT_PREFIX,
  SPHERE_BLUEPRINT_PREFIX,
} from '../blueprint/codec.js'

/** 蓝图种类 */
export type BlueprintKind = 'sphere' | 'factory'

/** 蓝图的开头标记 */
const PREFIXES: ReadonlyArray<{ prefix: string, kind: BlueprintKind }> = [
  { prefix: SPHERE_BLUEPRINT_PREFIX, kind: 'sphere' },
  { prefix: FACTORY_BLUEPRINT_PREFIX, kind: 'factory' },
]

/** 按开头标记判断蓝图种类；不是蓝图文本时返回 null */
function detectBlueprintKind(text: string): BlueprintKind | null {
  const value = (text || '').trim()
  const matched = PREFIXES.find(({ prefix }) => value.startsWith(prefix))
  return matched ? matched.kind : null
}

export interface ImportResult {
  ok: boolean
  message: string
  /** 识别出的蓝图种类；内容不合法时为空 */
  kind?: BlueprintKind
}

/**
 * 导入蓝图文本；种类按开头标记判断
 * @param raw 蓝图原文（`DYBP:` 或 `BLUEPRINT:` 开头）
 */
export async function applyBlueprintText(raw: string): Promise<ImportResult> {
  const text = (raw || '').trim()
  if (!text) {
    const message = '蓝图内容是空的'
    show(`加载蓝图失败：\n${message}`)
    return { ok: false, message }
  }

  const type = detectBlueprintKind(text)
  if (!type) {
    const message = '内容不是有效的蓝图代码'
    show(`加载蓝图失败：\n${message}`)
    return { ok: false, message }
  }

  if (type === 'factory') {
    activeTool.value = 'factory'
    const res = await loadBlueprintText(text)
    show(res.ok ? res.message : `加载蓝图失败：\n${res.message}`)
    return { ok: res.ok, message: res.message, kind: type }
  }

  activeTool.value = 'preview'
  store.input = text
  // 球体预览的「解析中 / 成功 / 失败」提示由 parseBlueprint 自己弹出
  await parseBlueprint()
  return store.errorMessage
    ? { ok: false, message: store.errorMessage, kind: type }
    : { ok: true, message: '成功解析蓝图', kind: type }
}
