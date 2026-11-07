import { useEffect, useState } from 'react'
import { readWorkspaceFile, type WorkspaceFileContent } from '../../lib/agent-client'

export function WorkspaceFileView({ sessionId, path, title }: { sessionId: string; path: string; title: string }) {
  const [content, setContent] = useState<WorkspaceFileContent>(), [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setContent(undefined); setError('')
    void readWorkspaceFile(sessionId, path).then(value => { if (active) setContent(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [sessionId, path, revision])
  return <section className="workbench-file surface-scrollbars" aria-label={`文件 ${title}`}>
    <header><span className="min-w-0 flex-1 truncate" title={path}>{path}</span><button type="button" onClick={() => setRevision(value => value + 1)}>重新读取</button></header>
    {error ? <p role="alert" className="p-5 text-danger">{error}</p>
      : !content ? <p className="p-5 text-text-muted">正在读取文件…</p>
        : content.truncated ? <p className="p-5 text-text-muted">文件超过 1 MB，暂不在编辑区预览。</p>
          : content.binary ? <p className="p-5 text-text-muted">这是二进制文件，暂不支持文本预览。</p>
            : <pre className="whitespace-pre p-5 font-mono text-[13px] leading-6">{content.content}</pre>}
  </section>
}
