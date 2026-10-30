/**
 * 批量编辑的规则模型与注册表
 */
import type { FactoryBlueprint } from '../blueprint/factory/factoryTypes'
import { batchUp, changeRectType, editAutoOrbit, editFilter, editRecipe, editStationItems } from './batchEdit.js'

/** 批量编辑下拉里的一项 */
export interface BatchRuleSelectItem {
  /** 写回 rule.values 的值 */
  value: string | number
  /** 下拉里显示的文字 */
  label: string
}

/** 批量编辑规则的一个选项: 替换（两格图标）/ 下拉 */
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

/** 规则行里的下拉选项 */
export type BatchRuleSelect = Extract<BatchRuleOption, { kind: 'select' }>

/** 一条批量编辑规则 */
export interface BatchRule {
  type: string
  /** 规则行的选项（createRule 从规则类型表带进来） */
  options: BatchRuleOption[]
  /** 规则的可编辑值 */
  values: Record<string, any>
  run: (blueprint: FactoryBlueprint) => boolean
}

/** 一条规则类型: 记录选项、生成初始值、把规则作用到蓝图 */
export interface BatchRuleType {
  id: string
  /** 菜单 / 列表里的名字 */
  label: string
  /** 规则行里的补充说明（一个选项都没有时显示） */
  hint?: string
  /** 选项: 替换 / 下拉，按顺序画 */
  options: BatchRuleOption[]
  /** 新规则的初始值 */
  values: () => Record<string, any>
  /** 把规则作用到蓝图上 */
  run: (blueprint: FactoryBlueprint, values: Record<string, any>) => boolean
}

/**
 * 按规则类型生成一条规则
 *
 * 选项表和初始值都编译进规则；run 只接 blueprint，界面上改 rule.values 改的就是闭包捕获的这一份。
 */
export function createRule(type: BatchRuleType): BatchRule {
  const values = type.values()
  // 下拉没给初始值时用第一项兜底，保证显示的和规则真正用的是同一个值
  for (const option of type.options) {
    if (option.kind === 'select' && values[option.field] === undefined) {
      values[option.field] = option.items[0]?.value
    }
  }
  return {
    type: type.id,
    options: [...type.options],
    values,
    run: (blueprint: FactoryBlueprint) => type.run(blueprint, values),
  }
}

/** 批量编辑的规则类型表 */
export const BATCH_RULE_TYPES: BatchRuleType[] = [
  {
    id: 'upgrade',
    label: '升降级建筑',
    options: [{ kind: 'replace', typeId: 'upgrade' }],
    values: () => ({ from: 0, to: 0 }),
    run: batchUp,
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
    run: editRecipe,
  },
  {
    id: 'stationItem',
    label: '修改物流塔物品',
    options: [{ kind: 'replace', typeId: 'item' }],
    values: () => ({ from: 0, to: 0 }),
    run: editStationItems,
  },
  {
    id: 'filter',
    label: '修改物品过滤',
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
    run: editFilter,
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
    run: editAutoOrbit,
  },
]

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
