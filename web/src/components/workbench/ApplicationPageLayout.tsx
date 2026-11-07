import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { applicationPageTitles, isApplicationPage, type ApplicationPageRoute } from './application-pages'

/** Keep editors mounted so navigating an application page never discards drafts or layout. */
export function ApplicationPageLayout({ page, sessionId, children }: {
  page?: ApplicationPageRoute; sessionId?: string; children: ReactNode
}) {
  const active = isApplicationPage(page?.id), content = useRef<HTMLDivElement>(null), workbench = useRef<HTMLDivElement>(null)
  const previous = useRef(false)
  useLayoutEffect(() => {
    if (active) content.current?.focus({ preventScroll: true })
    else if (previous.current) workbench.current?.querySelector<HTMLElement>('.workbench-surface:not([hidden]) textarea, .workbench-command')?.focus({ preventScroll: true })
    previous.current = active
  }, [active, page?.id])
  return <>
    <div ref={workbench} hidden={active} inert={active} data-application-workbench="" className="h-full w-full">{children}</div>
    {active && page && <div ref={content} tabIndex={-1} role="region" aria-label={applicationPageTitles[page.id]}
      data-application-page={page.id} className="fixed inset-0 z-20 isolate overflow-hidden outline-none">
      {page.render(page.id, sessionId)}
    </div>}
  </>
}
