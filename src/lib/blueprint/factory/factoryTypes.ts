/**
 * 工厂蓝图的数据类型
 */

/** 蓝图自定义属性 */
export interface FactoryProperty {
  /** 属性名 */
  key: string
  /** 属性值 */
  value: string
}

/** 蓝图头部 */
export interface FactoryHeader {
  /** 图标布局（0 / 1 = 不显示图标，取值见 FactoryThumb 的排布表） */
  layout: number
  /** 缩略图的 5 个图标位（0 = 空位） */
  icons: number[]
  /** 创建时间戳（.NET ticks） */
  timeTicks: string | null
  /** 创建时间（由创建时间戳换算） */
  time: string | null
  /** 创建版本号 */
  gameVersion: string
  /** 缩略图文字 */
  shortDesc: string
  /** 作者 */
  author: string
  /** 版本 */
  customVersion: string
  /** 自定义属性 */
  properties: FactoryProperty[]
  /** 蓝图介绍 */
  desc: string
}

/** 一份工厂蓝图对象 */
export type FactoryBlueprint = { header: FactoryHeader } & Record<string, any>
