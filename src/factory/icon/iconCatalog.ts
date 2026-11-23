import { itemIconIds } from './itemIcons.ts'
import { iconMarkupOf, tagInfoOf } from '../richText/itemTags.ts'
import {
  RECIPE_DATA,
  recipeData,
  recipeIdsOfType,
  recipeTypeOfBuilding,
} from '../../data/factoryRecipes.js'

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

// ── 图标库: 按 id 段分类 ──────────────────────────────────
/**
 * 信号 <1000、物品 1000~9999（建筑 2000~4999）、矿脉 12000~19999、配方 20000~39999、
 * 科技 40000~41999、升级 42000~59999）
 */
const CATEGORY_BANDS: { name: string, match: (id: number) => boolean }[] = [
  { name: '信号', match: (id) => id < 1000 },
  { name: '矿脉', match: (id) => id >= 12000 && id < 20000 },
  { name: '物品', match: (id) => id >= 1000 && id < 12000 },
  { name: '建筑', match: (id) => id >= 2000 && id < 5000 },
  { name: '配方', match: (id) => id >= 20000 && id < 40000 },
  { name: '科技', match: (id) => id >= 40000 && id < 42000 },
  { name: '升级', match: (id) => id >= 42000 && id < 60000 },
]

/** 某个图标属于哪个分类：按段位从后往前找 */
function categoryNameOf(id: number): string {
  for (let i = CATEGORY_BANDS.length - 1; i >= 0; i -= 1) {
    if (CATEGORY_BANDS[i].match(id)) return CATEGORY_BANDS[i].name
  }
  return ''
}

/** 图标分类清单: 按 id 段分（分类顺序同 CATEGORY_BANDS） */
export const ICON_CATEGORIES: IconCategories = (() => {
  const out: IconCategories = {}
  for (const band of CATEGORY_BANDS) out[band.name] = []
  for (const id of itemIconIds) {
    const name = categoryNameOf(id)
    if (!name) continue
    const hit = tagInfoOf(id)
    const markup = iconMarkupOf(id)
    out[name].push({
      id,
      name: hit?.name || `#${id}`,
      ...(markup ? { markup } : {}),
    })
  }
  return out
})()

/** 按分类名取图标；分类名不认识给空数组 */
export function filterIcons(category: string): IconRef[] {
  return ICON_CATEGORIES[category] ?? []
}

// ── 配方库: 按游戏配方选择窗的两个分类（物品 / 建筑）分组 ──────────────────────────

/** 选择窗里的页 → 分类名 */
const PAGE_NAMES: Record<number, string> = { 1: '物品', 2: '建筑' }

/** 一个配方项: 图标 id 取配方自己的 icon，名字取配方名，recipeId 供调用方直接用 */
function recipeEntry(recipeId: number): IconRef {
  const data = recipeData(recipeId)
  return {
    id: data?.icon ?? 0,
    name: data?.name || `#${recipeId}`,
    recipeId,
  }
}

/** 按游戏选择窗的页分组；单页的建筑只会得到一个分类（选择器那时不显示分类按钮） */
function groupByPage(recipeIds: number[]): IconCategories {
  const groups = new Map<number, IconRef[]>()
  for (const recipeId of recipeIds) {
    const page = recipeData(recipeId)?.page ?? 0
    const list = groups.get(page)
    if (list) list.push(recipeEntry(recipeId))
    else groups.set(page, [recipeEntry(recipeId)])
  }

  // 已知的两页按固定顺序在前，页号对不上的（改版 / MOD）排在后面
  const out: IconCategories = {}
  for (const page of [1, 2]) {
    const items = groups.get(page)
    if (items) {
      out[PAGE_NAMES[page]] = items
      groups.delete(page)
    }
  }
  for (const [page, items] of groups) out[`第 ${page} 页`] = items
  return out
}

/** 某类配方按选择窗的分页分组（类型是游戏 ERecipeType 的数值，见 RECIPE_TYPES） */
export function recipeCategoriesOfType(typeId: number): IconCategories {
  const ids = recipeIdsOfType(typeId)
  return ids.length ? groupByPage(ids) : {}
}

/** 全量配方 */
export function recipeCategoriesAll(): IconCategories {
  return groupByPage(Object.keys(RECIPE_DATA).map(Number))
}

/**
 * 这栋建筑能选的配方分类（按游戏的物品 / 建筑两分类；只有一类时选择器不显示分类按钮）。
 * 不指定配方的建筑（传送带等）给空对象。
 */
export function recipeCategoriesForBuilding(itemId: number): IconCategories {
  const typeId = recipeTypeOfBuilding(itemId)
  if (!typeId) return {}
  return recipeCategoriesOfType(typeId)
}
