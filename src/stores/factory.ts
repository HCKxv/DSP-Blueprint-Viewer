import { computed, markRaw, reactive, ref, watch } from 'vue'
import { parseBlueprintString } from '../blueprint/factory/factoryParser.js'
import { stringifyBlueprint } from '../blueprint/factory/factoryEncoder.js'
import { itemName } from '../blueprint/factory/factoryItems.js'
import * as blueprintEdit from '../factory/blueprintEdit.js'
import { 新建统计设置, 统计蓝图, 计算包含设施, 计算设施数量, 计算包含地基 } from '../factory/stats.js';
import type { FactoryPreview } from '../factory/preview/FactoryPreview.js'
import type { FactoryBlueprint, FactoryHeader } from '../blueprint/factory/factoryTypes'
import type { BatchRule } from '../factory/batchRules'
import { saveAsText } from '../utils/download'
import { cloneData } from '../utils/clonePlain.js';

/** 工厂预览工具的状态 */

/** 蓝图统计设置，见 factory/stats.js */
export interface StatsSettings {
  /** 增产剂: 0 = 不用, 1141 = Mk.I, 1142 = Mk.II, 1143 = Mk.III */
  使用增产剂: number
  /** 透镜: 0 = 不用, 1209 = 引力透镜, 1211 = 黑雾透镜 */
  使用透镜: number
  /** 质能燃料（人造恒星）: 1803 = 反物质燃料棒, 1804 = 奇异湮灭燃料棒 */
  使用质能燃料: number
  使用化学燃料: number
}

export const factory = reactive({
  /** 正在解析 */
  parsing: false,
  /** 完整蓝图数据 */
  blueprint: null as FactoryBlueprint | null,
  /** 头部: 用于显示和编辑 */
  header: reactive(emptyHeader()),
  /** 预览里选中的建筑编号（building.index），没选中 = null */
  selectedIndex: null as number | null,
  /** 当前蓝图对应的原文件句柄（File System Access API） */
  fileHandle: null as FileSystemFileHandle | null,
  /** 原始蓝图字符串 */
  raw: '',
  /** 主体改过没有 */
  modified: false,
  /** 蓝图统计结果 */
  stats: markRaw(统计蓝图(null)),
  /** 统计设置 */
  statsSettings: 新建统计设置() satisfies StatsSettings,
})

/** 「打开蓝图」弹窗 */
export const showOpenModal = ref(false)

/** 批量编辑的规则数组（规则类型表见 factory/batchRules.ts） */
export const batchRules = ref<BatchRule[]>([])

/** 左侧输入栏的四档: 信息 / 详情 / 统计 / 批量编辑 */
export type FactoryViewId = 'info' | 'detail' | 'stats' | 'batch'

/** 当前显示的档位 */
export const factoryView = ref<FactoryViewId>('info')

// 选中 / 取消选中时自动切
watch(() => factory.selectedIndex, (index) => {
  if (index !== null) {
    factoryView.value = 'detail'
    return
  }
  if (factoryView.value === 'detail') factoryView.value = 'info'
})

/** 3D 预览实例 */
let preview: FactoryPreview | null = null

/** 挂上 / 摘掉预览实例 */
export function attachPreview(instance: FactoryPreview | null) {
  preview = instance
  if (!preview) {
    factory.selectedIndex = null   // 场景没了，选中也就不存在了
    return
  }
  preview.setSelectionListener((index) => { factory.selectedIndex = index })
  preview.setBlueprint(factory.blueprint);
}

// 选中编号同步给场景
watch(() => factory.selectedIndex, (index) => {
  preview?.selectBuilding(index)
})

/**
 * 统计蓝图() 的返回值里，自动判断设置要用到的部分
 */
interface StatsResult {
  配方详情: Map<number, unknown>
  物流详情: Map<number, Record<string, { 输入: boolean; 输出: boolean }>>
}

/**
 * 自动判断设置
 *
 * @param stats 统计蓝图() 的返回值
 */
function detectStatsSettings(stats: StatsResult): StatsSettings {
  const hasRecipe = (recipeId: number) => stats.配方详情.has(recipeId)
  const hasLogisticsInput = (itemId: number) => {
    const logistics = stats.物流详情.get(itemId)
    return !!logistics && Object.values(logistics).some((row) => row.输入)
  }

  const settings: StatsSettings = 新建统计设置()

  settings.使用增产剂 = hasRecipe(108) || hasLogisticsInput(1143) ? 1143 : 0

  if (hasRecipe(162) || hasLogisticsInput(1211)) settings.使用透镜 = 1211
  else if (hasRecipe(101) || hasLogisticsInput(1209)) settings.使用透镜 = 1209
  else settings.使用透镜 = 0

  settings.使用质能燃料 = hasRecipe(156) || hasLogisticsInput(1804) ? 1804 : 1803

  return settings
}

/**
 * 换一份蓝图 → 让预览重摆（「蓝图 → 场景」只有这一个出口）
 *
 * @param blueprint 新蓝图
 * @param resetView 视角要不要归位
 */
function applyBlueprint(blueprint: FactoryBlueprint | null, resetView: boolean = true) {
  const selected = factory.selectedIndex

  factory.blueprint = blueprint ? markRaw({ ...blueprint }) : null
  factory.stats = markRaw(统计蓝图(factory.blueprint))
  factory.statsSettings = detectStatsSettings(factory.stats)
  preview?.setBlueprint(factory.blueprint, resetView)

  if (selected !== null && !resetView) {
    // 编号没变 → 上面那个 watch 不会触发，选中得自己送进场景
    factory.selectedIndex = selected
    preview?.selectBuilding(selected)
  }
}

/** 空白蓝图头部 */
function emptyHeader(): FactoryHeader {
  return {
    layout: 1,
    icons: [0, 0, 0, 0, 0],
    timeTicks: null,
    time: null,
    gameVersion: '',
    shortDesc: '',
    author: '',
    customVersion: '',
    properties: [],
    desc: '',
  }
}

/**
 * 换一份蓝图
 * @param parsed parseBlueprintString 的结果；null = 关闭蓝图
 * @param raw 原始蓝图字符串
 */
function setBlueprint(parsed: Record<string, any> | null, raw = '') {
  factory.selectedIndex = null     // 编号是蓝图内部的序号，换蓝图重新开始
  factory.raw = parsed ? raw : ''
  factory.modified = false
  factoryView.value = 'info'
  if (!parsed) {
    applyBlueprint(null)
    Object.assign(factory.header, emptyHeader())
    return
  }

  applyBlueprint(structuredClone(parsed) as FactoryBlueprint)
  // 用于界面显示与编辑
  Object.assign(factory.header, cloneData(factory.blueprint!.header))
}

// ─────────────────────────────────────────────────────────────
// 派生数据
// ─────────────────────────────────────────────────────────────

/** 是否已经打开蓝图 */
export const hasBlueprint = computed(() => !!factory.blueprint)

/** 蓝图存放路径: 原文件名（句柄给的），没有句柄（粘贴导入）就是「导入的蓝图」 */
export const pathText = computed(() => {
  if (!hasBlueprint.value) return ''
  return factory.fileHandle?.name || '导入的蓝图'
})

/** 包含的设施（建筑 + 地基） */
export const facilities = computed(() => 计算包含设施(factory.stats))
/** 设施数量 */
export const buildingCount = computed(() => 计算设施数量(factory.stats))
/** 包含的地基: { 总数, 带装饰, 无装饰 } */
export const foundation = computed(() => 计算包含地基(factory.stats))

/**
 * 当前选中的建筑:编号对不上蓝图里的建筑就当没选中
 */
export const selectedBuilding = computed(() => {
  const buildings = factory.blueprint?.buildings
  const index = factory.selectedIndex
  if (!Array.isArray(buildings) || index === null) return null
  // 序号就是下标: 取回来核一下序号，对不上（越界也是 undefined）当没选中
  const building = buildings[index]
  return building && Number(building.index) === index ? building : null
})

/** 选中建筑的坐标（格） */
export const selectedBuildingCoord = computed(() => {
  const index = factory.selectedIndex
  if (index === null || !factory.blueprint) return null
  return preview?.buildingCoord(index) ?? null
})

/** 选中建筑第二个端点的坐标（格）: 分拣器 = 爪臂末端，其余建筑与第一个端点相同 */
export const selectedBuildingEndCoord = computed(() => {
  const index = factory.selectedIndex
  if (index === null || !factory.blueprint) return null
  return preview?.buildingEndCoord(index) ?? null
})

// ─────────────────────────────────────────────────────────────
// 各项上限
// ─────────────────────────────────────────────────────────────

/**
 * 界面上各项的上限，
 * 输入框会按它把超出的输入吞掉
 */
export const LIMITS = {
  /** 缩略图文字 */
  shortDesc: 60,
  /** 作者 */
  author: 60,
  /** 版本 */
  customVersion: 20,
  /** 蓝图介绍 */
  desc: 2000,
  /** 属性条数 */
  properties: 20,
  /** 属性名 */
  propertyKey: 40,
  /** 属性值（本地 414 份蓝图里最长的正好 60） */
  propertyValue: 60,
} as const

/** 有没有未保存的改动 */
export const hasChanges = computed(() => {
  if (factory.modified) return true
  const saved = factory.blueprint?.header
  return !!saved && JSON.stringify(factory.header) !== JSON.stringify(saved)
})

// ─────────────────────────────────────────────────────────────
// 动作
// ─────────────────────────────────────────────────────────────

/** 打开「打开蓝图」弹窗 */
export function openBlueprintModal() {
  showOpenModal.value = true
}

/** 关闭「打开蓝图」弹窗 */
export function closeBlueprintModal() {
  showOpenModal.value = false
}

/** 记录原文件句柄；markRaw: 代理后调它的方法（createWritable…）会报 Illegal invocation */
function setFileHandle(handle: FileSystemFileHandle | null) {
  factory.fileHandle = handle ? markRaw(handle) : null
}

/** 导入蓝图字符串；handle 是来源文件句柄（粘贴导入留空），解析失败就不动它 */
export async function loadBlueprintText(
  raw: string,
  handle: FileSystemFileHandle | null = null,
): Promise<{ ok: boolean, message: string }> {
  const value = (raw || '').trim()
  if (!value) return { ok: false, message: '蓝图内容是空的' }

  factory.parsing = true
  try {
    const parsed = await parseBlueprintString(value)
    setBlueprint(parsed, value)
    setFileHandle(handle)
    return { ok: true, message: handle ? `已打开蓝图：${handle.name}` : '已打开导入的蓝图' }
  } catch (error) {
    return { ok: false, message: `无法解析蓝图：${(error as Error).message}` }
  } finally {
    factory.parsing = false
  }
}

/** 导入蓝图文件（.txt）；有句柄就给句柄，只拿得到 File（浏览器没有那个 API）就给 File */
export async function loadBlueprintFile(
  source: File | FileSystemFileHandle,
): Promise<{ ok: boolean, message: string }> {
  const handle = source instanceof File ? null : source
  let content: string
  try {
    const file = source instanceof File ? source : await source.getFile()
    content = await file.text()
  } catch {
    return { ok: false, message: '读取文件失败' }
  }
  return loadBlueprintText(content, handle)
}

/** 关闭蓝图: 清空当前蓝图与信息 */
export function closeBlueprint() {
  factory.parsing = false
  setFileHandle(null)
  setBlueprint(null)
}

// ─────────────────────────────────────────────────────────────
// 编辑建筑 / 还原
// ─────────────────────────────────────────────────────────────

export interface BuildingChanges {
  /** 建筑 id */
  itemId?: number
  /** 模型序号 */
  modelIndex?: number
  /** 配方 id） */
  recipeId?: number
  /** 筛选物品 id */
  filterId?: number
  /** 建筑参数 */
  parameters?: Record<string, any>
  /** 建筑备注 */
  content?: string | null
  /** 局部坐标（格）: [第一端点, 第二端点] */
  localOffset?: Array<{ x: number, y: number, z: number }>
}

/** 研究站所在的那一叠有几栋；不是研究站 = 0 */
export function labStackCount(index: number): number {
  return blueprintEdit.labGroup(factory.blueprint, index).size
}

/** 改完蓝图: 统计跟着重算、预览重摆、记上「已修改」 */
function commitEdit(blueprint: FactoryBlueprint) {
  applyBlueprint(blueprint, false)
  factory.modified = true
}

/**
 * 改一栋建筑（研究站 = 连着的整叠一起改）
 * @returns 找到了并改上了 true；蓝图没打开 / 编号对不上 false
 */
export function updateBuilding(index: number, changes: BuildingChanges): boolean {
  const blueprint = factory.blueprint
  const building = blueprint?.buildings?.[index]
  if (!blueprint || !building || Number(building.index) !== index) return false
  blueprintEdit.editBuilding(blueprint, index, changes)
  commitEdit(blueprint)
  return true
}

/**
 * 替换物流塔: 行星内物流运输站（2103）↔ 星际物流运输站（2104）
 *
 * @param index 建筑编号
 * @param dropSlot 降回行星内时丢弃第几个物品栏位（1-5）；不给就丢最后一个
 */
export function convertStationType(index: number, dropSlot: number | null = null): boolean {
  const blueprint = factory.blueprint
  const building = blueprint?.buildings?.[index]
  if (!blueprint || !building || Number(building.index) !== index) return false
  blueprintEdit.editStationType(blueprint, index, dropSlot)
  commitEdit(blueprint)
  return true
}

/** 反转分拣器: 交换抓取端和放下端 */
export function flipInserter(index: number): boolean {
  const blueprint = factory.blueprint
  const building = blueprint?.buildings?.[index]
  if (!blueprint || !building || Number(building.index) !== index) return false
  blueprintEdit.reverseInserter(blueprint, index)
  commitEdit(blueprint)
  return true
}

/**
 * 剔除一类设施（信息栏里右键图标）
 *
 * 同 itemId 的建筑全部打上 -1 墓碑（统计 / 预览都不再算它，导出时由 compactBuildings 压实）；
 * 1131（地基）不占 buildings，连铺好的地基一起清掉。
 */
export function discardFacility(itemId: number): { ok: boolean, message: string } {
  const blueprint = factory.blueprint
  if (!blueprint || !Array.isArray(blueprint.buildings)) {
    return { ok: false, message: '当前没有已打开的蓝图' }
  }

  const id = Number(itemId) || 0
  // 用界面上显示的数量
  const count = facilities.value.find((item) => item.id === id)?.数量 ?? 0
  if (count <= 0) return { ok: false, message: '蓝图里没有这项设施' }

  blueprintEdit.discardBuildings(blueprint, id)

  // 正好删掉的是选中那栋 → 先松开选中，免得预览再去选一座墓碑
  const selected = factory.selectedIndex
  if (selected !== null && Number(blueprint.buildings[selected]?.itemId) === id) factory.selectedIndex = null

  commitEdit(blueprint)
  return { ok: true, message: `已剔除${itemName(id)}` }
}

/** 地基的两类（与 stats.js 的 计算包含地基 一致） */
export type FoundationKind = 'decal' | 'undecal'

/**
 * 剔除一类地基（信息栏里右键地基图标）
 *
 * @param kind 带装饰 / 无装饰
 */
export function discardFoundation(kind: FoundationKind): { ok: boolean, message: string } {
  const blueprint = factory.blueprint
  if (!blueprint || !Array.isArray(blueprint.reformData?.rects)) {
    return { ok: false, message: '当前蓝图没有地基' }
  }

  const undecal = kind === 'undecal'
  const label = undecal ? '无装饰' : '带装饰'
  // 用界面上显示的数量
  const count = undecal ? foundation.value.无装饰 : foundation.value.带装饰
  if (count <= 0) return { ok: false, message: `蓝图里没有${label}地基` }

  blueprintEdit.discardRects(blueprint, kind)

  commitEdit(blueprint)
  return { ok: true, message: `已剔除${label}地基` }
}

/**
 * 删除一栋建筑（详情页的「删除建筑」）
 *
 * @param index 建筑编号
 * @returns 找到了并删掉了 true；蓝图没打开 / 编号对不上 false
 */
export function deleteBuilding(index: number): boolean {
  const blueprint = factory.blueprint
  const buildings = blueprint?.buildings
  if (!blueprint || !Array.isArray(buildings)) return false

  // 序号就是下标，对不上（坏数据 / 已经删掉的墓碑）就不动手
  const building = buildings[index]
  if (!building || Number(building.index) !== index) return false

  buildings[index] = { ...building, index: -1 }
  factory.selectedIndex = null

  commitEdit(blueprint)
  return true
}

/**
 * 批量编辑: 把规则数组（batchRules）作用到当前蓝图上
 *
 * @returns ok=false 时 message 说明原因，规则数组保持原样
 */
export function applyBatchEdit(): {
  ok: boolean
  message: string
} {
  const blueprint = factory.blueprint
  if (!blueprint || !Array.isArray(blueprint.buildings)) {
    return { ok: false, message: '当前没有已打开的蓝图' }
  }

  for (const rule of batchRules.value) {
    if (typeof rule?.run !== 'function') continue
    rule.run(blueprint)
  }

  commitEdit(blueprint)                       // 预览按新数据重摆
  batchRules.value = []                       // 提交完就清空规则数组
  return { ok: true, message: '' }
}

/**
 * 还原修改
 * @returns ok=false 时 message 说明原因
 */
export async function revertBlueprint(): Promise<{ ok: boolean, message: string }> {
  const raw = factory.raw
  if (!hasBlueprint.value) return { ok: false, message: '当前没有已打开的蓝图' }
  if (!raw) return { ok: false, message: '没有可还原的原始蓝图' }

  factory.parsing = true
  try {
    const parsed = await parseBlueprintString(raw)
    setBlueprint(parsed, raw)
    return { ok: true, message: '已还原到上次打开 / 保存的样子' }
  } catch (error) {
    return { ok: false, message: `无法还原：${(error as Error).message}` }
  } finally {
    factory.parsing = false
  }
}

// ─────────────────────────────────────────────────────────────
// 复制 / 保存
// ─────────────────────────────────────────────────────────────

/** 把当前内容编码回蓝图字符串 */
async function serialize(): Promise<{ text: string, error: string }> {
  const blueprint = factory.blueprint
  if (!blueprint) return { text: '', error: '当前没有已打开的蓝图' }
  try {
    // 导出前把删除留下的 -1 墓碑压实，游戏只认 index 与数组下标一致的蓝图。
    const exportBlueprint = cloneData({ ...blueprint, header: factory.header })
    blueprintEdit.compactBuildings(exportBlueprint)
    return { text: await stringifyBlueprint(exportBlueprint), error: '' }
  } catch (error) {
    return { text: '', error: (error as Error).message }
  }
}

/** 复制蓝图到剪贴板 */
export async function copyBlueprint(): Promise<{ ok: boolean, message: string }> {
  const { text, error } = await serialize()
  if (error) return { ok: false, message: error }
  try {
    await navigator.clipboard.writeText(text)
    return { ok: true, message: '已复制蓝图到剪贴板' }
  } catch (err) {
    return { ok: false, message: `复制蓝图失败：${(err as Error).message}` }
  }
}

/**
 * 保存蓝图到文件: ，默认开在原文件所在目录（没有原文件就文档文件夹），
 * 保存成功后记住新句柄；没有那个 API 的浏览器退化成下载，取消不算失败（message 为空）
 */
export async function saveBlueprintFile(): Promise<{ ok: boolean, message: string }> {
  const { text, error } = await serialize()
  if (error) return { ok: false, message: error }

  const handle = factory.fileHandle

  const saved = await saveAsText(text, {
    suggestedName: handle?.name || '蓝图.txt',
    // 打开过文件就把对话框开在原文件所在目录（startIn 接受文件句柄）；没有就开在文档文件夹
    startIn: handle ?? 'documents',
    types: [{ description: '蓝图文件', accept: { 'text/plain': ['.txt'] } }],
  })
  if (saved.error) return { ok: false, message: `保存失败：${saved.error}` }
  if (saved.canceled) return { ok: true, message: '' } // 取消保存不算失败

  markSaved(saved.handle, text)
  return saved.handle
    ? { ok: true, message: `已保存到 ${saved.handle.name}` }
    : { ok: true, message: '这个浏览器不能直接写文件，已改为下载' }
}

/** 保存成功后把刚写出去的内容当成新基准，「已修改」跟着清掉 */
function markSaved(handle: FileSystemFileHandle | null, text: string) {
  const blueprint = factory.blueprint
  // 只换了头部，建筑没动 → 不归位视角
  if (blueprint) applyBlueprint({ ...blueprint, header: cloneData(factory.header) }, false)
  factory.raw = text
  factory.modified = false
  setFileHandle(handle)
}
