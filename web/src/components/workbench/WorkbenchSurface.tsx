import { useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { WorkbenchToolbarSlot } from './workbench-toolbar-slot'

/** Move the same portal container between groups; tab switches never remount the view. */
export function WorkbenchSurface({ target, toolbarTarget, visible, children, name, onActivate }: {
  target: HTMLElement | null; toolbarTarget?: HTMLElement | null; visible: boolean; children: ReactNode; name: string; onActivate?: () => void
}) {
  const [mount] = useState(() => {
    if (typeof document === 'undefined') return null
    const element = document.createElement('div')
    element.hidden = true; element.inert = true
    element.className = 'workbench-surface'; element.dataset.document = name
    return element
  })
  const [toolbar] = useState(() => {
    if (typeof document === 'undefined') return null
    const element = document.createElement('div')
    element.hidden = true; element.inert = true
    element.className = 'workbench-document-toolbar'; element.dataset.document = name
    return element
  })
  useLayoutEffect(() => {
    if (!target || !mount) return
    target.appendChild(mount)
    return () => mount.remove()
  }, [target, mount])
  useLayoutEffect(() => {
    if (!toolbarTarget || !toolbar) return
    toolbarTarget.appendChild(toolbar)
    return () => toolbar.remove()
  }, [toolbarTarget, toolbar])
  useLayoutEffect(() => {
    if (!mount) return
    mount.hidden = !visible; mount.inert = !visible; mount.dataset.document = name
    mount.id = `wb-panel-${encodeURIComponent(name)}`; mount.setAttribute('role', 'tabpanel')
    mount.setAttribute('aria-labelledby', `wb-tab-${encodeURIComponent(name)}`)
    if (toolbar) {
      toolbar.hidden = !visible; toolbar.inert = !visible; toolbar.dataset.document = name
      if (!visible) toolbar.querySelectorAll<HTMLElement>(':popover-open').forEach(element => element.hidePopover())
    }
  }, [mount, toolbar, visible, name])
  useLayoutEffect(() => {
    if (!visible || !onActivate) return
    for (const element of [mount, toolbar]) {
      element?.addEventListener('focusin', onActivate)
      element?.addEventListener('pointerdown', onActivate)
    }
    return () => {
      for (const element of [mount, toolbar]) {
        element?.removeEventListener('focusin', onActivate)
        element?.removeEventListener('pointerdown', onActivate)
      }
    }
  }, [mount, toolbar, visible, onActivate])
  return mount ? createPortal(<WorkbenchToolbarSlot.Provider value={toolbar}>{children}</WorkbenchToolbarSlot.Provider>, mount) : children
}
