import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { createSharedWorkspaceClient, type SharedFile } from '../../lib/shared-workspace-client'
import type { SharedWorkspaceScope } from './use-shared-workspace'

interface SharedDirectory {
  folders: Map<string, SharedDirectory>
  files: { name: string; path: string }[]
}

function buildTree(files: SharedFile[]): SharedDirectory {
  const root: SharedDirectory = { folders: new Map(), files: [] }
  for (const file of files) {
    if (file.deleted) continue
    const parts = file.path.split('/')
    const name = parts.pop()
    if (!name) continue
    let directory = root
    for (const part of parts) {
      let folder = directory.folders.get(part)
      if (!folder) {
        folder = { folders: new Map(), files: [] }
        directory.folders.set(part, folder)
      }
      directory = folder
    }
    directory.files.push({ name, path: file.path })
  }
  return root
}

export function SharedWorkspaceFiles({ scope, spaceId, lastSync, isCurrent }: {
  scope: SharedWorkspaceScope
  spaceId: string
  lastSync: number | null
  isCurrent(): boolean
}) {
  const { sessionId, directoryPath } = scope
  const client = useMemo(() => createSharedWorkspaceClient(directoryPath, sessionId), [directoryPath, sessionId])
  const [tree, setTree] = useState<SharedDirectory | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    let active = true
    const current = () => active && isCurrent() && client.isCurrent()
    setError('')
    const load = async () => {
      if (!current()) return
      try {
        const indexed = await client.files()
        if (!current()) return
        const status = await client.status()
        if (!current()) return
        if (!status.available || status.spaceId !== spaceId) throw new Error('共享资料库已切换，请重新展开')
        setTree(buildTree(indexed))
      } catch (reason) {
        if (!current()) return
        setTree(null)
        setError(reason instanceof Error ? reason.message : '读取共享文件失败')
      }
    }
    void load()
    return () => { active = false }
  }, [client, isCurrent, lastSync, retry, spaceId])

  return <motion.div className="mt-2 border-l border-border pl-2"
    initial={reducedMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
    {error ? <div className="space-y-1 px-1 py-2 text-xs text-text-muted">
      <p className="break-words" role="alert">{error}</p>
      <button type="button" className="rounded px-1 py-1 text-text hover:bg-card" onClick={() => setRetry(value => value + 1)}>重新读取</button>
    </div> : !tree ? <p className="px-1 py-2 text-xs text-text-muted" role="status">正在读取共享文件…</p>
      : tree.folders.size || tree.files.length ? <SharedDirectoryList directory={tree} />
        : lastSync !== null && <p className="px-1 py-2 text-xs text-text-muted">暂无共享文件</p>}
  </motion.div>
}

const compareNames = new Intl.Collator('zh-CN', { numeric: true }).compare

function SharedDirectoryList({ directory }: { directory: SharedDirectory }) {
  const folders = [...directory.folders].sort(([left], [right]) => compareNames(left, right))
  const files = [...directory.files].sort((left, right) => compareNames(left.name, right.name))
  return <ul>
    {folders.map(([name, folder]) => <SharedFolder key={name} name={name} folder={folder} />)}
    {files.map(file => <li key={file.path} title={file.path}
      className="flex min-w-0 items-center gap-1.5 py-1 pl-5 text-sm text-text-muted">
      <File className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
    </li>)}
  </ul>
}

function SharedFolder({ name, folder }: { name: string; folder: SharedDirectory }) {
  const [open, setOpen] = useState(false)
  const childrenId = useId()
  const FolderIcon = open ? FolderOpen : Folder
  return <li>
    <button type="button" title={name} aria-expanded={open} aria-controls={childrenId} onClick={() => setOpen(value => !value)}
      className="flex w-full min-w-0 items-center gap-1.5 rounded py-1 text-left text-sm text-text-muted hover:bg-card hover:text-text">
      <ChevronRight className={'h-3.5 w-3.5 shrink-0 motion-safe:transition-transform' + (open ? ' rotate-90' : '')} aria-hidden="true" />
      <FolderIcon className="h-4 w-4 shrink-0 text-accent/80" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </button>
    <div id={childrenId} hidden={!open} className="pl-3">{open ? <SharedDirectoryList directory={folder} /> : null}</div>
  </li>
}
