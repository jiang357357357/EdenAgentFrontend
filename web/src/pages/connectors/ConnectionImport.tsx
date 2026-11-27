import { useState } from 'react'
import { parseConnectionImport, type ConnectionImport as ImportedConnection } from './connection-import'

export function ConnectionImport({ available, onImport }: { available: string[]; onImport: (value: ImportedConnection) => void }) {
  const [error, setError] = useState('')
  return <div className="mt-4 rounded-xl border border-border p-3 text-xs">
    <label>从抖音管理页导入接入配置
      <input type="file" accept="application/json,.json" className="mt-2 block w-full" onChange={async event => {
        const file = event.target.files?.[0]
        event.target.value = ''; setError('')
        if (!file) return
        try {
          if (file.size > 16384) throw new Error('接入配置过大')
          const value = parseConnectionImport(await file.text())
          if (!available.includes(value.connectorKey)) throw new Error('请先在当前世界安装并启用抖音连接器插件，再导入配置')
          onImport(value)
        } catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取接入配置') }
      }} />
    </label>
    <p className="mt-2 text-text-muted">导入会填入账号与服务地址。创建后单独保存身份凭据，审核权限并连接，再在角色会话设置事件订阅。</p>
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </div>
}
