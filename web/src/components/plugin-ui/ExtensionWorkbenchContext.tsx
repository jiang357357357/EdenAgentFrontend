import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ExtensionUiActions } from '../../lib/extensions/extension-bridge'
import type { ContributionContext } from '../../lib/extensions/contribution-context'

const unavailable = () => { throw new Error('当前页面未连接扩展工作台') }
export const ExtensionWorkbenchContext = createContext<ExtensionUiActions>({
  message: unavailable, progress: unavailable, openView: unavailable, status: unavailable, refreshTree: unavailable, postMessage: unavailable,
})
export const useExtensionWorkbenchActions = () => useContext(ExtensionWorkbenchContext)
export const ExtensionContributionContext = createContext<ContributionContext>({ sessionAvailable: false, sessionRunning: false })
export const ExtensionActivityContext = createContext<ReactNode>(null)
