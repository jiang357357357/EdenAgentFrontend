import { useEffect, useState } from 'react'
import { getRuntimeOriginRevision } from './runtime-origin'

/** Refresh preference ownership even if an account token changes without changing the displayed user ID. */
export function usePreferenceRevision() {
  const [revision, setRevision] = useState(getRuntimeOriginRevision)
  useEffect(() => {
    const changed = () => setRevision(getRuntimeOriginRevision())
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'agent.auth_token' || event.key === 'agent.runtime_origin') changed()
    }
    window.addEventListener('edenagent:account-changed', changed)
    window.addEventListener('edenagent:runtime-origin-changed', changed)
    window.addEventListener('storage', storage)
    changed()
    return () => {
      window.removeEventListener('edenagent:account-changed', changed)
      window.removeEventListener('edenagent:runtime-origin-changed', changed)
      window.removeEventListener('storage', storage)
    }
  }, [])
  return revision
}
