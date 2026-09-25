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
import { DashboardCard, KpiCard, StatusChip, EmptyState, Icon, ICONS, CHART_COLORS } from '../components/DashboardUI'
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
  { key: 'overview', label: 'Overview' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'customers', label: 'Customers' },
  { key: 'team', label: 'Team' },
  { key: 'catalog', label: 'Catalog' },
  { key: 'reports', label: 'Reports' },
  { key: 'my-plan', label: 'My Plan' },
  { key: 'gst-manager', label: 'GST Manager' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'settings', label: 'Settings' },
]

interface LineItem { description: string; quantity: number; unit_price: number; tax_rate_percent: number; discount_percent: number }

interface InvoiceRow { id: string; number: string; customer_name: string; status: string; grand_total: number; amount_paid: number; issue_date: string; due_date?: string | null; notes?: string | null }
interface QuotationRow { id: string; number: string; customer_name: string; status: string; grand_total: number; issue_date: string; valid_until?: string | null; notes?: string | null }
interface ReceiptRow { id: string; number: string; invoice_id: string; amount: number; received_at: string }

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

  useEffect(() => {
    // Pull the full document history into the offline cache on load, then
    // periodically while online (SOW 3.5).
    if (isOnline()) syncAll().catch(() => {})
    const interval = setInterval(() => { if (isOnline()) syncAll().catch(() => {}) }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <AppLayout
      navItems={NAV_ITEMS}
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
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Upload your branding (logo, header, footer) to activate invoicing, quotations, and receipts.</div>
          </div>
          <a className="btn amber" href={`/subscribe/${session.tenantId}/branding`}>Finish setup</a>
        </div>
      )}
      <UsageBanner />

      {tab === 'overview' && (
        <OverviewPanel
          onNav={(key) => setTab(key)}
          onQuickNewInvoice={() => { setOpenInvoiceForm(true); setTab('invoices') }}
        />
      )}
      {tab === 'invoices' && <InvoicesPanel autoOpen={openInvoiceForm} onAutoOpenHandled={() => setOpenInvoiceForm(false)} />}
      {tab === 'quotations' && <QuotationsPanel />}
      {tab === 'receipts' && <ReceiptsPanel />}
      {tab === 'customers' && <CustomersPage />}
      {tab === 'team' && <TeamPage />}
      {tab === 'catalog' && <CatalogPage />}
      {tab === 'reports' && <TenantReportsPage />}
      {tab === 'my-plan' && <MyPlanPage />}
      {tab === 'gst-manager' && <GstManagerPage />}
      {tab === 'credentials' && <TenantCredentialsPage />}
      {tab === 'settings' && <Settings />}
    </AppLayout>
  )
}

interface TenantAnalytics {
  invoice_count: number
  quotation_count: number
  receipt_count: number
  outstanding_receivables: number
  revenue_collected: number
  overdue_invoice_count: number
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
                <strong style={{ color: 'var(--text)' }}>{stats.overdue_invoice_count} invoice{stats.overdue_invoice_count === 1 ? '' : 's'}</strong> past due, totalling toward your {stats.outstanding_receivables.toLocaleString()} in outstanding receivables.
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
        <KpiCard icon={<Icon path={ICONS.revenue} size={18} />} label="Total revenue" value={stats.revenue_collected.toLocaleString()} sub={`${stats.last_30_days_revenue.toLocaleString()} in the last 30 days`} color="var(--accent)" />
        <KpiCard icon={<Icon path={ICONS.invoice} size={18} />} label="Total invoices" value={stats.invoice_count} sub={`${stats.overdue_invoice_count} overdue`} color="var(--accent-2)" />
        <KpiCard icon={<Icon path={ICONS.alert} size={18} />} label="Outstanding receivables" value={stats.outstanding_receivables.toLocaleString()} sub="not yet collected" color="var(--green)" />
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

async function downloadPdf(path: string, filename: string) {
  const blob = await apiFetch<Blob>(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function LineItemsEditor({ items, setItems }: { items: LineItem[]; setItems: (i: LineItem[]) => void }) {
  function update(i: number, patch: Partial<LineItem>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  return (
    <div>
      {/* Column header — hidden on phone widths where item-row stacks to one
          column (see index.css); each input carries its own placeholder
          there instead, so meaning survives the stack. */}
      <div className="item-row item-row-head" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
        <span>Description</span><span>Qty</span><span>Unit price</span><span>Tax %</span><span>Disc %</span><span></span>
      </div>
      {items.map((it, i) => (
        <div className="item-row" key={i}>
          <input placeholder="Item description" value={it.description} onChange={(e) => update(i, { description: e.target.value })} required />
          <input type="number" step="0.01" placeholder="Qty" value={it.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
          <input type="number" step="0.01" placeholder="Unit price" value={it.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} />
          <input type="number" step="0.01" placeholder="Tax %" value={it.tax_rate_percent} onChange={(e) => update(i, { tax_rate_percent: Number(e.target.value) })} />
          <input type="number" step="0.01" placeholder="Disc %" value={it.discount_percent} onChange={(e) => update(i, { discount_percent: Number(e.target.value) })} />
          <button type="button" className="btn secondary" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>✕ Remove</button>
        </div>
      ))}
      <button type="button" className="btn secondary" onClick={() => setItems([...items, emptyItem()])}>+ Add line</button>
    </div>
  )
}

function InvoicesPanel({ autoOpen, onAutoOpenHandled }: { autoOpen?: boolean; onAutoOpenHandled?: () => void }) {
  const { items, loading, reload } = useDocList<InvoiceRow>('invoices')
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [items2, setItems2] = useState<LineItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (autoOpen) {
      setShowForm(true)
      onAutoOpenHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen])

  async function onCreate() {
    setError(null)
    const payload = { customer_name: customerName, issue_date: issueDate, due_date: dueDate || null, notes: notes || null, items: items2 }
    try {
      if (isOnline()) {
        await apiFetch('/invoices', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('invoices', payload)
      }
      setShowForm(false)
      setCustomerName(''); setItems2([emptyItem()]); setNotes('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create invoice.')
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Invoices</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New invoice'}</button>
      </div>
      {showForm && (
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <div className="field"><label>Customer name</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Purpose (what this invoice is for)</label>
            <input placeholder="e.g. Website design — milestone 2" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <LineItemsEditor items={items2} setItems={setItems2} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save invoice</button>
          {!isOnline() && <p className="muted">You're offline — this will queue and sync automatically once you're back online.</p>}
        </div>
      )}
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Purpose</th><th>Issue date</th><th>Due date</th><th>Status</th><th>Total</th><th>Paid</th><th></th></tr></thead>
          <tbody>
            {items.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.number}</td><td>{inv.customer_name}</td>
                <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{inv.notes || <span className="muted">—</span>}</td>
                <td>{inv.issue_date}</td><td>{inv.due_date || <span className="muted">—</span>}</td>
                <td><StatusChip status={inv.status} /></td>
                <td>{inv.grand_total}</td><td>{inv.amount_paid}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn secondary" onClick={() => downloadPdf(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)}>PDF</button>
                  <InvoiceStatusActions invoice={inv} onChanged={reload} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
      )}
    </div>
  )
}

const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['viewed', 'cancelled'],
  viewed: ['cancelled'],
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
      {options.map((opt) => (
        <button key={opt} className="btn secondary" onClick={() => setStatus(opt)}>
          Mark {opt}
        </button>
      ))}
    </>
  )
}

function QuotationsPanel() {
  const { items, loading, reload } = useDocList<QuotationRow>('quotations')
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items2, setItems2] = useState<LineItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setError(null)
    const payload = { customer_name: customerName, issue_date: issueDate, valid_until: validUntil || null, notes: notes || null, items: items2 }
    try {
      if (isOnline()) {
        await apiFetch('/quotations', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('quotations', payload)
      }
      setShowForm(false)
      setCustomerName(''); setItems2([emptyItem()]); setNotes('')
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
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Quotations</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ New quotation'}</button>
      </div>
      {showForm && (
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <div className="field"><label>Customer name</label><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}><label>Valid until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Purpose (what this quotation is for)</label>
            <input placeholder="e.g. Branding package — logo + guidelines" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <LineItemsEditor items={items2} setItems={setItems2} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save quotation</button>
        </div>
      )}
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Purpose</th><th>Issue date</th><th>Valid until</th><th>Status</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {items.map((q) => (
              <tr key={q.id}>
                <td>{q.number}</td><td>{q.customer_name}</td>
                <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{q.notes || <span className="muted">—</span>}</td>
                <td>{q.issue_date}</td><td>{q.valid_until || <span className="muted">—</span>}</td>
                <td><StatusChip status={q.status} /></td>
                <td>{q.grand_total}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn secondary" onClick={() => downloadPdf(`/quotations/${q.id}/pdf`, `${q.number}.pdf`)}>PDF</button>
                  {q.status !== 'converted' && <button className="btn secondary" onClick={() => onConvert(q.id)}>Convert to invoice</button>}
                  <QuotationStatusActions quotation={q} onChanged={reload} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
      )}
    </div>
  )
}

const QUOTATION_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'expired'],
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
      {options.map((opt) => (
        <button key={opt} className="btn secondary" onClick={() => setStatus(opt)}>
          Mark {opt}
        </button>
      ))}
    </>
  )
}

function ReceiptsPanel() {
  const { items: invoices } = useDocList<InvoiceRow>('invoices')
  const { items, loading, reload } = useDocList<ReceiptRow>('receipts')
  const [showForm, setShowForm] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState(0)
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('cash')
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setError(null)
    const payload = { invoice_id: invoiceId, amount, received_at: receivedAt, payment_method: method, is_partial: false }
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
              {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.number} — {inv.customer_name} ({inv.grand_total})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}><label>Amount received</label><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="field" style={{ flex: 1 }}><label>Date received</label><input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Payment method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="razorpay">Razorpay</option>
              <option value="billplz">Billplz</option>
            </select>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save receipt</button>
        </div>
      )}
      {loading ? <p className="muted">Loading…</p> : (
        <div className="table-scroll">
          <table>
          <thead><tr><th>Number</th><th>Amount</th><th>Received</th><th></th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td><td>{r.amount}</td><td>{r.received_at}</td>
                <td><button className="btn secondary" onClick={() => downloadPdf(`/receipts/${r.id}/pdf`, `${r.number}.pdf`)}>PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
      )}
    </div>
  )
}
