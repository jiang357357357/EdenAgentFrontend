import type { ReactNode } from 'react'

/** Application navigation is independent of movable chat/file/extension documents. */
export const applicationPageTitles: Record<string, string> = {
  allSessions: '所有会话', selfAwake: '自醒', memo: '备忘', 'shared-workspace': '共享资料库',
  skills: '技能', plugins: '插件管理', connectors: '连接器', configuration: '配置',
  settings: '设置', 'assistant-switcher': '参与者与角色',
}
export function isApplicationPage(page?: string) {
  return page !== undefined && Object.hasOwn(applicationPageTitles, page)
}
export interface ApplicationPageRoute {
  id: string
  render(page: string, sessionId?: string): ReactNode
  onChange(page: string): void
}
