import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../lib/api'
import AppLayout, { type NavItem } from '../components/AppLayout'
import { DashboardCard, KpiCard, StatusChip, EmptyState, Icon, ICONS, CHART_COLORS } from '../components/DashboardUI'

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'devices', label: 'Device alerts' },
  { key: 'tenants', label: 'Tenants' },
]

interface TenantRow {
  id: string
  name: string
  slug: string
  subscription_status: string
  contact_email: string
  created_at: string
}
interface DeviceEventRow {
  id: string; user_id: string; tenant_id: string | null; event_type: string
  device_label: string | null; detail: string | null; acknowledged: boolean; created_at: string
}

/**
 * Supreme Admin console — SOW 3.3: this is the only place the device-binding
 * log is visible, with the alert feed and the suspend/reactivate/de-register
 * actions. Super Admins have no equivalent view.
 *
 * Overview tab is a platform-wide command center in the Smart Garage 360
 * dashboard language (KPI tiles, distribution + growth charts, a tenant
 * leaderboard) built entirely from real analytics and tenant data — no
 * fabricated figures.
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

  const unacknowledgedCount = events.filter((e) => !e.acknowledged).length

  return (
    <AppLayout
      brandSuffix="Supreme Admin"
      navItems={NAV_ITEMS}
      activeKey={tab}
      onNavigate={(key) => setTab(key as typeof tab)}
      topbarExtra={unacknowledgedCount > 0 ? <span className="status-chip status-chip-red">{unacknowledgedCount} unread alert{unacknowledgedCount === 1 ? '' : 's'}</span> : undefined}
    >
      {tab === 'overview' && <PlatformOverview stats={stats} tenants={tenants} onSelectTenants={() => setTab('tenants')} />}

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
            <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Contact</th><th>Onboarded</th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.slug}</td>
                  <td><StatusChip status={t.subscription_status} /></td>
                  <td>{t.contact_email}</td>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {tenants.length === 0 && <tr><td colSpan={5} className="muted">No tenants yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  )
}

function PlatformOverview({ stats, tenants, onSelectTenants }: { stats: PlatformAnalytics | null; tenants: TenantRow[]; onSelectTenants: () => void }) {
  const statusDist = useMemo(() => {
    if (!stats) return []
    const cancelled = Math.max(0, stats.total_tenants - stats.active_tenants - stats.pending_onboarding_tenants - stats.suspended_tenants)
    return [
      { name: 'Active', value: stats.active_tenants, color: CHART_COLORS.green },
      { name: 'Pending onboarding', value: stats.pending_onboarding_tenants, color: CHART_COLORS.amber },
      { name: 'Suspended', value: stats.suspended_tenants, color: CHART_COLORS.red },
      { name: 'Cancelled', value: cancelled, color: 'var(--text-3)' },
    ].filter((s) => s.value > 0)
  }, [stats])

  const documentMix = useMemo(() => {
    if (!stats) return []
    return [
      { name: 'Invoices', count: stats.total_invoices },
      { name: 'Quotations', count: stats.total_quotations },
      { name: 'Receipts', count: stats.total_receipts },
    ]
  }, [stats])

  const growth = useMemo(() => {
    if (tenants.length === 0) return []
    const buckets = new Map<string, number>()
    tenants.forEach((t) => {
      const d = new Date(t.created_at)
      const key = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      buckets.set(key, (buckets.get(key) || 0) + 1)
    })
    const sorted = [...tenants].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const seen = new Set<string>()
    let cumulative = 0
    const points: { name: string; tenants: number }[] = []
    sorted.forEach((t) => {
      const key = new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      if (!seen.has(key)) {
        seen.add(key)
        cumulative += buckets.get(key) || 0
        points.push({ name: key, tenants: cumulative })
      }
    })
    return points
  }, [tenants])

  const recentTenants = useMemo(
    () => [...tenants].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [tenants],
  )

  if (!stats) return <div className="card"><p className="muted">Loading platform overview…</p></div>

  return (
    <>
      <div className="command-bar">
        <div>
          <h2 style={{ margin: 0 }}>Platform Command Center</h2>
          <p className="muted" style={{ margin: '3px 0 0' }}>Cross-tenant health, revenue, and onboarding activity across every Smart Billing workspace.</p>
        </div>
        <div className="command-bar-actions">
          <button className="btn secondary" onClick={onSelectTenants}>View all tenants</button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard icon={<Icon path={ICONS.building} size={18} />} label="Total tenants" value={stats.total_tenants} sub={`${stats.active_tenants} active`} color="var(--accent)" onClick={onSelectTenants} />
        <KpiCard icon={<Icon path={ICONS.revenue} size={18} />} label="Platform revenue collected" value={stats.platform_revenue_collected.toLocaleString()} sub="across all tenants" color="var(--green)" />
        <KpiCard icon={<Icon path={ICONS.clock} size={18} />} label="Pending onboarding" value={stats.pending_onboarding_tenants} sub="awaiting branding step" color="var(--amber)" />
        <KpiCard icon={<Icon path={ICONS.alert} size={18} />} label="Suspended tenants" value={stats.suspended_tenants} sub="access currently blocked" color="var(--red)" />
      </div>

      <div className="chart-grid-2">
        <DashboardCard title="Tenant growth" subtitle="Cumulative workspaces onboarded to Smart Billing over time">
          {growth.length < 2 ? (
            <EmptyState icon={<Icon path={ICONS.building} size={22} />} title="Not enough history yet" sub="The growth trend fills in as more tenants sign up." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={growth}>
                <defs>
                  <linearGradient id="tenantGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: 'var(--text)' }} />
                <Area type="monotone" dataKey="tenants" stroke="var(--accent)" strokeWidth={2} fill="url(#tenantGrowthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </DashboardCard>

        <DashboardCard title="Tenant status mix" subtitle="Where every workspace stands right now">
          {statusDist.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.users} size={22} />} title="No tenants yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={80} strokeWidth={0} paddingAngle={2}>
                  {statusDist.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardCard>
      </div>

      <div className="chart-grid-2">
        <DashboardCard title="Document volume" subtitle="Invoices, quotations, and receipts issued platform-wide">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={documentMix}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'var(--bg-3)' }} />
              <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardCard>

        <DashboardCard title="Recently onboarded" subtitle="Latest tenants to join the platform" action={<button className="btn ghost" onClick={onSelectTenants}>See all →</button>}>
          {recentTenants.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.building} size={22} />} title="No tenants yet" />
          ) : (
            <div>
              {recentTenants.map((t, i) => (
                <div className="leaderboard-row" key={t.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span className="rank-badge">{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      <div className="muted">{new Date(t.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <StatusChip status={t.subscription_status} />
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </>
  )
}
