import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../lib/api'
import AppLayout, { type NavItem } from '../components/AppLayout'
import {
  DashboardCard, KpiCard, StatusChip, EmptyState, Icon, ICONS, CHART_COLORS,
  Modal, DetailRow,
} from '../components/DashboardUI'
import {
  SuperAdminsPage, SubscriptionPlansPage, CurrencyConfigPage,
  SubscriptionHistoryPage, PaymentSettingsPage, ReportsPage, CredentialsPage,
} from './supreme/SupremeExtras'

// Exact order of Smart Garage 360's Supreme Admin sidebar (Dashboard,
// Payment Settings, Reports, Super Admins, Subscription Plans, Currency
// Config, Subscription History, Credentials), with Device Alerts kept as a
// trailing Smart Billing-specific addition (SOW 3.3 device-binding log has
// no Smart Garage equivalent).
const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'payment-settings', label: 'Payment Settings' },
  { key: 'reports', label: 'Reports' },
  { key: 'super-admins', label: 'Super Admins' },
  { key: 'subscription-plans', label: 'Subscription Plans' },
  { key: 'currency-config', label: 'Currency Config' },
  { key: 'subscription-history', label: 'Subscription History' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'devices', label: 'Device Alerts' },
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
interface TenantRevenueRow {
  tenant_id: string
  name: string
  slug: string
  contact_email: string
  subscription_status: string
  created_at: string
  invoice_count: number
  quotation_count: number
  receipt_count: number
  revenue_collected: number
}
interface RevenueTrendPoint { year: number; month: number; label: string; revenue: number }

/**
 * Supreme Admin console — SOW 3.3: this is the only place the device-binding
 * log is visible, with the alert feed and the suspend/reactivate/de-register
 * actions. Super Admins have no equivalent view.
 *
 * Overview tab is the same "Analytics Command Center" template as Smart
 * Garage 360's Supreme Admin dashboard — filter bar (Year/Month + Export),
 * clickable KPI tiles with detail popups, a revenue-trend chart, a
 * tenant-comparison chart, and a click-through revenue auditing table —
 * rebuilt one-for-one with billing data (tenants stand in for franchisees,
 * invoices/quotations/receipts stand in for wash sessions).
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
  const [tab, setTab] = useState<
    'overview' | 'devices' | 'reports' | 'super-admins' |
    'subscription-plans' | 'currency-config' | 'subscription-history' |
    'payment-settings' | 'credentials'
  >('overview')
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [events, setEvents] = useState<DeviceEventRow[]>([])
  const [unackOnly, setUnackOnly] = useState(true)
  const [stats, setStats] = useState<PlatformAnalytics | null>(null)
  const [tenantRevenue, setTenantRevenue] = useState<TenantRevenueRow[]>([])
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([])

  useEffect(() => {
    apiFetch<PlatformAnalytics>('/analytics/platform').then(setStats).catch(() => {})
    apiFetch<TenantRevenueRow[]>('/analytics/platform/tenants').then(setTenantRevenue).catch(() => {})
    apiFetch<RevenueTrendPoint[]>('/analytics/platform/revenue-trend').then(setRevenueTrend).catch(() => {})
  }, [])

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
      {tab === 'overview' && (
        <PlatformCommandCenter
          stats={stats}
          tenants={tenants}
          tenantRevenue={tenantRevenue}
          revenueTrend={revenueTrend}
          onSelectTenants={() => setTab('super-admins')}
        />
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
          <div className="table-scroll">
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
        </div>
      )}

      {tab === 'reports' && <ReportsPage />}
      {tab === 'super-admins' && <SuperAdminsPage />}
      {tab === 'subscription-plans' && <SubscriptionPlansPage />}
      {tab === 'currency-config' && <CurrencyConfigPage />}
      {tab === 'subscription-history' && <SubscriptionHistoryPage />}
      {tab === 'payment-settings' && <PaymentSettingsPage />}
      {tab === 'credentials' && <CredentialsPage />}
    </AppLayout>
  )
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function PlatformCommandCenter({
  stats, tenants, tenantRevenue, revenueTrend, onSelectTenants,
}: {
  stats: PlatformAnalytics | null
  tenants: TenantRow[]
  tenantRevenue: TenantRevenueRow[]
  revenueTrend: RevenueTrendPoint[]
  onSelectTenants: () => void
}) {
  const [selectedYear, setSelectedYear] = useState('All')
  const [selectedMonth, setSelectedMonth] = useState('All')
  const [statModal, setStatModal] = useState<'tenants' | 'revenue' | 'documents' | 'attention' | null>(null)
  const [selectedTenant, setSelectedTenant] = useState<(TenantRevenueRow & { rank: number }) | null>(null)

  const years = useMemo(() => {
    const set = new Set(revenueTrend.map((p) => p.year))
    return [...set].sort((a, b) => b - a)
  }, [revenueTrend])

  const filteredTrend = useMemo(() => {
    return revenueTrend.filter((p) => {
      if (selectedYear !== 'All' && p.year !== Number(selectedYear)) return false
      if (selectedMonth !== 'All' && p.month !== Number(selectedMonth)) return false
      return true
    })
  }, [revenueTrend, selectedYear, selectedMonth])

  const periodRevenue = useMemo(() => filteredTrend.reduce((a, p) => a + p.revenue, 0), [filteredTrend])

  const tenantRevenueSorted = useMemo(
    () => [...tenantRevenue].sort((a, b) => b.revenue_collected - a.revenue_collected),
    [tenantRevenue],
  )
  const topTenantsForChart = useMemo(
    () => tenantRevenueSorted.filter((t) => t.revenue_collected > 0).slice(0, 8),
    [tenantRevenueSorted],
  )

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

  const tenantsNeedingAttention = useMemo(
    () => tenants.filter((t) => t.subscription_status === 'suspended' || t.subscription_status === 'pending_onboarding'),
    [tenants],
  )

  function handlePrint() {
    window.print()
  }

  if (!stats) return <div className="card"><p className="muted">Loading platform overview…</p></div>

  return (
    <>
      {/* Filter panel — Year / Month auditing filter + Export, exactly like Smart Garage's Supreme Admin filter card */}
      <DashboardCard accent="var(--accent-2)" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '-0.02em' }}>Supreme Admin Analytics Command Center</h2>
            <p className="muted" style={{ margin: '3px 0 0' }}>Cross-tenant revenue auditing and platform performance reporting</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 140, marginBottom: 0 }}>
              <label>Auditing year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                <option value="All">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 160, marginBottom: 0 }}>
              <label>Auditing month</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                <option value="All">All months</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <button className="btn secondary" onClick={handlePrint}>⬇ Export PDF / Print</button>
          </div>
        </div>
      </DashboardCard>

      {/* Filtered KPI cards — each opens a detail breakdown, like Smart Garage's supreme summary cards */}
      <div className="kpi-grid">
        <KpiCard
          icon={<Icon path={ICONS.building} size={18} />}
          label="Tenants"
          value={stats.total_tenants}
          sub={`${stats.active_tenants} active`}
          color="var(--accent)"
          onClick={() => setStatModal('tenants')}
        />
        <KpiCard
          icon={<Icon path={ICONS.revenue} size={18} />}
          label="Platform revenue"
          value={periodRevenue.toLocaleString()}
          sub={selectedYear === 'All' && selectedMonth === 'All' ? 'all time' : `${selectedMonth === 'All' ? 'All months' : MONTHS[Number(selectedMonth) - 1]} ${selectedYear === 'All' ? '· all years' : selectedYear}`}
          color="var(--green)"
          onClick={() => setStatModal('revenue')}
        />
        <KpiCard
          icon={<Icon path={ICONS.invoice} size={18} />}
          label="Documents issued"
          value={stats.total_invoices + stats.total_quotations + stats.total_receipts}
          sub={`${stats.total_invoices} invoices · ${stats.total_quotations} quotations · ${stats.total_receipts} receipts`}
          color="var(--accent-2)"
          onClick={() => setStatModal('documents')}
        />
        <KpiCard
          icon={<Icon path={ICONS.alert} size={18} />}
          label="Needs attention"
          value={tenantsNeedingAttention.length}
          sub="suspended or pending onboarding"
          color="var(--red)"
          onClick={() => setStatModal('attention')}
        />
      </div>

      {/* Analytical charts row — Revenue Trend area chart + Tenant Revenue Comparison bar chart */}
      <div className="chart-grid-2">
        <DashboardCard title={`Revenue trend (${selectedYear === 'All' ? 'all years' : selectedYear}${selectedMonth === 'All' ? '' : ` · ${MONTHS[Number(selectedMonth) - 1]}`})`}>
          {filteredTrend.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.revenue} size={22} />} title="No matching receipts" sub="Try expanding your Year or Month filters" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={filteredTrend}>
                <defs>
                  <linearGradient id="platformRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: 'var(--text)' }} />
                <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} fill="url(#platformRevenueGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </DashboardCard>

        <DashboardCard title="Tenant revenue comparison" subtitle="All-time revenue collected, top tenants">
          {topTenantsForChart.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.building} size={22} />} title="No tenant revenue yet" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topTenantsForChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'var(--bg-3)' }} />
                <defs>
                  <linearGradient id="tenantBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-2)" />
                    <stop offset="100%" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
                <Bar dataKey="revenue_collected" name="Revenue" fill="url(#tenantBarGrad)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DashboardCard>
      </div>

      {/* Tenant status mix — extra chart carried over from the previous build, kept for context */}
      <div className="chart-grid-2">
        <DashboardCard title="Tenant status mix" subtitle="Where every workspace stands right now">
          {statusDist.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.users} size={22} />} title="No tenants yet" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={70} strokeWidth={0} paddingAngle={2}>
                  {statusDist.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </DashboardCard>

        <DashboardCard title="Needs attention" subtitle="Suspended or still onboarding" action={<button className="btn ghost" onClick={onSelectTenants}>See all →</button>}>
          {tenantsNeedingAttention.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.building} size={22} />} title="Nothing needs attention" sub="Every tenant is active." />
          ) : (
            <div>
              {tenantsNeedingAttention.slice(0, 5).map((t) => (
                <div className="leaderboard-row" key={t.id}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{t.name}</div>
                    <div className="muted">{t.contact_email}</div>
                  </div>
                  <StatusChip status={t.subscription_status} />
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      {/* Tenant Revenue Auditing Table — the platform equivalent of the Branch/Franchisee leaderboard */}
      <DashboardCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Tenant Revenue Auditing Table</h3>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Sorted by highest revenue</span>
        </div>
        {tenantRevenueSorted.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.building} size={22} />} title="No tenants registered" />
        ) : (
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tenant</th><th>Contact</th><th>Documents</th><th>Total revenue</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tenantRevenueSorted.map((t, idx) => (
                <tr key={t.tenant_id} style={{ cursor: 'pointer' }} onClick={() => setSelectedTenant({ ...t, rank: idx + 1 })}>
                  <td>
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                    {idx === 0 && t.revenue_collected > 0 && (
                      <span className="status-chip status-chip-amber" style={{ marginLeft: 8 }}>★ Rank #1</span>
                    )}
                  </td>
                  <td>{t.contact_email}</td>
                  <td>{t.invoice_count + t.quotation_count + t.receipt_count} docs</td>
                  <td style={{ fontWeight: 800, color: 'var(--green)' }}>{t.revenue_collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td><StatusChip status={t.subscription_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>

      {/* Tenant detail popup — clicked row from the auditing table */}
      <Modal title={selectedTenant?.name} open={!!selectedTenant} onClose={() => setSelectedTenant(null)} maxWidth={520}>
        {selectedTenant && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{selectedTenant.slug}</span>
              <StatusChip status={selectedTenant.subscription_status} />
              {selectedTenant.rank === 1 && selectedTenant.revenue_collected > 0 && <span className="status-chip status-chip-amber">★ Rank #1</span>}
            </div>
            <DetailRow label="Contact" value={selectedTenant.contact_email} />
            <DetailRow label="Onboarded" value={new Date(selectedTenant.created_at).toLocaleDateString()} />
            <DetailRow label="Invoices" value={selectedTenant.invoice_count} />
            <DetailRow label="Quotations" value={selectedTenant.quotation_count} />
            <DetailRow label="Receipts" value={selectedTenant.receipt_count} />
            <DetailRow label="Total revenue" value={selectedTenant.revenue_collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} strong />
          </div>
        )}
      </Modal>

      {/* Stat-card detail popups */}
      <Modal title="Tenants" open={statModal === 'tenants'} onClose={() => setStatModal(null)} maxWidth={520}>
        <DetailRow label="Active" value={stats.active_tenants} />
        <DetailRow label="Pending onboarding" value={stats.pending_onboarding_tenants} />
        <DetailRow label="Suspended" value={stats.suspended_tenants} />
        <DetailRow label="Total" value={stats.total_tenants} strong />
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>All tenants</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {tenants.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                <StatusChip status={t.subscription_status} />
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal title="Platform revenue" open={statModal === 'revenue'} onClose={() => setStatModal(null)} maxWidth={520}>
        <DetailRow label="Revenue in period" value={periodRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} strong />
        <DetailRow label="Period" value={`${selectedMonth === 'All' ? 'All months' : MONTHS[Number(selectedMonth) - 1]} · ${selectedYear === 'All' ? 'All years' : selectedYear}`} />
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Top tenants by all-time revenue</div>
          {topTenantsForChart.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>No revenue recorded yet.</div>
          ) : topTenantsForChart.map((t) => (
            <div key={t.tenant_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{t.revenue_collected.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title="Documents issued" open={statModal === 'documents'} onClose={() => setStatModal(null)} maxWidth={480}>
        <DetailRow label="Invoices" value={stats.total_invoices} />
        <DetailRow label="Quotations" value={stats.total_quotations} />
        <DetailRow label="Receipts" value={stats.total_receipts} />
        <DetailRow label="Total" value={stats.total_invoices + stats.total_quotations + stats.total_receipts} strong />
      </Modal>

      <Modal title="Needs attention" open={statModal === 'attention'} onClose={() => setStatModal(null)} maxWidth={520}>
        {tenantsNeedingAttention.length === 0 ? (
          <p className="muted">Every tenant is active — nothing needs attention right now.</p>
        ) : (
          tenantsNeedingAttention.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 10px', background: 'var(--bg-3)', borderRadius: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {t.contact_email}</span></span>
              <StatusChip status={t.subscription_status} />
            </div>
          ))
        )}
      </Modal>
    </>
  )
}
