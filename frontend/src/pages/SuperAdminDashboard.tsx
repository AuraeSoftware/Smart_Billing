import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, CartesianGrid, XAxis, YAxis,
} from 'recharts'
import { apiFetch, ApiError } from '../lib/api'
import { getCached, isOnline, queueOfflineCreate, syncAll, type DocType } from '../lib/offlineStore'
import { useAuth } from '../lib/auth'
import SyncStatusBadge from '../components/SyncStatusBadge'
import AppLayout, { type NavItem } from '../components/AppLayout'
import { DashboardCard, KpiCard, StatusChip, EmptyState, Icon, ICONS, CHART_COLORS, IconButton, Modal } from '../components/DashboardUI'
import Settings from './Settings'
import {
  MyPlanPage, TenantCredentialsPage, CustomersPage, TeamPage, CatalogPage,
  GstManagerPage, TenantReportsPage,
} from './superadmin/SuperAdminExtras'

// Same pattern as the Supreme Admin sidebar — the real Smart Garage 360
// Super Admin nav, each item mapped to its billing equivalent. Payment
// Settings is deliberately excluded: tenants settle their own subscription
// with Aurae directly, and there's no per-customer checkout to gate here.
const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: 'grid' },
  { key: 'invoices', label: 'Invoices', icon: 'invoice' },
  { key: 'quotations', label: 'Quotations', icon: 'quotation' },
  { key: 'receipts', label: 'Receipts', icon: 'receipt' },
  { key: 'customers', label: 'Customers', icon: 'users' },
  { key: 'team', label: 'Team', icon: 'users' },
  { key: 'catalog', label: 'Catalog', icon: 'package' },
  { key: 'reports', label: 'Reports', icon: 'barChart' },
  { key: 'my-plan', label: 'My Plan', icon: 'star' },
  { key: 'gst-manager', label: 'GST Manager', icon: 'percent' },
  { key: 'credentials', label: 'Credentials', icon: 'key' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]

// SB09: 'team', 'catalog', and 'gst-manager' call endpoints the backend
// already restricts to the Super Admin role (require_super_admin in
// catalog.py, gst.py, users.py) — a Team member (tenant_user) could still
// see these tabs and would just hit a 403 on every action. Nothing server
// side changes; this only keeps the nav from offering tabs that role can't
// use. All other tabs call require_tenant_staff and stay available to both
// roles, unchanged.
const SUPER_ADMIN_ONLY_KEYS = new Set(['team', 'catalog', 'gst-manager'])

interface LineItem { description: string; quantity: number; unit_price: number; tax_rate_percent: number; discount_percent: number }

interface InvoiceRow { id: string; number: string; customer_name: string; status: string; grand_total: number; amount_paid: number; issue_date: string; due_date?: string | null; notes?: string | null; is_overdue?: boolean; customer_id?: string | null; customer_email?: string | null; customer_phone?: string | null; customer_address?: string | null; items?: LineItem[] }
interface QuotationRow { id: string; number: string; customer_name: string; customer_email?: string | null; customer_phone?: string | null; customer_address?: string | null; status: string; grand_total: number; issue_date: string; valid_until?: string | null; notes?: string | null }
interface ReceiptRow { id: string; number: string; invoice_id: string; amount: number; payment_method?: string | null; payment_reference?: string | null; notes?: string | null; received_at: string }

const emptyItem = (): LineItem => ({ description: '', quantity: 1, unit_price: 0, tax_rate_percent: 0, discount_percent: 0 })

export default function SuperAdminDashboard() {
  const { session } = useAuth()
  const [tab, setTab] = useState<
    'overview' | 'invoices' | 'quotations' | 'receipts' | 'customers' | 'team' | 'catalog' |
    'reports' | 'settings' | 'my-plan' | 'gst-manager' | 'credentials'
  >('overview')
  // Set by the Overview tab's "+ New invoice" quick action (the billing
  // equivalent of Smart Garage's "+ Assign Job" action bar button) so the
  // Invoices tab opens with the create-invoice form already expanded.
  const [openInvoiceForm, setOpenInvoiceForm] = useState(false)
  // SB04: set by the Customers tab's "+ New invoice" action (row button or
  // detail panel) so the Invoices tab opens with the create form expanded
  // and this customer already filled in — the same auto-open channel the
  // Overview quick action already uses, just also carrying a name.
  const [prefillCustomerName, setPrefillCustomerName] = useState<string | null>(null)

  const navItems = useMemo(
    () => session?.role === 'tenant_user' ? NAV_ITEMS.filter((item) => !SUPER_ADMIN_ONLY_KEYS.has(item.key)) : NAV_ITEMS,
    [session?.role],
  )

  // Plan validity. Once the plan has expired the whole dashboard is locked:
  // login still works, but only the plan / upgrade screen is available (the
  // backend refuses every other tenant request too).
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null)
  const loadPlanStatus = () => { apiFetch<PlanStatus>('/account/plan-status').then(setPlanStatus).catch(() => {}) }
  useEffect(() => { loadPlanStatus() }, [])
  const locked = !!planStatus?.expired

  useEffect(() => {
    // Pull the full document history into the offline cache on load, then
    // periodically while online (SOW 3.5).
    if (locked) return
    if (isOnline()) syncAll().catch(() => {})
    const interval = setInterval(() => { if (isOnline()) syncAll().catch(() => {}) }, 60_000)
    return () => clearInterval(interval)
  }, [locked])

  if (locked) {
    const canUpgrade = session?.role === 'super_admin'
    return (
      <AppLayout
        navItems={canUpgrade ? [{ key: 'my-plan', label: 'Plan & Upgrade', icon: 'star' }] : []}
        activeKey="my-plan"
        onNavigate={() => {}}
      >
        <div style={{ background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid var(--red)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: 'var(--red)', marginBottom: 4 }}>Your plan has expired</div>
          <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
            {planStatus?.plan_name ? `${planStatus.plan_name} ended on ${planStatus.expires_at}. ` : ''}
            The dashboard is locked until you renew. Your invoices, quotations, receipts and customers are safe. They will be back as soon as your renewal is approved.
          </div>
          {!canUpgrade && <div style={{ fontSize: 14, marginTop: 8 }}>Please ask your workspace owner (Super Admin) to renew the plan.</div>}
        </div>
        {canUpgrade && <MyPlanPage onPlanChanged={loadPlanStatus} />}
      </AppLayout>
    )
  }

  return (
    <AppLayout
      navItems={navItems}
      activeKey={tab}
      onNavigate={(key) => setTab(key as typeof tab)}
      topbarExtra={<SyncStatusBadge />}
    >
      {/* Shown on every tab — a workspace stuck in onboarding, or close to
          its plan's monthly invoice limit, needs to see this wherever they
          are, not just on Overview. */}
      {session?.tenantStatus === 'pending_onboarding' && (
        <div style={{ background: 'var(--highlight-dim)', border: '1px solid var(--amber)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 2 }}>Finish setting up your workspace</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Upload your logo, header and footer to start creating invoices, quotations and receipts.</div>
          </div>
          <a className="btn amber" href={`/subscribe/${session.tenantId}/branding`}>Finish setup</a>
        </div>
      )}
      {planStatus && !planStatus.expired && planStatus.days_left != null && planStatus.days_left <= 7 && (
        <div style={{ background: 'color-mix(in srgb, var(--red) 8%, transparent)', border: '1px solid var(--red)', borderRadius: 12, padding: '12px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, color: 'var(--red)' }}>
              {planStatus.is_trial ? 'Your free trial ends' : 'Your plan ends'} {planStatus.days_left === 0 ? 'today' : `in ${planStatus.days_left} day${planStatus.days_left === 1 ? '' : 's'}`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {planStatus.pending_request ? 'Your upgrade request is awaiting approval.' : 'Upgrade now to keep your dashboard running without a break.'}
            </div>
          </div>
          {session?.role === 'super_admin' && !planStatus.pending_request && <button className="btn amber" onClick={() => setTab('my-plan')}>Upgrade plan</button>}
        </div>
      )}
      <UsageBanner />

      {tab === 'overview' && (
        <OverviewPanel
          onNav={(key) => setTab(key)}
          onQuickNewInvoice={() => { setOpenInvoiceForm(true); setTab('invoices') }}
        />
      )}
      {tab === 'invoices' && (
        <InvoicesPanel
          autoOpen={openInvoiceForm}
          onAutoOpenHandled={() => setOpenInvoiceForm(false)}
          prefillCustomerName={prefillCustomerName}
          onPrefillHandled={() => setPrefillCustomerName(null)}
        />
      )}
      {tab === 'quotations' && <QuotationsPanel />}
      {tab === 'receipts' && <ReceiptsPanel />}
      {tab === 'customers' && (
        <CustomersPage onCreateInvoice={(name) => { setPrefillCustomerName(name); setOpenInvoiceForm(true); setTab('invoices') }} />
      )}
      {tab === 'team' && <TeamPage />}
      {tab === 'catalog' && <CatalogPage />}
      {tab === 'reports' && <TenantReportsPage />}
      {tab === 'my-plan' && <MyPlanPage onPlanChanged={loadPlanStatus} />}
      {tab === 'gst-manager' && <GstManagerPage />}
      {tab === 'credentials' && <TenantCredentialsPage />}
      {tab === 'settings' && <Settings />}
    </AppLayout>
  )
}

interface PlanStatus {
  plan_name: string | null
  is_trial: boolean
  expires_at: string | null
  days_left: number | null
  expired: boolean
  pending_request: boolean
}

interface TenantAnalytics {
  invoice_count: number
  quotation_count: number
  receipt_count: number
  outstanding_receivables: number
  revenue_collected: number
  overdue_invoice_count: number
  overdue_amount: number
  last_30_days_revenue: number
}

interface UsageInfo {
  plan_name: string | null
  invoices_used: number
  invoices_limit: number | null
  usage_percent: number
  days_until_reset: number
  warning_level: 'none' | 'warning' | 'critical' | 'limit_reached'
}

const USAGE_COPY: Record<string, { title: string; color: string }> = {
  warning: { title: 'Approaching your monthly invoice limit', color: 'var(--amber)' },
  critical: { title: 'Nearly at your monthly invoice limit', color: 'var(--red)' },
  limit_reached: { title: 'Monthly invoice limit reached', color: 'var(--red)' },
}

/**
 * Usage-limit warning, shown ahead of the actual cutoff so a Super Admin
 * isn't surprised mid-invoice — at 80% a heads-up, at 95% urgent, and at
 * 100% a plain statement that new invoices are blocked until next month
 * (the server enforces the block itself; this is the reminder).
 */
function UsageBanner() {
  const { session } = useAuth()
  const [usage, setUsage] = useState<UsageInfo | null>(null)

  useEffect(() => {
    if (session?.role !== 'super_admin') return
    apiFetch<UsageInfo>('/account/usage').then(setUsage).catch(() => {})
  }, [session?.role])

  if (!usage || usage.warning_level === 'none' || !usage.invoices_limit) return null
  const copy = USAGE_COPY[usage.warning_level]

  return (
    <div style={{ background: 'var(--accent-dim)', border: `1px solid ${copy.color}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 800, color: copy.color, marginBottom: 2 }}>{copy.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text)' }}>{usage.invoices_used}/{usage.invoices_limit}</strong> invoices used this month on the {usage.plan_name} plan
          {usage.warning_level === 'limit_reached'
            ? ' — new invoices are blocked until it resets.'
            : ` — resets in ${usage.days_until_reset} day${usage.days_until_reset === 1 ? '' : 's'}.`}
          {' '}Contact Aurae Software Solutions to upgrade your plan.
        </div>
      </div>
    </div>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS_PIE_COLORS: Record<string, string> = {
  draft: 'var(--text-3)', sent: CHART_COLORS.blue, viewed: CHART_COLORS.blue,
  paid: CHART_COLORS.green, partially_paid: CHART_COLORS.amber, overdue: CHART_COLORS.red, cancelled: 'var(--text-3)',
}

function OverviewPanel({ onNav, onQuickNewInvoice }: { onNav: (key: 'invoices' | 'quotations' | 'receipts') => void; onQuickNewInvoice: () => void }) {
  const [stats, setStats] = useState<TenantAnalytics | null>(null)
  const { items: invoices } = useDocList<InvoiceRow>('invoices')
  const { items: quotations } = useDocList<QuotationRow>('quotations')
  const { items: receipts } = useDocList<ReceiptRow>('receipts')
  useEffect(() => { apiFetch<TenantAnalytics>('/analytics/tenant').then(setStats).catch(() => {}) }, [])

  // Revenue by day of week — the billing equivalent of Smart Garage's
  // "Revenue by Day of Week" chart, built from the same receipts data.
  const weeklyRevenue = useMemo(() => {
    const buckets = WEEKDAYS.map((day) => ({ day, revenue: 0 }))
    receipts.forEach((r) => {
      const i = new Date(r.received_at).getDay()
      buckets[i].revenue += Number(r.amount)
    })
    return buckets
  }, [receipts])

  const invoiceStatusDist = useMemo(() => {
    if (invoices.length === 0) return []
    const counts = new Map<string, number>()
    invoices.forEach((inv) => counts.set(inv.status, (counts.get(inv.status) || 0) + 1))
    return [...counts.entries()].map(([name, value]) => ({ name: name.replaceAll('_', ' '), value, color: STATUS_PIE_COLORS[name] || 'var(--text-3)' }))
  }, [invoices])

  const recentInvoices = useMemo(
    () => [...invoices].sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()).slice(0, 6),
    [invoices],
  )

  const pendingQuotations = quotations.filter((q) => q.status === 'sent')
  const convertedQuotations = quotations.filter((q) => q.status === 'converted')

  if (!stats) return <div className="card"><p className="muted">Loading overview…</p></div>

  return (
    <>
      {/* Overdue invoices alert — the billing equivalent of Smart Garage's
          "Session Limit Reached" banner. */}
      {stats.overdue_invoice_count > 0 && (
        <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--red)', borderRadius: 12, padding: '16px 20px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
              <Icon path={ICONS.alert} size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--red)', marginBottom: 2 }}>Overdue invoices need attention</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {/* Stated as two separate figures on purpose: overdue_amount is
                    the part of outstanding_receivables that's actually past due,
                    not a number alongside it — "900 of 1,840.80", not "900 and
                    1,840.80" read as unrelated totals. */}
                <strong style={{ color: 'var(--text)' }}>{stats.overdue_invoice_count} invoice{stats.overdue_invoice_count === 1 ? '' : 's'}</strong> past due, worth <strong style={{ color: 'var(--text)' }}>{stats.overdue_amount.toLocaleString()}</strong> of your {stats.outstanding_receivables.toLocaleString()} total outstanding receivables.
              </div>
            </div>
          </div>
          <button className="btn warn" onClick={() => onNav('invoices')}>Review invoices</button>
        </div>
      )}

      {/* Quotations awaiting response — the billing equivalent of Smart Garage's expiry alert. */}
      {pendingQuotations.length > 0 && (
        <div style={{ background: 'var(--highlight-dim)', border: '1px solid var(--amber)', borderRadius: 12, padding: '16px 20px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
              <Icon path={ICONS.quotation} size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--amber)', marginBottom: 2 }}>Quotations awaiting a response</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                <strong style={{ color: 'var(--text)' }}>{pendingQuotations.length} quotation{pendingQuotations.length === 1 ? '' : 's'}</strong> sent to customers with no accept/decline yet — a nudge could move them along.
              </div>
            </div>
          </div>
          <button className="btn secondary" onClick={() => onNav('quotations')}>Review quotations</button>
        </div>
      )}

      {/* Action bar — the billing equivalent of Smart Garage's "+ Assign Job" quick action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={onQuickNewInvoice}>
          <Icon path={ICONS.invoice} size={15} /> New invoice
        </button>
      </div>

      <div className="kpi-grid">
        <KpiCard icon={<Icon path={ICONS.revenue} size={18} />} label="Total revenue" value={stats.revenue_collected.toLocaleString()} sub={`${stats.last_30_days_revenue.toLocaleString()} in the last 30 days`} color="var(--accent)" onClick={() => onNav('receipts')} />
        <KpiCard icon={<Icon path={ICONS.invoice} size={18} />} label="Total invoices" value={stats.invoice_count} sub={`${stats.overdue_invoice_count} overdue`} color="var(--accent-2)" onClick={() => onNav('invoices')} />
        <KpiCard icon={<Icon path={ICONS.alert} size={18} />} label="Outstanding receivables" value={stats.outstanding_receivables.toLocaleString()} sub="not yet collected" color="var(--green)" onClick={() => onNav('invoices')} />
      </div>

      {/* Charts row — Revenue by Day of Week + Invoice Status Split, matching Smart Garage's 3:2 split */}
      <div className="chart-grid-2">
        <DashboardCard title="Revenue by day of week">
          {receipts.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.revenue} size={22} />} title="No receipts yet" sub="Record payments to see revenue data" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} cursor={{ fill: 'var(--bg-3)' }} />
                <defs>
                  <linearGradient id="weeklyBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="100%" stopColor="var(--accent-2)" />
                  </linearGradient>
                </defs>
                <Bar dataKey="revenue" fill="url(#weeklyBarGrad)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </DashboardCard>

        <DashboardCard title="Invoice status split">
          {invoiceStatusDist.length === 0 ? (
            <EmptyState icon={<Icon path={ICONS.invoice} size={22} />} title="No invoices yet" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={invoiceStatusDist} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" strokeWidth={0}>
                    {invoiceStatusDist.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v} invoices`} contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              {invoiceStatusDist.map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, textTransform: 'capitalize' }}>{s.name}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{s.value}</span>
                </div>
              ))}
            </>
          )}
        </DashboardCard>
      </div>

      {/* Two-column stats row — the billing equivalent of Smart Garage's Loyalty Stats + Loyalty Config row */}
      <div className="chart-grid-2">
        <DashboardCard title="Collections stats" accent="var(--green)">
          {[
            ['Overdue invoices', stats.overdue_invoice_count, 'var(--red)'],
            ['Receipts recorded', stats.receipt_count, 'var(--accent-2)'],
            ['Revenue, last 30 days', stats.last_30_days_revenue.toLocaleString(), 'var(--green)'],
          ].map(([l, v, c]) => (
            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-2)' }}>{l}</span>
              <span style={{ fontWeight: 800, color: c as string }}>{v}</span>
            </div>
          ))}
          <button className="btn ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => onNav('receipts')}>View receipts →</button>
        </DashboardCard>

        <DashboardCard title="Quotation pipeline" accent="var(--blue)">
          {[
            ['Total quotations', stats.quotation_count, 'var(--text)'],
            ['Awaiting response', pendingQuotations.length, 'var(--amber)'],
            ['Converted to invoice', convertedQuotations.length, 'var(--green)'],
          ].map(([l, v, c]) => (
            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-2)' }}>{l}</span>
              <span style={{ fontWeight: 800, color: c as string }}>{v}</span>
            </div>
          ))}
          <button className="btn ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => onNav('quotations')}>View quotations →</button>
        </DashboardCard>
      </div>

      {/* Recent invoices — the billing equivalent of Smart Garage's Recent Sessions table */}
      <DashboardCard title="Recent invoices" action={<button className="btn ghost" onClick={() => onNav('invoices')}>View all →</button>}>
        {recentInvoices.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.invoice} size={22} />} title="No invoices yet" sub="New invoices you create will show up here first." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th>Paid</th><th>Issued</th></tr></thead>
            <tbody>
              {recentInvoices.map((inv) => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => onNav('invoices')}>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{inv.number}</td>
                  <td>{inv.customer_name}</td>
                  <td><StatusChip status={inv.status} /></td>
                  <td style={{ fontWeight: 700 }}>{inv.grand_total.toLocaleString()}</td>
                  <td style={{ color: 'var(--text-2)' }}>{inv.amount_paid.toLocaleString()}</td>
                  <td>{new Date(inv.issue_date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>
    </>
  )
}

function useDocList<T>(docType: DocType) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    try {
      if (isOnline()) {
        const fresh = await apiFetch<T[]>(`/${docType}`)
        setItems(fresh)
      } else {
        setItems(await getCached<T>(docType))
      }
    } catch {
      setItems(await getCached<T>(docType))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [docType])
  return { items, loading, reload }
}

// SB03: a single place to get the tenant's billing currency (Tenant.currency
// on the backend) for formatting amounts consistently in these list tables —
// previously some tables used .toLocaleString() and others showed the bare
// number (e.g. "190.8" instead of "190.80"), with no currency shown at all.
function useTenantCurrency(): string {
  const [currency, setCurrency] = useState('')
  useEffect(() => {
    apiFetch<{ currency: string }>('/account/my-plan').then((p) => setCurrency(p.currency)).catch(() => {})
  }, [])
  return currency
}

function money(amount: number | string, currency: string): string {
  // Whole amounts show without trailing zeros (50,000), amounts with paise/cents keep two decimals.
  const n = Number(amount)
  const digits = Number.isInteger(n) ? 0 : 2
  return `${currency ? currency + ' ' : ''}${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`
}

// SB04 — searchable select-or-create customer field, shared by the invoice
// and quotation forms. Backed by a <datalist> so typing filters existing
// customers as-you-type (native browser behavior); picking one fills
// customer_id + email automatically, and typing a name that doesn't match
// leaves customer_id unset so the backend finds-or-creates one by name, same
// as before this feature existed — nothing about the plain customer_name
// text field's required-ness or shape changes.
interface CustomerOption { id: string; name: string; email: string | null; phone?: string | null; address?: string | null }

function useCustomerDirectory() {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  useEffect(() => { apiFetch<CustomerOption[]>('/customers').then(setCustomers).catch(() => {}) }, [])
  return customers
}

/** Contact details typed on an invoice or quotation. */
interface CustomerContact { email: string; phone: string; address: string }
const emptyContact: CustomerContact = { email: '', phone: '', address: '' }

function CustomerField({
  datalistId, customers, name, onNameChange, onCustomerSelected, contact, onContactChange,
}: {
  datalistId: string
  customers: CustomerOption[]
  name: string
  onNameChange: (name: string) => void
  onCustomerSelected: (customer: CustomerOption | null) => void
  contact: CustomerContact
  onContactChange: (c: CustomerContact) => void
}) {
  return (
    <>
      <div className="field">
        <label>Customer name</label>
        <input
          list={datalistId}
          value={name}
          required
          placeholder="Type a name, or pick a saved customer"
          onChange={(e) => {
            const value = e.target.value
            onNameChange(value)
            const match = customers.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())
            onCustomerSelected(match || null)
            // A saved customer fills in their details; you can still change them.
            if (match) onContactChange({ email: match.email || '', phone: match.phone || '', address: match.address || '' })
          }}
        />
        <datalist id={datalistId}>
          {customers.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Phone number</label>
          <input type="tel" inputMode="tel" placeholder="+91 98765 43210" value={contact.phone} onChange={(e) => onContactChange({ ...contact, phone: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Email</label>
          <input type="email" placeholder="name@company.com" value={contact.email} onChange={(e) => onContactChange({ ...contact, email: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Address</label>
        <textarea rows={2} placeholder="Street, city, PIN code" value={contact.address} onChange={(e) => onContactChange({ ...contact, address: e.target.value })} />
      </div>
    </>
  )
}

async function downloadPdf(path: string, filename: string) {
  const blob = await apiFetch<Blob>(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// SB05: catalog items already exist as full CRUD (Catalog tab) but were
// never wired into the invoice/quotation editor — a Super Admin had to
// retype description/price/tax by hand every time even for a saved item.
interface CatalogItemOption { id: string; name: string; description: string | null; unit: string | null; default_unit_price: number; default_tax_rate_percent: number; is_active: boolean }

function LineItemsEditor({ items, setItems }: { items: LineItem[]; setItems: (i: LineItem[]) => void }) {
  const [catalog, setCatalog] = useState<CatalogItemOption[]>([])
  useEffect(() => { apiFetch<CatalogItemOption[]>('/catalog').then((rows) => setCatalog(rows.filter((r) => r.is_active))).catch(() => {}) }, [])

  function update(i: number, patch: Partial<LineItem>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function addFromCatalog(id: string) {
    const item = catalog.find((c) => c.id === id)
    if (!item) return
    setItems([
      ...items,
      {
        description: item.unit ? `${item.name} (${item.unit})` : item.name,
        quantity: 1, unit_price: item.default_unit_price, tax_rate_percent: item.default_tax_rate_percent, discount_percent: 0,
      },
    ])
  }

  return (
    <div>
      {catalog.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Add from catalog</label>
          <select value="" onChange={(e) => { if (e.target.value) addFromCatalog(e.target.value) }} style={{ maxWidth: 280 }}>
            <option value="">Select a saved item…</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.default_unit_price.toLocaleString()}</option>)}
          </select>
        </div>
      )}
      {/* Column header — hidden on phone widths where item-row stacks to one
          column (see index.css); each input carries its own placeholder
          there instead, so meaning survives the stack. */}
      <div className="item-row item-row-head" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
        <span>Item</span><span>Qty</span><span>Price</span><span>Tax %</span><span>Discount %</span><span></span>
      </div>
      {items.map((it, i) => (
        <div className="item-row" key={i}>
          <input placeholder="What are you billing for?" value={it.description} onChange={(e) => update(i, { description: e.target.value })} required />
          {/* SB01: bounds matching the backend's LineItemIn validation
              (schemas/billing.py) — quantity > 0, price >= 0, tax/discount
              0-100% — so the browser's own number-input affordance (spinner
              clamping, red outline on out-of-range) catches the mistake
              before the request round-trips to the server's 422. */}
          <input type="number" step="0.01" min={0.01} placeholder="Qty" value={it.quantity === 0 ? '' : it.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
          <input type="number" step="0.01" min={0} placeholder="Price" value={it.unit_price === 0 ? '' : it.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} />
          <input type="number" step="0.01" min={0} max={100} placeholder="Tax %" value={it.tax_rate_percent === 0 ? '' : it.tax_rate_percent} onChange={(e) => update(i, { tax_rate_percent: Number(e.target.value) })} />
          <input type="number" step="0.01" min={0} max={100} placeholder="Discount %" value={it.discount_percent === 0 ? '' : it.discount_percent} onChange={(e) => update(i, { discount_percent: Number(e.target.value) })} />
          <button type="button" className="btn secondary" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>✕ Remove</button>
        </div>
      ))}
      <button type="button" className="btn secondary" onClick={() => setItems([...items, emptyItem()])}>+ Add line</button>
    </div>
  )
}

// ---- Summary cards + month/year filters shared by the Invoices and Receipts
// pages. Purely derived from the list already loaded for the signed-in
// workspace, so every user sees figures for their own transactions only.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function kpiMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(amount)
  } catch {
    return money(amount, currency)
  }
}

function StatCard({ label, value, color, icon, onClick, active }: { label: string; value: string | number; color: string; icon: keyof typeof ICONS; onClick?: () => void; active?: boolean }) {
  return (
    <div
      className="kpi-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      title={onClick ? 'Click to filter the list below' : undefined}
      style={{ borderLeft: `4px solid ${color}`, padding: '16px 18px', minWidth: 0, ...(onClick ? { cursor: 'pointer' } : {}), ...(active ? { boxShadow: `0 0 0 2px ${color}` } : {}) }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>{label}</div>
        <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}><Icon path={ICONS[icon]} size={22} /></span>
      </div>
      <div className="kpi-card-value" style={{ color, fontSize: 'clamp(19px, 5.4vw, 30px)', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

const filterSelectStyle = { width: 'auto', minWidth: 110, padding: '8px 12px', borderRadius: 10 } as const

function DateFilters({
  month, year, years, onMonth, onYear,
}: { month: string; year: string; years: number[]; onMonth: (v: string) => void; onYear: (v: string) => void }) {
  return (
    <>
      <select aria-label="Month" style={filterSelectStyle} value={month} onChange={(e) => onMonth(e.target.value)}>
        <option value="all">All Months</option>
        {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
      </select>
      <select aria-label="Year" style={filterSelectStyle} value={year} onChange={(e) => onYear(e.target.value)}>
        <option value="all">All Years</option>
        {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </>
  )
}

function inPeriod(dateStr: string, month: string, year: string): boolean {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return true
  if (year !== 'all' && d.getFullYear() !== Number(year)) return false
  if (month !== 'all' && d.getMonth() + 1 !== Number(month)) return false
  return true
}

function yearsFrom(dates: string[]): number[] {
  const set = new Set<number>([new Date().getFullYear()])
  dates.forEach((d) => { const y = new Date(d).getFullYear(); if (!isNaN(y)) set.add(y) })
  return Array.from(set).sort((a, b) => b - a)
}

function ContactLines({ email, phone }: { email?: string | null; phone?: string | null }) {
  if (!email && !phone) return null
  return <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{[phone, email].filter(Boolean).join(' · ')}</div>
}

function InvoicesPanel({
  autoOpen, onAutoOpenHandled, prefillCustomerName, onPrefillHandled,
}: {
  autoOpen?: boolean
  onAutoOpenHandled?: () => void
  prefillCustomerName?: string | null
  onPrefillHandled?: () => void
}) {
  const currency = useTenantCurrency()
  const customers = useCustomerDirectory()
  const { items, loading, reload } = useDocList<InvoiceRow>('invoices')
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [contact, setContact] = useState<CustomerContact>(emptyContact)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items2, setItems2] = useState<LineItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)
  // Edit + payment actions: editingId switches the same form to "update"
  // mode; payFor opens the fully/partially paid dialog.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<{ inv: InvoiceRow; mode: 'full' | 'partial' } | null>(null)
  const [notice, setNotice] = useState<{ text: string; receiptId: string; receiptNumber: string } | null>(null)
  // Summary-card / list filters (status, month, year — on issue date).
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const visibleInvoices = useMemo(
    () => items.filter((i) => {
      // "overdue" is worked out from the due date (it is never a saved status).
      const statusOk =
        statusFilter === 'all' ||
        (statusFilter === 'overdue' ? !!i.is_overdue : statusFilter === 'unpaid'
          ? !['paid', 'cancelled', 'draft'].includes(i.status)
          : i.status === statusFilter)
      return statusOk && inPeriod(i.issue_date, monthFilter, yearFilter)
    }),
    [items, statusFilter, monthFilter, yearFilter],
  )
  const invoiceYears = useMemo(() => yearsFrom(items.map((i) => i.issue_date)), [items])
  const invoiceTotals = useMemo(() => {
    // Cancelled invoices are not money anyone owes or has been billed.
    const live = visibleInvoices.filter((i) => i.status !== 'cancelled')
    const invoiced = live.reduce((a, i) => a + Number(i.grand_total), 0)
    const received = live.reduce((a, i) => a + Number(i.amount_paid), 0)
    const outstanding = live.reduce((a, i) => a + Math.max(Number(i.grand_total) - Number(i.amount_paid), 0), 0)
    const overdue = live.filter((i) => i.is_overdue).reduce((a, i) => a + Math.max(Number(i.grand_total) - Number(i.amount_paid), 0), 0)
    return { invoiced, received, outstanding, overdue }
  }, [visibleInvoices])

  function resetForm() {
    setEditingId(null)
    setCustomerName(''); setCustomerId(null); setContact(emptyContact); setItems2([emptyItem()]); setNotes(''); setDueDate('')
    setIssueDate(new Date().toISOString().slice(0, 10))
  }

  function startEdit(inv: InvoiceRow) {
    setError(null); setNotice(null)
    setEditingId(inv.id)
    setCustomerName(inv.customer_name)
    setCustomerId(inv.customer_id || null)
    setContact({ email: inv.customer_email || '', phone: inv.customer_phone || '', address: inv.customer_address || '' })
    setIssueDate(inv.issue_date)
    setDueDate(inv.due_date || '')
    setNotes(inv.notes || '')
    setItems2((inv.items && inv.items.length ? inv.items : [emptyItem()]).map((it) => ({
      description: it.description, quantity: it.quantity, unit_price: it.unit_price,
      tax_rate_percent: it.tax_rate_percent, discount_percent: it.discount_percent,
    })))
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    if (autoOpen) {
      setShowForm(true)
      onAutoOpenHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen])

  // SB04: "+ New invoice" from the Customers page carries a name here —
  // pre-fill it (and match it to a known customer_id once the directory has
  // loaded) without touching plain manual entry, which still starts blank.
  useEffect(() => {
    if (prefillCustomerName) {
      setCustomerName(prefillCustomerName)
      const match = customers.find((c) => c.name.toLowerCase() === prefillCustomerName.trim().toLowerCase())
      setCustomerId(match?.id || null)
      if (match) setContact({ email: match.email || '', phone: match.phone || '', address: match.address || '' })
      onPrefillHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomerName, customers])

  async function onCreate() {
    setError(null)
    const payload = {
      customer_name: customerName, customer_id: customerId || undefined,
      customer_email: contact.email || null, customer_phone: contact.phone || null, customer_address: contact.address || null,
      issue_date: issueDate, due_date: dueDate || null, notes: notes || null, items: items2,
    }
    try {
      if (editingId) {
        if (!isOnline()) { setError('You need to be online to edit an invoice.'); return }
        await apiFetch(`/invoices/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else if (isOnline()) {
        await apiFetch('/invoices', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('invoices', payload)
      }
      setShowForm(false)
      resetForm()
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : editingId ? 'Could not update invoice.' : 'Could not create invoice.')
    }
  }

  return (
    <>
    <div className="kpi-grid">
      <StatCard label="Total Invoiced" value={kpiMoney(invoiceTotals.invoiced, currency)} color="var(--green)" icon="invoice" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
      <StatCard label="Received" value={kpiMoney(invoiceTotals.received, currency)} color="var(--accent-2, #2563eb)" icon="checkCircle" onClick={() => setStatusFilter('paid')} active={statusFilter === 'paid'} />
      <StatCard label="Outstanding" value={kpiMoney(invoiceTotals.outstanding, currency)} color="var(--amber)" icon="revenue" onClick={() => setStatusFilter('unpaid')} active={statusFilter === 'unpaid'} />
      <StatCard label="Overdue" value={kpiMoney(invoiceTotals.overdue, currency)} color="var(--red)" icon="alert" onClick={() => setStatusFilter('overdue')} active={statusFilter === 'overdue'} />
    </div>
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Invoices</h2>
        <button className="btn" onClick={() => { if (showForm) resetForm(); setShowForm((s) => !s) }}>{showForm ? 'Cancel' : '+ New invoice'}</button>
      </div>
      {notice && (
        <div className="card" style={{ marginTop: 12, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>{notice.text}</span>
          <button className="btn" onClick={() => downloadPdf(`/receipts/${notice.receiptId}/pdf`, `${notice.receiptNumber}.pdf`)}>Download receipt</button>
          <button className="btn" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {showForm && (
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          {editingId && <p className="muted" style={{ marginBottom: 8 }}>Editing invoice {items.find((i) => i.id === editingId)?.number}</p>}
          <CustomerField
            datalistId="invoice-customers"
            customers={customers}
            name={customerName}
            onNameChange={setCustomerName}
            onCustomerSelected={(c) => setCustomerId(c?.id || null)}
            contact={contact}
            onContactChange={setContact}
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>What is this invoice for? (optional)</label>
            <input placeholder="e.g. Website design — milestone 2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <LineItemsEditor items={items2} setItems={setItems2} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>{editingId ? 'Update invoice' : 'Save invoice'}</button>
          {!isOnline() && <p className="muted">You are offline. We will save this and send it when you are back online.</p>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
        <h3 style={{ margin: 0 }}>All Invoices</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Status" style={filterSelectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="unpaid">Unpaid</option>
            {['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled'].map((st) => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
          </select>
          <DateFilters month={monthFilter} year={yearFilter} years={invoiceYears} onMonth={setMonthFilter} onYear={setYearFilter} />
        </div>
      </div>
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Purpose</th><th>Issue date</th><th>Due date</th><th>Status</th><th>Total</th><th>Paid</th><th></th></tr></thead>
          <tbody>
            {visibleInvoices.map((inv) => (
              // SB, overdue highlight: Invoice.is_overdue already excludes drafts
              // (a document nobody's sent yet can't be late) and anything paid or
              // cancelled — same rule the Overview banner's count uses. This only
              // tints the row and flags the due date; it does not touch the
              // Status column, which keeps showing the real sent/viewed/
              // partially_paid workflow status exactly as before.
              <tr key={inv.id} style={inv.is_overdue ? { background: 'color-mix(in srgb, var(--red) 8%, transparent)' } : undefined}>
                <td>{inv.number}</td>
                <td>{inv.customer_name}<ContactLines email={inv.customer_email} phone={inv.customer_phone} /></td>
                <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{inv.notes || <span className="muted">—</span>}</td>
                <td>{inv.issue_date}</td>
                <td style={inv.is_overdue ? { color: 'var(--red)', fontWeight: 700 } : undefined}>
                  {inv.due_date || <span className="muted">—</span>}
                  {inv.is_overdue && <span className="status-chip status-chip-red" style={{ marginLeft: 6 }}>Overdue</span>}
                </td>
                <td><StatusChip status={inv.status} /></td>
                <td>{money(inv.grand_total, currency)}</td><td>{money(inv.amount_paid, currency)}</td>
                <td>
                  <div className="icon-btn-row">
                    <IconButton icon="download" title="Download PDF" onClick={() => downloadPdf(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)} />
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <>
                        <IconButton icon="edit" title="Edit invoice" onClick={() => startEdit(inv)} />
                        <IconButton icon="checkCircle" tone="green" title="Fully paid" onClick={() => setPayFor({ inv, mode: 'full' })} />
                        <IconButton icon="card" tone="amber" title="Partially paid" onClick={() => setPayFor({ inv, mode: 'partial' })} />
                      </>
                    )}
                    <InvoiceStatusActions invoice={inv} onChanged={reload} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
      )}
      {payFor && (
        <InvoicePaymentModal
          invoice={payFor.inv}
          mode={payFor.mode}
          currency={currency}
          onClose={() => setPayFor(null)}
          onDone={(r) => {
            setPayFor(null)
            setNotice({
              text: `Payment recorded. Receipt ${r.receipt.number} was generated for ${r.invoice.number} (${r.invoice.status.replace('_', ' ')}).`,
              receiptId: r.receipt.id, receiptNumber: r.receipt.number,
            })
            reload()
          }}
        />
      )}
    </div>
    </>
  )
}

function InvoicePaymentModal({
  invoice, mode, currency, onClose, onDone,
}: {
  invoice: InvoiceRow
  mode: 'full' | 'partial'
  currency: string
  onClose: () => void
  onDone: (r: { invoice: { number: string; status: string }; receipt: { id: string; number: string } }) => void
}) {
  const remaining = Math.max(Math.round((Number(invoice.grand_total) - Number(invoice.amount_paid)) * 100) / 100, 0)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError(null)
    if (mode === 'partial') {
      const n = Number(amount)
      if (!(n > 0) || n >= remaining) { setError(`Enter an amount above 0 and below the ${money(remaining, currency)} outstanding.`); return }
    }
    setBusy(true)
    try {
      const res = await apiFetch<{ invoice: { number: string; status: string }; receipt: { id: string; number: string } }>(
        `/invoices/${invoice.id}/payment`,
        {
          method: 'POST',
          body: JSON.stringify({
            mode, amount: mode === 'partial' ? Number(amount) : undefined,
            payment_method: method || null, payment_reference: reference || null, received_at: receivedAt,
          }),
        },
      )
      onDone(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the payment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={mode === 'full' ? `Fully paid · ${invoice.number}` : `Partially paid · ${invoice.number}`} open onClose={onClose}>
      <p className="muted">Outstanding balance: <strong>{money(remaining, currency)}</strong>. A receipt is created for you automatically.</p>
      {mode === 'partial' ? (
        <div className="field"><label>Amount received</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      ) : (
        <div className="field"><label>Amount received</label><input value={money(remaining, currency)} readOnly /></div>
      )}
      <div className="field"><label>Payment method</label><input placeholder="e.g. Bank transfer, Cash, UPI" value={method} onChange={(e) => setMethod(e.target.value)} /></div>
      <div className="field"><label>Reference (optional)</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
      <div className="field"><label>Date received</label><input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn amber" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Record payment'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['viewed', 'cancelled'],
  viewed: ['cancelled'],
}

// Icon + tone per status transition — same meaning as the old "Mark sent" /
// "Mark viewed" / "Mark cancelled" text buttons, just compact.
const STATUS_ACTION_ICON: Record<string, { icon: keyof typeof ICONS; tone: 'accent' | 'green' | 'red' }> = {
  sent: { icon: 'send', tone: 'accent' },
  viewed: { icon: 'eye', tone: 'accent' },
  cancelled: { icon: 'xCircle', tone: 'red' },
  converted: { icon: 'convert', tone: 'green' },
}

function InvoiceStatusActions({ invoice, onChanged }: { invoice: InvoiceRow; onChanged: () => void }) {
  const options = INVOICE_TRANSITIONS[invoice.status] || []
  async function setStatus(next: string) {
    await apiFetch(`/invoices/${invoice.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
    onChanged()
  }
  if (options.length === 0) return null
  return (
    <>
      {options.map((opt) => {
        const cfg = STATUS_ACTION_ICON[opt] || { icon: 'checkCircle' as const, tone: 'accent' as const }
        return <IconButton key={opt} icon={cfg.icon} tone={cfg.tone} title={`Mark ${opt}`} onClick={() => setStatus(opt)} />
      })}
    </>
  )
}

function QuotationsPanel() {
  const currency = useTenantCurrency()
  const customers = useCustomerDirectory()
  const { items, loading, reload } = useDocList<QuotationRow>('quotations')
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [contact, setContact] = useState<CustomerContact>(emptyContact)
  // Summary-card / list filters (status, month, year — on issue date).
  const [statusFilter, setStatusFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const visibleQuotations = useMemo(
    () => items.filter((q) => (statusFilter === 'all' || q.status === statusFilter) && inPeriod(q.issue_date, monthFilter, yearFilter)),
    [items, statusFilter, monthFilter, yearFilter],
  )
  const quotationYears = useMemo(() => yearsFrom(items.map((q) => q.issue_date)), [items])
  const quotationTotals = useMemo(() => {
    const sum = (list: QuotationRow[]) => list.reduce((a, q) => a + Number(q.grand_total), 0)
    // Totals follow the month/year filter but not the status filter, so each card always shows its own figure.
    const inRange = items.filter((q) => inPeriod(q.issue_date, monthFilter, yearFilter))
    return {
      quoted: sum(inRange), accepted: sum(inRange.filter((q) => q.status === 'accepted')),
      waiting: sum(inRange.filter((q) => q.status === 'sent')), converted: sum(inRange.filter((q) => q.status === 'converted')),
    }
  }, [items, monthFilter, yearFilter])
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items2, setItems2] = useState<LineItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setError(null)
    const payload = {
      customer_name: customerName, customer_id: customerId || undefined,
      customer_email: contact.email || null, customer_phone: contact.phone || null, customer_address: contact.address || null,
      issue_date: issueDate, valid_until: validUntil || null, notes: notes || null, items: items2,
    }
    try {
      if (isOnline()) {
        await apiFetch('/quotations', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('quotations', payload)
      }
      setShowForm(false)
      setCustomerName(''); setCustomerId(null); setContact(emptyContact); setItems2([emptyItem()]); setNotes('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create quotation.')
    }
  }

  async function onConvert(id: string) {
    await apiFetch(`/quotations/${id}/convert`, { method: 'POST' })
    reload()
  }

  return (
    <>
    <div className="kpi-grid">
      <StatCard label="Total Quoted" value={kpiMoney(quotationTotals.quoted, currency)} color="var(--green)" icon="quotation" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
      <StatCard label="Accepted" value={kpiMoney(quotationTotals.accepted, currency)} color="var(--accent-2, #2563eb)" icon="checkCircle" onClick={() => setStatusFilter('accepted')} active={statusFilter === 'accepted'} />
      <StatCard label="Awaiting Reply" value={kpiMoney(quotationTotals.waiting, currency)} color="var(--amber)" icon="clock" onClick={() => setStatusFilter('sent')} active={statusFilter === 'sent'} />
      <StatCard label="Turned into Invoices" value={kpiMoney(quotationTotals.converted, currency)} color="var(--red)" icon="invoice" onClick={() => setStatusFilter('converted')} active={statusFilter === 'converted'} />
    </div>
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Quotations</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New quotation'}</button>
      </div>
      {showForm && (
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <CustomerField
            datalistId="quotation-customers"
            customers={customers}
            name={customerName}
            onNameChange={setCustomerName}
            onCustomerSelected={(c) => setCustomerId(c?.id || null)}
            contact={contact}
            onContactChange={setContact}
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Valid until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>What is this quotation for? (optional)</label>
            <input placeholder="e.g. Branding package — logo + guidelines" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <LineItemsEditor items={items2} setItems={setItems2} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save quotation</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
        <h3 style={{ margin: 0 }}>All Quotations</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Status" style={filterSelectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            {['draft', 'sent', 'accepted', 'declined', 'expired', 'converted'].map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <DateFilters month={monthFilter} year={yearFilter} years={quotationYears} onMonth={setMonthFilter} onYear={setYearFilter} />
        </div>
      </div>
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Purpose</th><th>Issue date</th><th>Valid until</th><th>Status</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {visibleQuotations.map((q) => (
              <tr key={q.id}>
                <td>{q.number}</td>
                <td>{q.customer_name}<ContactLines email={q.customer_email} phone={q.customer_phone} /></td>
                <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{q.notes || <span className="muted">—</span>}</td>
                <td>{q.issue_date}</td><td>{q.valid_until || <span className="muted">—</span>}</td>
                <td><StatusChip status={q.status} /></td>
                <td>{money(q.grand_total, currency)}</td>
                <td>
                  <div className="icon-btn-row">
                    <IconButton icon="download" title="Download PDF" onClick={() => downloadPdf(`/quotations/${q.id}/pdf`, `${q.number}.pdf`)} />
                    {q.status !== 'converted' && <IconButton icon="convert" tone="green" title="Convert to invoice" onClick={() => onConvert(q.id)} />}
                    <QuotationStatusActions quotation={q} onChanged={reload} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
      )}
    </div>
    </>
  )
}

const QUOTATION_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'expired'],
}

const QUOTATION_ACTION_ICON: Record<string, { icon: keyof typeof ICONS; tone: 'accent' | 'green' | 'red' | 'amber' }> = {
  sent: { icon: 'send', tone: 'accent' },
  accepted: { icon: 'checkCircle', tone: 'green' },
  declined: { icon: 'xCircle', tone: 'red' },
  expired: { icon: 'xCircle', tone: 'amber' },
}

function QuotationStatusActions({ quotation, onChanged }: { quotation: QuotationRow; onChanged: () => void }) {
  const options = QUOTATION_TRANSITIONS[quotation.status] || []
  async function setStatus(next: string) {
    await apiFetch(`/quotations/${quotation.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
    onChanged()
  }
  if (options.length === 0) return null
  return (
    <>
      {options.map((opt) => {
        const cfg = QUOTATION_ACTION_ICON[opt] || { icon: 'checkCircle' as const, tone: 'accent' as const }
        return <IconButton key={opt} icon={cfg.icon} tone={cfg.tone} title={`Mark ${opt}`} onClick={() => setStatus(opt)} />
      })}
    </>
  )
}

function ReceiptsPanel() {
  const currency = useTenantCurrency()
  const { items: invoices } = useDocList<InvoiceRow>('invoices')
  const { items, loading, reload } = useDocList<ReceiptRow>('receipts')
  const [showForm, setShowForm] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState(0)
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [methodFilter, setMethodFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const receiptMethods = useMemo(() => Array.from(new Set(items.map((r) => r.payment_method).filter(Boolean) as string[])), [items])
  const receiptYears = useMemo(() => yearsFrom(items.map((r) => r.received_at)), [items])
  const byMethod = useMemo(() => items.filter((r) => methodFilter === 'all' || r.payment_method === methodFilter), [items, methodFilter])
  const visibleReceipts = useMemo(() => byMethod.filter((r) => inPeriod(r.received_at, monthFilter, yearFilter)), [byMethod, monthFilter, yearFilter])
  const receiptTotals = useMemo(() => {
    const now = new Date()
    const thisMonth = byMethod.filter((r) => inPeriod(r.received_at, String(now.getMonth() + 1), String(now.getFullYear())))
    return {
      total: visibleReceipts.reduce((a, r) => a + Number(r.amount), 0),
      month: thisMonth.reduce((a, r) => a + Number(r.amount), 0),
      count: visibleReceipts.length,
    }
  }, [visibleReceipts, byMethod])

  async function onCreate() {
    setError(null)
    // SB02: is_partial was always sent as false, so the PDF's "Payment
    // received (full)" wording was wrong on every genuinely partial
    // payment. Computed here from the selected invoice's own remaining
    // balance (grand_total - amount_paid, before this receipt) instead.
    const selectedInvoice = invoices.find((inv) => inv.id === invoiceId)
    const remainingBefore = selectedInvoice ? Number(selectedInvoice.grand_total) - Number(selectedInvoice.amount_paid) : 0
    const isPartial = !!selectedInvoice && amount < remainingBefore
    const payload = {
      invoice_id: invoiceId, amount, received_at: receivedAt, payment_method: method,
      payment_reference: reference || undefined, notes: notes || undefined, is_partial: isPartial,
    }
    try {
      if (isOnline()) {
        await apiFetch('/receipts', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('receipts', payload)
      }
      setShowForm(false)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create receipt.')
    }
  }

  return (
    <>
    <div className="kpi-grid">
      <StatCard label="Total Received" value={kpiMoney(receiptTotals.total, currency)} color="var(--green)" icon="checkCircle" />
      <StatCard label="This Month" value={kpiMoney(receiptTotals.month, currency)} color="var(--amber)" icon="clock" />
      <StatCard label="Total Receipts" value={receiptTotals.count} color="var(--accent-2, #2563eb)" icon="receipt" />
    </div>
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Receipts</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Record payment'}</button>
      </div>
      {showForm && (
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <div className="field">
            <label>Invoice</label>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} required>
              <option value="">Select invoice…</option>
              {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.number} — {inv.customer_name} ({money(inv.grand_total, currency)})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}><label>Amount received</label><input type="number" step="0.01" min={0} placeholder="0.00" value={amount === 0 ? '' : amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="field" style={{ flex: 1 }}><label>Date received</label><input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Payment method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="razorpay">Razorpay</option>
                <option value="billplz">Billplz</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Payment reference (optional)</label>
              <input placeholder="Optional" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>What is this payment for? (optional)</label>
            <input placeholder="e.g. Advance against milestone 2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save receipt</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
        <h3 style={{ margin: 0 }}>All Receipts</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Payment method" style={filterSelectStyle} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="all">All Methods</option>
            {receiptMethods.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
          <DateFilters month={monthFilter} year={yearFilter} years={receiptYears} onMonth={setMonthFilter} onYear={setYearFilter} />
        </div>
      </div>
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table>
          <thead><tr><th>Number</th><th>Purpose</th><th>Amount</th><th>Method</th><th>Reference</th><th>Received</th><th></th></tr></thead>
          <tbody>
            {visibleReceipts.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td>
                <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{r.notes || <span className="muted">—</span>}</td>
                <td>{money(r.amount, currency)}</td>
                <td>{r.payment_method || <span className="muted">—</span>}</td>
                <td>{r.payment_reference || <span className="muted">—</span>}</td>
                <td>{r.received_at}</td>
                <td>
                  <div className="icon-btn-row">
                    <IconButton icon="download" title="Download PDF" onClick={() => downloadPdf(`/receipts/${r.id}/pdf`, `${r.number}.pdf`)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
      )}
    </div>
    </>
  )
}
