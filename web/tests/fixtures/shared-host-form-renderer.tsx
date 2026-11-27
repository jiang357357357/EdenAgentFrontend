import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SharedHostDeployment } from '../../src/components/shared-workspace/SharedHostDeployment'
import type { SharedWorkspaceStateOwner } from '../../src/components/shared-workspace/shared-workspace-state'
import type { SharedDeploymentInput } from '../../src/lib/shared-workspace-client'

const fixture = { requests: [] as SharedDeploymentInput[], failNext: true, releaseProbe: () => {} }
Object.assign(window, { sharedHostFixture: fixture })
const owner = {
  state: { deployment: null }, isCurrent: () => true,
  sshProbe: () => new Promise(resolve => { fixture.releaseProbe = () => resolve({ fingerprint: 'SHA256:synthetic-fixture' }) }),
  deployHost: async (input: SharedDeploymentInput) => {
    fixture.requests.push(input)
    if (fixture.failNext) { fixture.failNext = false; throw new Error('测试连接失败，请重试') }
    return { id: 'fixture-job', state: 'running' }
  },
} as unknown as SharedWorkspaceStateOwner

createRoot(document.getElementById('root')!).render(<StrictMode><SharedHostDeployment owner={owner} busy={false} /></StrictMode>)
