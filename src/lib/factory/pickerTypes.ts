/**
 * 批量编辑的图标选择器类型注册表
 */
import { recipeName, recipeType } from '../blueprint/factory/factoryRecipes.js'
import { itemName } from '../blueprint/factory/factoryItems.js'
import { ICON_CATEGORIES } from '../markup/iconCatalog'
import { itemIconUrl } from '../markup/itemIcons'
import type { IconCategories, IconRef } from '../markup/itemIcons'
import { recipeCategoriesAll, recipeCategoriesOfType } from '../markup/recipeCatalog'

/** 配方图标 id = 20000 + 配方 id */
const RECIPE_ICON_BASE = 20000

/** 物品替换（物流塔物品 / 物品过滤）: 物品 + 建筑两类 */
const ITEM_CATEGORIES: IconCategories = (() => {
  const out: IconCategories = {}
  for (const name of ['物品', '建筑']) {
    const list = ICON_CATEGORIES[name]
    if (list) out[name] = list
  }
  return out
})()

/** 建筑 id → 浮窗里的一项 */
function buildingEntry(id: number): IconRef {
  return { id, name: itemName(id) || `#${id}` }
}

/** 可升降级的建筑 */
const UPGRADE_GROUPS = [
  { label: '传送带', items: [2001, 2002, 2003] },
  { label: '分拣器', items: [2011, 2012, 2013, 2014] },
  { label: '熔炉', items: [2302, 2315, 2319] },
  { label: '化工厂', items: [2309, 2317] },
  { label: '制造台', items: [2303, 2304, 2305, 2318] },
  { label: '研究站', items: [2901, 2902] },
]

/** 这栋建筑属于哪一组可升降级建筑；不在表里给 null */
function upgradeGroupOf(itemId: unknown) {
  const id = Number(itemId) || 0
  return UPGRADE_GROUPS.find((group) => group.items.includes(id)) ?? null
}

/** 可升降级建筑的浮窗选项 */
const UPGRADE_CATEGORIES: IconCategories = {
  可升降级建筑: UPGRADE_GROUPS.flatMap((group) => group.items.map(buildingEntry)),
}

/** 图标选择器类型: 一个注册 id 对应一套取值 / 列目录 / 图标映射 */
export interface PickerType {
  /** 注册 id，对应替换选项的 typeId */
  id: string
  /** 浮窗标题里的名词 */
  noun: string
  /** 浮窗里列哪些项 */
  categories: (values: Record<string, any>, field: 'from' | 'to') => IconCategories
  /** 图标项 → 存进 values 的值 */
  valueOf: (icon: IconRef) => number
  /** 值 → 图标 id */
  iconId: (value: number) => number
  /** 值 → 名字（图片 alt） */
  nameOf: (value: number) => string
  /** 换了「被替换」后，「替换为」是否还合法；不注册就永远合法 */
  toValid?: (from: unknown, to: number) => boolean
}

/** 图标选择器类型表: 新增图标类型只改这里 */
export const PICKER_TYPES: PickerType[] = [
  {
    id: 'recipe',
    noun: '配方',
    categories: (values, field) => (
      field === 'from'
        ? recipeCategoriesAll()
        : recipeCategoriesOfType(recipeType(Number(values.from) || 0))
    ),
    valueOf: (icon) => Number(icon?.recipeId) || 0,
    iconId: (value) => RECIPE_ICON_BASE + value,
    nameOf: (value) => recipeName(value) || `未知配方_${value}`,
    toValid: (from, to) => recipeType(to) === recipeType(Number(from) || 0),
  },
  {
    id: 'upgrade',
    noun: '建筑',
    categories: (values, field) => {
      if (field === 'from') return UPGRADE_CATEGORIES
      const group = upgradeGroupOf(values.from)
      return group ? { 可升降级建筑: group.items.map(buildingEntry) } : {}
    },
    valueOf: (icon) => Number(icon?.id) || 0,
    iconId: (value) => value,
    nameOf: (value) => itemName(value) || `未知物品_${value}`,
    toValid: (from, to) => !!upgradeGroupOf(from)?.items.includes(to),
  },
  {
    id: 'item',
    noun: '物品',
    categories: () => ITEM_CATEGORIES,
    valueOf: (icon) => Number(icon?.id) || 0,
    iconId: (value) => value,
    nameOf: (value) => itemName(value) || `未知物品_${value}`,
  },
]

/** 按 id 取图标选择器类型（没注册就是 undefined） */
export function pickerTypeOf(type: string): PickerType | undefined {
  return PICKER_TYPES.find((item) => item.id === type)
}

/** 格子里的图标地址: 按注册的图标选择器类型把值换成图标 id；0（没选）/ 没注册给空串 */
export function pickerIconUrl(type: string, value: unknown): string {
  const id = Number(value) || 0
  const pickerType = pickerTypeOf(type)
  if (!pickerType || id <= 0) return ''
  return itemIconUrl(pickerType.iconId(id))
}

/** 格子里的名字: 现在只用作图片的 alt；0（没选）/ 没注册给空串 */
export function pickerName(type: string, value: unknown): string {
  const id = Number(value) || 0
  const pickerType = pickerTypeOf(type)
  if (!pickerType || id <= 0) return ''
  return pickerType.nameOf(id)
}
