import { useEffect, useState } from 'react'
import { getOutboxCount, isOnline } from '../lib/offlineStore'

/**
 * Visible sync/offline status indicator required by SOW 3.5 — tells the user
 * whether they're looking at live or cached data, and whether anything they
 * created offline is still waiting to sync.
 */
export default function SyncStatusBadge() {
  const [online, setOnline] = useState(isOnline())
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const interval = setInterval(() => {
      getOutboxCount().then(setPending)
    }, 3000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(interval)
    }
  }, [])

  if (!online) return <span className="badge offline">Offline — viewing cached data</span>
  if (pending > 0) return <span className="badge pending">{pending} document(s) syncing…</span>
  return <span className="badge online">Online — up to date</span>
}
