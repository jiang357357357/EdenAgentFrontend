import { useEffect, useRef, useState } from "react"
import { readSharedDirectory, selectSharedDirectory } from "../../lib/shared-workspace-client"
import { selectDesktopWorkspaceDirectory } from "../../lib/desktop-window"
import { getRuntimeOriginRevision } from "../../lib/runtime-origin"
import { useSharedWorkspace, type SharedWorkspaceScope } from "../../components/shared-workspace/use-shared-workspace"
import { SharedWorkspacePageView } from "./SharedWorkspacePageView"

export function SharedWorkspacePage({ scope, scopeVersion = 0, onBack, onDirectoryChanged }: {
  scope: SharedWorkspaceScope
  scopeVersion?: number
  onBack(): void
  onDirectoryChanged(scope: SharedWorkspaceScope): void
}) {
  const [choosing, setChoosing] = useState(false)
  const [directoryError, setDirectoryError] = useState("")
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const owner = useSharedWorkspace(scope, { details: true, scopeVersion, onInvalidated: reason => {
    if (reason === "identity" || !pending.current) onBack()
  } })
  // Keep the local switch active until React installs the returned directory's scope.
  useEffect(() => { pending.current = false }, [owner])
  const chooseWorkspace = async () => {
    if (pending.current || !owner.isCurrent() || owner.state.busy) return
    const revision = getRuntimeOriginRevision()
    const current = () => mounted.current && revision === getRuntimeOriginRevision()
    pending.current = true
    setChoosing(true); setDirectoryError("")
    let completed = false
    try {
      const selected = await readSharedDirectory(scope.sessionId)
      if (!current() || !owner.isCurrent()) return
      const path = window.edenAgentDesktop ? await selectDesktopWorkspaceDirectory(scope.directoryPath)
        : window.prompt("输入服务端上的文件夹绝对路径", scope.directoryPath)?.trim()
      if (!path || !current()) return
      if (!owner.isCurrent()) return
      const result = await selectSharedDirectory(scope.sessionId, path, selected.revision)
      if (current()) {
        completed = true
        onDirectoryChanged({ sessionId: scope.sessionId, directoryPath: result.path })
      }
    } catch (error) {
      if (current()) {
        if (!owner.isCurrent()) onBack()
        else setDirectoryError(error instanceof Error ? error.message : "共享目录选择失败")
      }
    } finally {
      if (!completed) pending.current = false
      if (current()) {
        setChoosing(false)
        if (!completed && !owner.isCurrent()) onBack()
      }
    }
  }
  return <SharedWorkspacePageView owner={owner} root={scope.directoryPath} choosing={choosing} directoryError={directoryError}
    onBack={onBack} onChooseWorkspace={() => void chooseWorkspace()} />
}
