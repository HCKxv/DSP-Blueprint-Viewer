import { RECIPE_DATA } from '../blueprint/factory/factoryRecipes.js'

/** 选择器里的一项 */
export interface IconRef {
  /** 图标 id */
  id: number
  /** 显示名 */
  name: string
  /** 图标标记 `\tiek;` */
  markup?: string
  /** 配方 id */
  recipeId?: number
}

/** 分类名 → 该类下的图标 */
export type IconCategories = Record<string, IconRef[]>

/** 图标索引: 图标 id → 图片 URL */
const files = import.meta.glob('../../assets/icons/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const ICONS: Record<number, string> = {}

for (const [path, url] of Object.entries(files)) {
  const id = Number(path.slice(path.lastIndexOf('/') + 1, -'.png'.length))
  if (Number.isInteger(id)) ICONS[id] = url
}

/** 配方图标 id = 20000 + 配方 id） */
const RECIPE_ICON_BASE = 20000

/** 配方图标 id → 主产物 id */
function recipeProductOf(iconId: number): number {
  if (iconId < RECIPE_ICON_BASE || iconId >= 40000) return 0
  return RECIPE_DATA[iconId - RECIPE_ICON_BASE]?.out?.[0]?.id ?? 0
}

/** 图标 URL；没有对应图标时返回空串（配方图标先查自带图标，没有就落到 RECIPE_DATA 的主产物图标） */
export function itemIconUrl(itemId: number): string {
  const url = ICONS[itemId]
  if (url) return url
  const product = recipeProductOf(itemId)
  return product ? (ICONS[product] ?? '') : ''
}

/** 已提取的全部图标 id（升序，图标选择器用） */
export const itemIconIds: number[] = Object.keys(ICONS)
  .map(Number)
  .sort((a, b) => a - b)
