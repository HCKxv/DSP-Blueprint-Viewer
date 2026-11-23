import { ITEM_DATA } from '../../data/items.js'

/** 标记表: 标记名 ↔ 图标 id ↔ 完整标记 */

/** 标记表里的一条 */
export interface TagInfo {
  /** 标记名（`tiek`，不带反斜杠和分号） */
  tag: string
  /** 图标 id（与图标文件名、蓝图头部的信号 id 同一口径） */
  id: number
  /** 显示名（物品 / 科技名） */
  name: string
}

/** 标记名 → 信息 */
const BY_NAME = new Map<string, TagInfo>()
/** id → 信息 */
const BY_ID = new Map<number, TagInfo>()

for (const { id, name, tag } of ITEM_DATA) {
  const info: TagInfo = { tag, id, name }
  BY_NAME.set(tag, info)
  BY_ID.set(id, info)
}

/** 标记名长度上限（文法按最长匹配从这么长往下试） */
export const TAG_MAX_LEN = ITEM_DATA.reduce((max, item) => Math.max(max, item.tag.length), 0)

/** 标记名 → 信息；不在表里给 null */
export function tagInfoOfName(tag: string): TagInfo | null {
  return BY_NAME.get(tag) ?? null
}

/** 图标 id → 信息；这个 id 没有标记时给 null */
export function tagInfoOf(itemId: number): TagInfo | null {
  return BY_ID.get(itemId) ?? null
}

/** 图标 id → 完整标记 `\tiek;`（这个 id 没有标记时给空串） */
export function iconMarkupOf(itemId: number): string {
  const name = BY_ID.get(itemId)?.tag
  return name ? `\\${name};` : ''
}
