import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import AppLayout, { type NavItem } from '../components/AppLayout'

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'devices', label: 'Device alerts' },
  { key: 'tenants', label: 'Tenants' },
]

interface TenantRow { id: string; name: string; slug: string; subscription_status: string; contact_email: string }
interface DeviceEventRow {
  id: string; user_id: string; tenant_id: string | null; event_type: string
  device_label: string | null; detail: string | null; acknowledged: boolean; created_at: string
}

/**
 * Supreme Admin console — SOW 3.3: this is the only place the device-binding
 * log is visible, with the alert feed and the suspend/reactivate/de-register
 * actions. Super Admins have no equivalent view.
 */
interface PlatformAnalytics {
  total_tenants: number
  active_tenants: number
  pending_onboarding_tenants: number
  suspended_tenants: number
  total_invoices: number
  total_quotations: number
  total_receipts: number
  platform_revenue_collected: number
}

export default function SupremeAdminDashboard() {
  const [tab, setTab] = useState<'overview' | 'tenants' | 'devices'>('overview')
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [events, setEvents] = useState<DeviceEventRow[]>([])
  const [unackOnly, setUnackOnly] = useState(true)
  const [stats, setStats] = useState<PlatformAnalytics | null>(null)

  useEffect(() => { apiFetch<PlatformAnalytics>('/analytics/platform').then(setStats).catch(() => {}) }, [])

  async function loadTenants() {
    setTenants(await apiFetch<TenantRow[]>('/admin/tenants'))
  }
  async function loadEvents() {
    setEvents(await apiFetch<DeviceEventRow[]>(`/admin/device-events?unacknowledged_only=${unackOnly}`))
  }

  useEffect(() => { loadTenants(); loadEvents() }, [unackOnly])

  async function acknowledge(id: string) {
    await apiFetch(`/admin/device-events/${id}/acknowledge`, { method: 'POST' })
    loadEvents()
  }
  async function suspend(userId: string) {
    await apiFetch(`/admin/users/${userId}/suspend`, { method: 'POST' })
    loadEvents()
  }
  async function reactivate(userId: string) {
    await apiFetch(`/admin/users/${userId}/reactivate`, { method: 'POST' })
    loadEvents()
  }
  async function deregister(userId: string) {
    await apiFetch(`/admin/users/${userId}/deregister-device`, { method: 'POST' })
    loadEvents()
  }

  return (
    <AppLayout brandSuffix="Supreme Admin" navItems={NAV_ITEMS} activeKey={tab} onNavigate={(key) => setTab(key as typeof tab)}>
        {tab === 'overview' && (
          <div className="card">
            <h2>Platform overview</h2>
            {!stats ? <p className="muted">Loading…</p> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                {([
                  ['Total tenants', stats.total_tenants],
                  ['Active tenants', stats.active_tenants],
                  ['Pending onboarding', stats.pending_onboarding_tenants],
                  ['Suspended tenants', stats.suspended_tenants],
                  ['Total invoices', stats.total_invoices],
                  ['Total quotations', stats.total_quotations],
                  ['Total receipts', stats.total_receipts],
                  ['Platform revenue collected', stats.platform_revenue_collected.toLocaleString()],
                ] as [string, string | number][]).map(([label, value]) => (
                  <div className="stat-tile" key={label}>
                    <div className="label">{label}</div>
                    <div className="value">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'devices' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Device-binding activity</h2>
              <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={unackOnly} onChange={(e) => setUnackOnly(e.target.checked)} />
                Unacknowledged only
              </label>
            </div>
            <p className="muted">
              Visible only here — Super Admins cannot see this log (SOW 3.3). A device change on any
              Super Admin credential appears below; suspend a credential directly if it looks wrong.
            </p>
            <table>
              <thead><tr><th>When</th><th>Event</th><th>Device</th><th>Detail</th><th></th></tr></thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{new Date(ev.created_at).toLocaleString()}</td>
                    <td>{ev.event_type.replaceAll('_', ' ')}</td>
                    <td>{ev.device_label || '—'}</td>
                    <td>{ev.detail}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!ev.acknowledged && <button className="btn secondary" onClick={() => acknowledge(ev.id)}>Acknowledge</button>}
                      {ev.event_type === 'login_blocked_other_device' && (
                        <>
                          <button className="btn warn" onClick={() => suspend(ev.user_id)}>Suspend credential</button>
                          <button className="btn secondary" onClick={() => deregister(ev.user_id)}>De-register device</button>
                        </>
                      )}
                      {ev.event_type === 'suspended_by_supreme_admin' && (
                        <button className="btn secondary" onClick={() => reactivate(ev.user_id)}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={5} className="muted">No events to show.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'tenants' && (
          <div className="card">
            <h2>Tenants</h2>
            <table>
              <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Contact</th></tr></thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td>{t.slug}</td><td>{t.subscription_status}</td><td>{t.contact_email}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AppLayout>
  )
}
