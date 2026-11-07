import { editorGroups, parseEditorLayout, removeEditor, resizeEditor, splitEditor, type EditorLayout } from './editor-layout.ts'
import { applicationPageTitles } from './application-pages.ts'
import { canPlaceDocument, fixedPluginGroup, pluginSlots, type PluginSlot } from './plugin-placement.ts'
export type EditorGroup = string
export type WorkbenchDocument =
  | { id: string; kind: 'chat'; title: string; sessionId: string }
  | { id: string; kind: 'file'; title: string; sessionId: string; path: string }
  | { id: string; kind: 'plugin'; title: string; viewKey: string; sessionId?: string; slot?: PluginSlot }
  | { id: string; kind: 'page'; title: string; page: string; sessionId?: string }
export type WorkbenchTab = WorkbenchDocument & { group: EditorGroup; pinned?: boolean }
export interface WorkbenchState {
  version: 2; tabs: WorkbenchTab[]; layout: EditorLayout; nextGroup: number
  active: Record<string, string | null>; focused: EditorGroup
  sidebarWidth: number; sidebarOpen: boolean; sideWidth: number; sideOpen: boolean
  bottomHeight: number; bottomOpen: boolean; panelWidth: number; panelPosition: 'bottom' | 'top' | 'left' | 'right'
}
export const initialWorkbench = (): WorkbenchState => ({ version: 2, tabs: [], layout: { type: 'group', id: 'main' }, nextGroup: 1,
  active: { main: null, auxiliary: null, panel: null, application: null, floating: null }, focused: 'main', sidebarWidth: 280, sidebarOpen: true,
  sideWidth: 420, sideOpen: true, bottomHeight: 230, bottomOpen: false, panelWidth: 380, panelPosition: 'bottom' })
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
export const pageTitles: Record<string, string> = { ...applicationPageTitles, character: '角色立绘' }
function parseTab(value: unknown): WorkbenchTab | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id.length > 4096 || typeof item.title !== 'string' || item.title.length > 512 || typeof item.group !== 'string') return null
  const base = { id: item.id, title: item.title, group: item.group, ...(item.pinned === true ? { pinned: true } : {}) }
  const sessionId = typeof item.sessionId === 'string' && item.sessionId.length < 256 ? item.sessionId : undefined
  if (item.kind === 'chat' && sessionId !== undefined) return { ...base, kind: 'chat', sessionId }
  if (item.kind === 'file' && sessionId && typeof item.path === 'string' && item.path.length < 4096) return { ...base, kind: 'file', sessionId, path: item.path }
  if (item.kind === 'plugin' && typeof item.viewKey === 'string' && item.viewKey.length < 4096) {
    if(item.slot!==undefined&&!pluginSlots.includes(item.slot as PluginSlot))return null
    return { ...base, kind: 'plugin', viewKey: item.viewKey, ...(item.slot===undefined?{}:{slot:item.slot as PluginSlot}), ...(sessionId===undefined?{}:{sessionId}) }
  }
  if (item.kind === 'page' && item.page === 'character') return { ...base, kind: 'page', page: item.page, ...(sessionId===undefined?{}:{sessionId}) }
  return null
}
function repair(state: WorkbenchState): WorkbenchState {
  const editor=editorGroups(state.layout),groups = [...editor, 'auxiliary', 'panel', 'application', 'floating'], active = { ...state.active }
  const tabs = state.tabs.filter(tab => tab.kind !== 'page' || tab.page === 'character').map(tab => {
    const fixed=tab.kind==='plugin'?fixedPluginGroup(tab.slot):undefined
    const group=fixed??(groups.includes(tab.group)&&canPlaceDocument(tab,tab.group)?tab.group:editor[0])
    return group===tab.group?tab:{...tab,group}
  })
  for (const key of Object.keys(active)) if (!groups.includes(key)) delete active[key]
  for (const group of groups) if (!tabs.some(tab => tab.group === group && tab.id === active[group])) active[group] = group==='application'||group==='floating'?null:tabs.filter(tab => tab.group === group).at(-1)?.id ?? null
  return { ...state, tabs, active, focused: [...editor,'auxiliary','panel'].includes(state.focused) ? state.focused : editor[0] }
}
export function restoreWorkbench(raw: string | null): WorkbenchState {
  const fallback = initialWorkbench()
  try {
    const value = JSON.parse(raw ?? 'null')
    if (![1, 2].includes(value?.version) || !Array.isArray(value.tabs)) return fallback
    const seen = new Set<string>()
    const tabs: WorkbenchTab[] = value.tabs.slice(0, 256).flatMap((value: unknown) => { const tab = parseTab(value); if (!tab || seen.has(tab.id)) return []; seen.add(tab.id); return [tab] })
    const legacy = value.version === 1
    if (legacy) for (const tab of tabs) if (tab.group === 'side') tab.group = 'auxiliary'
    if(legacy) {
      const chat=tabs.find(tab=>tab.kind==='chat'&&(tab.id===value.active?.main||tab.id===value.active?.side))
      if(chat?.kind==='chat')for(const tab of tabs)if((tab.kind==='plugin'||tab.kind==='page')&&!tab.sessionId)tab.sessionId=chat.sessionId
    }
    const active = legacy ? { main: value.active?.main, auxiliary: value.active?.side, panel: null } : value.active
    return repair({ ...fallback, tabs, layout: parseEditorLayout(value.layout) ?? fallback.layout,
      nextGroup: Math.floor(bounded(value.nextGroup, 1, 1, 100000)), active: active && typeof active === 'object' ? active : {},
      focused: typeof value.focused === 'string' ? legacy && value.focused === 'side' ? 'auxiliary' : value.focused : 'main',
      sidebarWidth: bounded(value.sidebarWidth, 280, 220, 440), sideWidth: bounded(value.sideWidth, 420, 260, 800),
      bottomHeight: bounded(value.bottomHeight, 230, 120, 500), panelWidth: bounded(value.panelWidth, 380, 260, 800),
      panelPosition: ['bottom', 'top', 'left', 'right'].includes(value.panelPosition) ? value.panelPosition : 'bottom',
      sidebarOpen: value.sidebarOpen !== false, sideOpen: value.sideOpen !== false, bottomOpen: value.bottomOpen === true })
  } catch { return fallback }
}
export type WorkbenchAction =
  | { type: 'open'; document: WorkbenchDocument; group?: EditorGroup; background?: boolean }
  | { type: 'select'; id: string } | { type: 'close'; id: string } | { type: 'focus'; group: EditorGroup }
  | { type: 'move'; id: string; group: EditorGroup; before?: string }
  | { type: 'split'; group: EditorGroup; axis: 'horizontal' | 'vertical'; id?: string }
  | { type: 'resize'; id: string; ratio: number } | { type: 'merge'; group: EditorGroup }
  | { type: 'replace'; id: string; document: WorkbenchDocument } | { type: 'pin'; id: string }
  | { type: 'layout'; patch: Partial<Omit<WorkbenchState, 'version' | 'tabs' | 'layout' | 'active' | 'focused' | 'nextGroup'>> }
  | { type: 'removeFiles'; sessionId: string }
  | { type: 'dismissApplication' }
export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  if(action.type==='dismissApplication')return {...state,active:{...state.active,application:null}}
  if ((action.type === 'open' || action.type === 'replace') && action.document.kind === 'page' && action.document.page !== 'character') return state
  if (action.type === 'layout') return { ...state, ...action.patch }
  if (action.type === 'focus') return state.focused === action.group ? state : { ...state, focused: action.group }
  if (action.type === 'resize') return { ...state, layout: resizeEditor(state.layout, action.id, action.ratio) }
  if (action.type === 'removeFiles') return repair({ ...state, tabs: state.tabs.filter(tab => tab.kind !== 'file' || tab.sessionId !== action.sessionId) })
  if (action.type === 'close') return repair({ ...state, tabs: state.tabs.filter(tab => tab.id !== action.id),active:{...state.active,...(state.active.application===action.id?{application:null}:{})} })
  if (action.type === 'split') {
    const source=state.tabs.find(tab=>tab.id===action.id)
    if(source&&!canPlaceDocument(source,'main'))return state
    const group = editorGroups(state.layout).includes(action.group) ? action.group : editorGroups(state.layout)[0]
    let number = state.nextGroup
    while (editorGroups(state.layout).includes('editor-' + number)) number++
    const next = 'editor-' + number
    const result = repair({ ...state, layout: splitEditor(state.layout, group, next, action.axis), nextGroup: number + 1, focused: next })
    return action.id ? workbenchReducer(result, { type: 'move', id: action.id, group: next }) : result
  }
  if (action.type === 'merge') {
    const layout = removeEditor(state.layout, action.group)
    return layout ? repair({ ...state, layout, focused: editorGroups(layout)[0] }) : state
  }
  if (action.type === 'open') {
    const current = state.tabs.find(tab => tab.id === action.document.id)
    const fixed=action.document.kind==='plugin'?fixedPluginGroup(action.document.slot):undefined
    const group = fixed??current?.group ?? action.group ?? (editorGroups(state.layout).includes(state.focused) ? state.focused : editorGroups(state.layout)[0])
    const tab = { ...action.document, group, ...(current?.pinned ? { pinned: true } : {}) }
    return repair({ ...state, tabs: current ? state.tabs.map(item => item.id === tab.id ? tab : item) : [...state.tabs, tab],
      ...(action.background ? {} : { active: { ...state.active,application:group==='floating'?state.active.application:null,[group]:tab.id }, focused: group==='application'||group==='floating'?state.focused:group, ...(group === 'auxiliary' ? { sideOpen: true } : group === 'panel' ? { bottomOpen: true } : {}) }) })
  }
  const tab = state.tabs.find(item => item.id === action.id)
  if (!tab) return state
  if (action.type === 'pin') return { ...state, tabs: state.tabs.map(item => item.id === action.id ? { ...item, pinned: !item.pinned } : item) }
  if (action.type === 'replace') return repair({ ...state, tabs: state.tabs.map(item => item.id === action.id ? { ...action.document, id: item.id, group: item.group, pinned: item.pinned } : item) })
  if (action.type === 'select') return { ...state, active: { ...state.active,application:tab.group==='floating'?state.active.application:null, [tab.group]: tab.id }, focused: tab.group==='application'||tab.group==='floating'?state.focused:tab.group,
    ...(tab.group === 'auxiliary' ? { sideOpen: true } : tab.group === 'panel' ? { bottomOpen: true } : {}) }
  if(!canPlaceDocument(tab,action.group))return state
  const tabs = state.tabs.filter(item => item.id !== tab.id), index = action.before ? tabs.findIndex(item => item.id === action.before && item.group === action.group) : -1
  tabs.splice(index < 0 ? tabs.length : index, 0, { ...tab, group: action.group })
  return repair({ ...state, tabs, active: { ...state.active, [action.group]: tab.id }, focused: action.group,
    ...(action.group === 'auxiliary' ? { sideOpen: true } : action.group === 'panel' ? { bottomOpen: true } : {}) })
}
