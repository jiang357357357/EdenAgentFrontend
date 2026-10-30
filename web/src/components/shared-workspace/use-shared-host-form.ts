import { useEffect, useRef, useState } from 'react'
import type { SharedWorkspaceStateOwner } from './shared-workspace-state'

export function useSharedHostForm(owner: SharedWorkspaceStateOwner) {
  const [fields, setFields] = useState({ host: '', port: '22', username: '', name: 'EDEN 云端共享主机', directory: '',
    servicePort: '40195', publicAddress: '' })
  const [authType, setAuthType] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState(''), [privateKey, setPrivateKey] = useState(''), [passphrase, setPassphrase] = useState('')
  const [fingerprint, setFingerprint] = useState(''), [trusted, setTrusted] = useState(false)
  const [installService, setInstallService] = useState(true)
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const generation = useRef(0), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
  useEffect(() => {
    generation.current++; setPassword(''); setPrivateKey(''); setPassphrase(''); setFingerprint(''); setTrusted(false); setPending(false); setError('')
    return () => { generation.current++ }
  }, [owner])
  const current = (epoch: number) => mounted.current && owner.isCurrent() && epoch === generation.current
  const setField = (key: keyof typeof fields, value: string) => {
    if (key === 'host' || key === 'port' || key === 'username') {
      generation.current++; setFingerprint(''); setTrusted(false)
    }
    setFields(before => ({ ...before, [key]: value }))
  }
  const probe = async () => {
    const epoch = generation.current
    setPending(true); setError(''); setFingerprint(''); setTrusted(false)
    try {
      const result = await owner.sshProbe({ host: fields.host.trim(), port: Number(fields.port), username: fields.username.trim() })
      if (current(epoch)) setFingerprint(result.fingerprint)
    } catch (reason) { if (current(epoch)) setError(reason instanceof Error ? reason.message : 'SSH 指纹读取失败') }
    finally { if (current(epoch)) setPending(false) }
  }
  const deploy = async () => {
    if (!fingerprint || !trusted || pending) return
    const epoch = generation.current
    setPending(true); setError('')
    const request = owner.deployHost({ ...fields, host: fields.host.trim(), username: fields.username.trim(),
      port: Number(fields.port), servicePort: Number(fields.servicePort), fingerprint, installService,
      publicAddress: fields.publicAddress.trim() || `http://${fields.host.trim()}:${fields.servicePort}`,
      auth: authType === 'password' ? { type: 'password', password }
        : { type: 'key', privateKey, ...(passphrase ? { passphrase } : {}) },
    })
    setPassword(''); setPrivateKey(''); setPassphrase('')
    try { await request }
    catch (reason) { if (current(epoch)) setError(reason instanceof Error ? reason.message : '主机部署未能启动') }
    finally { if (current(epoch)) setPending(false) }
  }
  const cancel = async () => {
    const id = owner.state.deployment?.id
    if (!id) return
    try { await owner.cancelDeployment(id) }
    catch (reason) { if (mounted.current && owner.isCurrent()) setError(reason instanceof Error ? reason.message : '取消部署失败') }
  }
  return { fields, setField, authType, setAuthType, password, setPassword, privateKey, setPrivateKey, passphrase, setPassphrase,
    fingerprint, trusted, setTrusted, installService, setInstallService, pending, error, probe, deploy, cancel }
}
