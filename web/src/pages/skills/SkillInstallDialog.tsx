import { useState } from 'react'
import { Check, FolderOpen, Github, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { useSkillClient, type SkillPreview } from '../../lib/skill-client'
import { selectDesktopSkillDirectory } from '../../lib/desktop-window'

function readableBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function SkillInstallDialog({ onClose, onInstalled }: { onClose(): void; onInstalled(): Promise<void> }) {
  const { inspectSkill, installSkill } = useSkillClient()
  const [busyID, setBusyID] = useState('')
  const [error, setError] = useState('')
  const [sourceType, setSourceType] = useState<'local' | 'git'>('local')
  const [sourceUri, setSourceUri] = useState('')
  const [sourceRef, setSourceRef] = useState('')
  const [sourceSubpath, setSourceSubpath] = useState('')
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [preview, setPreview] = useState<SkillPreview | null>(null)
  async function chooseDirectory() {
    setBusyID('directory'); setError('')
    try {
      const selected = await selectDesktopSkillDirectory()
      if (selected) { setSourceUri(selected); setPreview(null) }
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusyID('') }
  }

  async function inspect() {
    setBusyID("inspect")
    setError("")
    setPreview(null)
    try {
      setPreview(await inspectSkill({ sourceType, sourceUri, sourceRef, sourceSubpath, scope }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }

  async function install() {
    if (!preview) return
    setBusyID("install")
    setError("")
    try {
      await installSkill(preview.previewID)
      setPreview(null)
      onClose()
      setSourceUri("")
      setSourceRef("")
      setSourceSubpath("")
      await onInstalled()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyID("")
    }
  }
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/25 p-5 backdrop-blur-sm">
          <fieldset disabled={Boolean(busyID)} className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center">
              <div>
                <h2 className="text-lg font-semibold">安装技能</h2>
                <p className="mt-1 text-xs text-text-muted">先预检内容、权限与目录安全，再确认安装。</p>
              </div>
              <button
                type="button"
                onClick={() => onClose()}
                className="ml-auto rounded-full p-2 text-text-muted hover:bg-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-bg p-1">
              <button
                type="button"
                onClick={() => {
                  setSourceType("local")
                  setPreview(null)
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${sourceType === "local" ? "bg-card text-accent shadow-sm" : "text-text-muted"}`}
              >
                <FolderOpen className="h-4 w-4" />
                本地目录
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceType("git")
                  setPreview(null)
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${sourceType === "git" ? "bg-card text-accent shadow-sm" : "text-text-muted"}`}
              >
                <Github className="h-4 w-4" />
                Git 仓库
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-text-muted">
              {sourceType === "local" ? "技能目录" : "仓库地址"}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={sourceUri}
                onChange={(event) => {
                  setSourceUri(event.target.value)
                  setPreview(null)
                }}
                placeholder={sourceType === "local" ? "/path/to/skill" : "https://github.com/owner/repo.git"}
                className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-warning/30"
              />
              {sourceType === "local" && (
                <button
                  type="button"
                  onClick={() => void chooseDirectory()}
                  className="rounded-xl border border-border px-3 text-text-muted hover:bg-border"
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {sourceType === "git" && (
                <input
                  value={sourceRef}
                  onChange={(event) => {
                    setSourceRef(event.target.value)
                    setPreview(null)
                  }}
                  placeholder="分支/标签（可选）"
                  className="rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-warning/30"
                />
              )}
              <input
                value={sourceSubpath}
                onChange={(event) => {
                  setSourceSubpath(event.target.value)
                  setPreview(null)
                }}
                placeholder="仓库内子目录（可选）"
                className="rounded-xl border border-border px-3 py-2.5 text-sm outline-none focus:border-warning/30"
              />
              <select
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as "user" | "project")
                  setPreview(null)
                }}
                className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-warning/30"
              >
                <option value="user">当前用户</option>
                <option value="project">当前项目</option>
              </select>
            </div>
            {preview && (
              <div className="mt-4 rounded-xl border border-success/30 bg-success-dim p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-success">
                  <ShieldCheck className="h-4 w-4" />
                  预检通过：{preview.displayName}
                </div>
                <p className="mt-1 text-xs leading-5 text-success">{preview.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-success">
                  <span>{preview.skillName}</span>
                  <span>v{preview.version}</span>
                  <span>{preview.fileCount} 个文件</span>
                  <span>{readableBytes(preview.totalBytes)}</span>
                  <span>{preview.tools.length} 个工具</span>
                </div>
              </div>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose()}
                className="rounded-full px-4 py-2 text-sm text-text-muted hover:bg-border"
              >
                取消
              </button>
              {!preview ? (
                <button
                  type="button"
                  disabled={!sourceUri.trim() || busyID === "inspect"}
                  onClick={() => void inspect()}
                  className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm text-on-accent disabled:opacity-50"
                >
                  {busyID === "inspect" && <LoaderCircle className="h-4 w-4 animate-spin" />}预检
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyID === "install"}
                  onClick={() => void install()}
                  className="flex items-center gap-2 rounded-full bg-success-solid px-5 py-2 text-sm text-on-solid disabled:opacity-50"
                >
                  {busyID === "install" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {preview.replaceInstallationID ? "确认更新" : "确认安装"}
                </button>
              )}
            </div>
          </fieldset>
        </div>
  )
}
