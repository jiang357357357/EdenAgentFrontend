import type { PluginPreviewInfo } from '@eden/api'
export function PluginPackagePreview({ preview }: { preview: PluginPreviewInfo }) {
  return <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
    <h2 className="font-medium">待安装：{preview.name} · {preview.version}</h2>
    <p className="mt-1 text-xs">{preview.description}</p>
    <dl className="mt-3 space-y-1 break-all text-xs">
      <div><dt className="inline font-medium">来源：</dt><dd className="inline">{preview.sourceUri}</dd></div>
      <div><dt className="inline font-medium">版本摘要：</dt><dd className="inline font-mono">{preview.revision}</dd></div>
      <div><dt className="inline font-medium">签名：</dt><dd className="inline">{preview.verified ? '可信密钥验签通过' : '未验证'}</dd></div>
      <div><dt className="inline font-medium">预览有效期：</dt><dd className="inline">{new Date(Number(preview.expiresAt)).toLocaleString()}</dd></div>
    </dl>
    <h3 className="mt-3 text-xs font-medium">组件</h3>
    <ul className="mt-1 space-y-1 text-xs">{preview.components.map(component => <li key={component.id}>{component.id} · {component.kind} · {component.path} · {component.enabledByDefault ? '默认启用请求' : '默认停用'}</li>)}</ul>
    <h3 className="mt-3 text-xs font-medium">声明权限</h3>
    {preview.permissions.length ? <ul className="mt-1 space-y-1 text-xs">{preview.permissions.map((permission, index) => <li key={index}>{permission.capability} · {permission.resource || '未指定资源'} · {permission.access} · {permission.required ? '必需' : '可选'}<p>{permission.description}</p></li>)}</ul> : <p className="mt-1 text-xs">未声明权限</p>}
    <p className="mt-3 text-xs text-stone-600">签名确认包的来源与完整性。安装、权限授权和组件执行分别处理。</p>
  </section>
}
