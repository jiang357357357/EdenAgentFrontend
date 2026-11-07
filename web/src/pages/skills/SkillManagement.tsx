import { useEffect, useState } from 'react'
import { useSkillClient, type InstalledSkill } from '../../lib/skill-client'
import { SkillFiles } from './SkillFiles'

export function SkillManagement({ skill, onChanged, sessionId }: { skill: InstalledSkill; onChanged: () => Promise<void>; sessionId?: string }) {
  const { getSkillDetails, setSkillEnabled, uninstallSkill } = useSkillClient(sessionId)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    let active = true
    setContent(''); setFiles([]); setError(''); setConfirmDelete(false)
    void getSkillDetails(skill.id, skill).then(result => { if (active) { setContent(result.content); setFiles(result.files) } })
      .catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [skill.id, skill.contentHash, skill.workspaceRoot, getSkillDetails])
  async function change(remove: boolean) {
    setBusy(true); setError('')
    try {
      if (remove) await uninstallSkill(skill.id, skill)
      else await setSkillEnabled(skill.id, !skill.enabled, skill)
      setConfirmDelete(false)
      await onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <div className="mt-4 rounded-xl border border-border bg-card p-3 text-xs">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || skill.sourceType === 'marketplace'} onClick={() => void change(false)} className="text-warning disabled:opacity-50">
        {skill.enabled ? '停用技能' : '启用技能'}
      </button>
      <button type="button" disabled={busy || skill.builtin || skill.discovered || skill.sourceType === 'marketplace'} onClick={() => setConfirmDelete(true)} className="text-danger disabled:opacity-50">卸载</button>
    </div>
    {(skill.builtin || skill.discovered) && <p className="mt-2 text-text-muted">目录发现的技能可在当前世界停用；移除时需调整源目录。</p>}
    {skill.sourceType === 'marketplace' && <p className="mt-2 text-text-muted">此技能由插件 {skill.sourceUri} 提供；请在插件页管理其组件。</p>}
    {!!skill.shadowedSources?.length && <div className="mt-2 text-warning">同名来源：{skill.shadowedSources.map((item, index) => <p key={`${item.source.uri}:${item.workspaceRoot}:${index}`}>{item.scope} · {item.source.uri || item.source.type}{item.source.subpath ? ` · ${item.source.subpath}` : ''}</p>)}</div>}
    {!!skill.toolConflicts?.length && <div className="mt-2 text-warning">技能工具重名，相关技能工具已暂停注册：{skill.toolConflicts.map(item => <p key={item.name}>{item.name} · {item.identities.join('、')}</p>)}</div>}
    {confirmDelete && <div className="mt-3 space-x-3">
      <span>卸载“{skill.displayName || skill.skillName}”？</span>
      <button type="button" disabled={busy} onClick={() => void change(true)} className="text-danger">确认卸载</button>
      <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
    <details className="mt-3">
      <summary className="cursor-pointer text-text-muted">查看技能说明</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-text-muted">{content || '暂无正文'}</pre>
    </details>
    <SkillFiles key={`${skill.id}:${skill.contentHash}:${skill.workspaceRoot}`} skill={skill} files={files} sessionId={sessionId} />
  </div>
}
