import type { PluginUiModule } from '@eden/api'
import type { WorkbenchDocument } from './workbench-state'

export type PluginSlot = PluginUiModule['document']['views'][number]['slot']
export const pluginSlots: readonly PluginSlot[] = ['page','sidebar_panel','tool_card','full_page','bottom_panel','floating_window']
export const pluginSlotTitles: Record<PluginSlot,string>={page:'工作区页面',sidebar_panel:'工具侧栏',tool_card:'工具卡片',full_page:'独占页面',bottom_panel:'工具面板',floating_window:'浮动窗口'}
export function fixedPluginGroup(slot?: PluginSlot) {
  if(slot==='sidebar_panel')return 'auxiliary'
  if(slot==='bottom_panel')return 'panel'
  if(slot==='full_page')return 'application'
  if(slot==='floating_window')return 'floating'
  return undefined
}
export function canPlaceDocument(tab: WorkbenchDocument, group: string) {
  const fixed=tab.kind==='plugin'?fixedPluginGroup(tab.slot):undefined
  return fixed ? group===fixed : group!=='application'&&group!=='floating'
}
export function movableDocument(tab: WorkbenchDocument) { return tab.kind!=='plugin'||!fixedPluginGroup(tab.slot) }
