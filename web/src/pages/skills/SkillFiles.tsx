import { useEffect, useState } from 'react'
import { useScopedRpc } from '../../lib/use-scoped-rpc'
import type { InstalledSkill } from '../../lib/skill-client'

type FilePreview = { path: string; bytes: Uint8Array; text: string | null }
function decodeFile(path: string, content: string): FilePreview {
  if (content.length > 1400000) throw new Error('技能文件超过预览大小限制')
  const binary = atob(content), bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  let text: string | null = null
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(decoded)) text = decoded
  } catch { /* Non-UTF-8 files remain available as a byte-preserving download. */ }
  return { path, bytes, text }
}

export function SkillFiles({ skill, files }: { skill: InstalledSkill; files: string[] }) {
  const request = useScopedRpc()
  const [selected, setSelected] = useState('')
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    setPreview(null); setError(''); setLoading(false)
    if (!selected || !files.includes(selected)) return () => { active = false }
    setLoading(true)
    void request('skill.file', { name: skill.id, path: selected, expectedContentHash: skill.contentHash, expectedWorkspaceRoot: skill.workspaceRoot })
      .then(result => {
        if (!active) return
        if (result.name !== skill.id || result.path !== selected || result.contentHash !== skill.contentHash) throw new Error('技能文件版本已变化，请刷新详情')
        setPreview(decodeFile(result.path, result.content))
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [selected, files, skill.id, skill.contentHash, skill.workspaceRoot, request])
  function download() {
    if (!preview) return
    const url = URL.createObjectURL(new Blob([new Uint8Array(preview.bytes)], { type: 'application/octet-stream' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = preview.path.split('/').at(-1) || 'skill-file'
    document.body.append(anchor)
    anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <details className="mt-3">
    <summary className="cursor-pointer text-stone-600">查看支持文件（{files.length}）</summary>
    <label className="mt-2 block">文件
      <select value={selected} onChange={event => setSelected(event.target.value)} className="ml-2 max-w-full rounded border p-1">
        <option value="">选择文件</option>
        {files.map(file => <option key={file} value={file}>{file}</option>)}
      </select>
    </label>
    {loading && <p className="mt-2">正在读取…</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {preview && <div className="mt-2">
      <div className="flex gap-3"><span>{preview.bytes.byteLength} 字节</span><button type="button" onClick={download} className="text-amber-700">下载原文件</button></div>
      {preview.text === null ? <p className="mt-2 text-stone-500">此文件不支持文本预览。</p> : <>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">{preview.text.slice(0, 65536)}</pre>
        {preview.text.length > 65536 && <p className="text-stone-500">仅展示前 65536 个字符，下载可查看完整文件。</p>}
      </>}
    </div>}
  </details>
}
