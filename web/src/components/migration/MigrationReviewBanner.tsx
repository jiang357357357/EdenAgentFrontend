import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { RuntimeOrigin } from '../../lib/runtime-origin'
import { rpcRequestForOrigin } from '../../lib/rpc-transport'

const reportSchema = z.object({
  origin: z.enum(['mon', 'local']), state: z.literal('incomplete'), updatedAt: z.string(),
  converted: z.array(z.string()), pending: z.array(z.string()),
  recovery: z.object({ items: z.array(z.object({ key: z.string(), count: z.number().int().nonnegative() })) }),
})
const labels: Record<string, string> = {
  runtimeContexts: '会话上下文', plugins: '插件', historicalSkills: '历史技能', configuration: '配置',
  subagentContexts: '子任务上下文与权限', subagentMailbox: '子任务信箱', coreIdentities: 'Core 身份',
  coreDeliveries: 'Core 投递', inputs: '历史输入', jobs: '作业', operations: '工具操作',
  selfAwakeRuns: '自主唤醒', selfAwakeNotifications: '唤醒通知', desktopReminders: '桌面提醒',
  connectorEvents: '连接器事件', modelBindings: '模型绑定',
}

export function MigrationReviewBanner({ origin }: { origin: RuntimeOrigin }) {
  const [review, setReview] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState<z.infer<typeof reportSchema> | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const status = await rpcRequestForOrigin(origin, 'runtime.status', {})
        if (status.runtimeOrigin !== origin) throw new Error('宿主世界不匹配')
        if (active) { setReview(status.mode === 'migration-review'); setConnectionError('') }
      } catch (reason) { if (active) setConnectionError(String(reason)) }
      if (active) timer = setTimeout(() => void load(), 15000)
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [origin])
  async function refresh() {
    setBusy(true); setError('')
    try {
      const result = reportSchema.parse(await rpcRequestForOrigin(origin, 'migration.status', {}))
      if (result.origin !== origin) throw new Error('报告世界不匹配')
      setReport(result)
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  if (!review) return null
  return <aside aria-label="历史数据迁移" className="fixed left-1/2 top-3 z-[110] w-[min(36rem,90vw)] -translate-x-1/2 rounded-lg border border-amber-500 bg-bg p-3 text-sm text-text shadow-lg">
    <details><summary className="cursor-pointer font-medium">{origin === 'mon' ? '伊甸园' : '尘世'}：历史数据迁移模式 · 自动执行已暂停</summary>
      <div className="mt-2 max-h-[55vh] space-y-2 overflow-auto">
        <p>当前连接的是暂存数据。可以核对历史与保存恢复配置；对话执行、后台任务、连接器运行和实时语音未开放。</p>
        <p>手动检查技能来源或选择模型仍可能连接相应服务。保存配置不会完成迁移或启动历史任务。</p>
        <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded border border-border px-3 py-1">{busy ? '读取中…' : '刷新恢复进度'}</button>
        {connectionError && <p role="alert">宿主状态暂时无法确认：{connectionError}</p>}
        {error && <p role="alert" className="text-red-500">{error}</p>}
        {report && <>
          <p>已转换 {report.converted.length} 个表，待转换 {report.pending.length} 个表。读取时间：{new Date(report.updatedAt).toLocaleString()}</p>
          <ul>{report.recovery.items.filter(item => item.count > 0).map(item => <li key={item.key}>{labels[item.key] ?? item.key}：{item.count}</li>)}</ul>
          <p>以上数量可能重叠，清零也不代表迁移完成。当前暂存数据尚未激活。</p>
        </>}
      </div>
    </details>
  </aside>
}
