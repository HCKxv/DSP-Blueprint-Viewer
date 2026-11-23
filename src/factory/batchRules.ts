/**
 * 批量编辑: 规则模型、规则类型表、图标选择器类型表
 */
import type { FactoryBlueprint } from '../blueprint/factory/factoryTypes'
import { batchUp, changeRectType, editAutoOrbit, editFilter, editRecipe, editStationItems, horizontalOffset, verticalOffset } from './blueprintEdit.js'
import { recipeData } from '../data/factoryRecipes.js'
import { itemName } from '../blueprint/factory/factoryItems.js'
import { ICON_CATEGORIES, recipeCategoriesAll, recipeCategoriesOfType } from './icon/iconCatalog'
import { itemIconUrl } from './icon/itemIcons'
import type { IconCategories, IconRef } from './icon/iconCatalog'

/* ── 规则模型 ─────────────────────────────────────────────── */

/** 批量编辑下拉里的一项 */
export interface BatchRuleSelectItem {
  /** 写回 rule.values 的值 */
  value: string | number
  /** 下拉里显示的文字 */
  label: string
}

/** 批量编辑规则的一个选项: 替换（两格图标）/ 下拉 / 数字输入框 */
export type BatchRuleOption =
  | {
      kind: 'replace'
      /** 图标选择器类型 id（recipe / upgrade / item） */
      typeId: string
    }
  | {
      kind: 'select'
      /** 要改 rule.values 的哪个字段 */
      field: string
      /** 下拉前面的说明 */
      label?: string
      /** 下拉项 */
      items: BatchRuleSelectItem[]
    }
  | {
      kind: 'number'
      /** 要改 rule.values 的哪个字段 */
      field: string
      /** 输入框前面的说明 */
      label?: string
      /** 输入框后面的单位（如 层） */
      unit?: string
    }

/** 规则行里的下拉选项 */
export type BatchRuleSelect = Extract<BatchRuleOption, { kind: 'select' }>

/** 规则行里的数字输入框选项 */
export type BatchRuleNumber = Extract<BatchRuleOption, { kind: 'number' }>

/** 一条批量编辑规则 */
export interface BatchRule {
  type: string
  /** 规则行的选项（createRule 从规则类型表带进来） */
  options: BatchRuleOption[]
  /** 规则的可编辑值 */
  values: Record<string, any>
  run: (blueprint: FactoryBlueprint) => any
}

/** 一条规则类型: 记录选项、生成初始值、把规则作用到蓝图 */
export interface BatchRuleType {
  id: string
  /** 菜单 / 列表里的名字 */
  label: string
  /** 规则行里的补充说明（一个选项都没有时显示） */
  hint?: string
  /** 选项: 替换 / 下拉 / 数字，按顺序画 */
  options: BatchRuleOption[]
  /** 新规则的初始值 */
  values: () => Record<string, any>
  /** 把规则作用到蓝图上 */
  run: (blueprint: FactoryBlueprint, values: Record<string, any>) => any
}

/**
 * 按规则类型生成一条规则
 *
 * 选项表和初始值都编译进规则；run 只接 blueprint，界面上改 rule.values 改的就是闭包捕获的这一份。
 */
export function createRule(type: BatchRuleType): BatchRule {
  const values = type.values()
  // 下拉没给初始值时用第一项兜底，数字没给初始值时按 0 兜底，
  // 保证显示的和规则真正用的是同一个值
  for (const option of type.options) {
    if (option.kind === 'select' && values[option.field] === undefined) {
      values[option.field] = option.items[0]?.value
    }
    if (option.kind === 'number' && values[option.field] === undefined) {
      values[option.field] = 0
    }
  }
  return {
    type: type.id,
    options: [...type.options],
    values,
    run: (blueprint: FactoryBlueprint) => type.run(blueprint, values),
  }
}

/* ── 规则类型表 ──────────────────────────────────────────── */

/** 批量编辑的规则类型表 */
export const BATCH_RULE_TYPES: BatchRuleType[] = [
  {
    id: 'upgrade',
    label: '升降级建筑',
    options: [{ kind: 'replace', typeId: 'upgrade' }],
    values: () => ({ from: 0, to: 0 }),
    run: (blueprint, values) => batchUp(blueprint, values.from, values.to),
  },
  {
    id: 'recipe',
    label: '替换配方',
    options: [
      { kind: 'replace', typeId: 'recipe' },
      {
        kind: 'select',
        field: 'acceleratorMode',
        label: '增产模式',
        items: [
          { value: -1, label: '不修改' },
          { value: 0, label: '额外产出' },
          { value: 1, label: '生产加速' },
        ],
      },
    ],
    values: () => ({ from: 0, to: 0, acceleratorMode: -1 }),
    run: (blueprint, values) => editRecipe(blueprint, values.from, values.to, values.acceleratorMode),
  },
  {
    id: 'stationItem',
    label: '替换物流塔物品',
    options: [{ kind: 'replace', typeId: 'item' }],
    values: () => ({ from: 0, to: 0 }),
    run: (blueprint, values) => editStationItems(blueprint, values.from, values.to),
  },
  {
    id: 'filter',
    label: '替换物品过滤',
    options: [
      { kind: 'replace', typeId: 'item' },
      {
        kind: 'select',
        field: 'target',
        label: '类型',
        items: [
          { value: '全部', label: '全部' },
          { value: '分拣器', label: '分拣器' },
          { value: '四向', label: '四向' },
          { value: '配送器', label: '配送器' },
        ],
      },
    ],
    values: () => ({ from: 0, to: 0, target: '分拣器' }),
    run: (blueprint, values) => editFilter(blueprint, values.from, values.to, values.target),
  },
  {
    id: 'rectType',
    label: '修改地基装饰',
    options: [
      {
        kind: 'select',
        field: 'type',
        items: [
          { value: 1, label: '默认' },
          { value: 2, label: '网格' },
          { value: 3, label: '轨道' },
          { value: 4, label: '小方格' },
          { value: 6, label: '黑边网格' },
          { value: 7, label: '无装饰' },
        ],
      },
    ],
    values: () => ({ type: 1 }),
    run: (blueprint, values) => changeRectType(blueprint, values.type),
  },
  {
    id: 'autoOrbit',
    label: '自动轨道弹射',
    hint: '全部电磁轨道弹射器',
    options: [],
    values: () => ({}),
    run: (blueprint) => editAutoOrbit(blueprint),
  },
]

import { experimentalFeatures } from '../stores/tool.js'
if (experimentalFeatures) {
  const a: BatchRuleType[] = [
    {
      id: 'horizontalOffset',
      label: '水平偏移',
      options: [
        {
          kind: 'number',
          field: 'offsetX',
          label: '横向',
        },
        {
          kind: 'number',
          field: 'offsetY',
          label: '纵向',
        }
      ],
      values: () => ({offsetX:0.5, offsetY:0.5}),
      run: (blueprint, values) => horizontalOffset(blueprint, values.offsetX, values.offsetY),
    },
    {
      id: 'verticalOffset',
      label: '垂直偏移',
      hint: '只会作用于可悬空的蓝图',
      options: [
        {
          kind: 'number',
          field: 'offsetZ',
          label: '偏移',
        }
      ],
      values: () => ({offsetZ:0}),
      run: (blueprint, values) => verticalOffset(blueprint, values.offsetZ),
    }
  ]
  BATCH_RULE_TYPES.push(...a)
}

/** 按 id 取规则类型 */
export function ruleTypeOf(type: string): BatchRuleType | undefined {
  return BATCH_RULE_TYPES.find((item) => item.id === type)
}

/** 规则类型的中文名 */
export function labelOf(type: string): string {
  return ruleTypeOf(type)?.label ?? type
}

/** 规则行里的补充说明 */
export function hintOf(type: string): string {
  return ruleTypeOf(type)?.hint ?? ''
}

/** 规则行里有没有替换格 */
export function hasReplace(rule: BatchRule): boolean {
  return rule.options.some((option) => option.kind === 'replace')
}

/* ── 图标选择器类型表 ────────────────────────────────────── */

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
        : recipeCategoriesOfType(recipeData(Number(values.from) || 0)?.type ?? 0)
    ),
    valueOf: (icon) => Number(icon?.recipeId) || 0,
    iconId: (value) => recipeData(value)?.icon ?? 0,
    nameOf: (value) => recipeData(value)?.name || `未知配方_${value}`,
    toValid: (from, to) => (recipeData(to)?.type ?? 0) === (recipeData(Number(from) || 0)?.type ?? 0),
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
