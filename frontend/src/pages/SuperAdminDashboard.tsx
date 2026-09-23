import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api'
import { getCached, isOnline, queueOfflineCreate, syncAll, type DocType } from '../lib/offlineStore'
import SyncStatusBadge from '../components/SyncStatusBadge'
import AppLayout, { type NavItem } from '../components/AppLayout'
import Settings from './Settings'

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'settings', label: 'Settings' },
]

interface LineItem { description: string; quantity: number; unit_price: number; tax_rate_percent: number; discount_percent: number }

interface InvoiceRow { id: string; number: string; customer_name: string; status: string; grand_total: number; amount_paid: number; issue_date: string }
interface QuotationRow { id: string; number: string; customer_name: string; status: string; grand_total: number; issue_date: string }
interface ReceiptRow { id: string; number: string; invoice_id: string; amount: number; received_at: string }

const emptyItem = (): LineItem => ({ description: '', quantity: 1, unit_price: 0, tax_rate_percent: 0, discount_percent: 0 })

export default function SuperAdminDashboard() {
  const [tab, setTab] = useState<'overview' | 'invoices' | 'quotations' | 'receipts' | 'settings'>('overview')

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
      {tab === 'overview' && <OverviewPanel />}
      {tab === 'invoices' && <InvoicesPanel />}
      {tab === 'quotations' && <QuotationsPanel />}
      {tab === 'receipts' && <ReceiptsPanel />}
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

function OverviewPanel() {
  const [stats, setStats] = useState<TenantAnalytics | null>(null)
  useEffect(() => { apiFetch<TenantAnalytics>('/analytics/tenant').then(setStats).catch(() => {}) }, [])

  if (!stats) return <div className="card"><p className="muted">Loading overview…</p></div>

  const tiles: [string, string | number][] = [
    ['Invoices', stats.invoice_count],
    ['Quotations', stats.quotation_count],
    ['Receipts', stats.receipt_count],
    ['Outstanding receivables', stats.outstanding_receivables.toLocaleString()],
    ['Revenue collected', stats.revenue_collected.toLocaleString()],
    ['Revenue (last 30 days)', stats.last_30_days_revenue.toLocaleString()],
    ['Overdue invoices', stats.overdue_invoice_count],
  ]

  return (
    <div className="card">
      <h2>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {tiles.map(([label, value]) => (
          <div className="stat-tile" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>
    </div>
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
      <div className="item-row" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
        <span>Description</span><span>Qty</span><span>Unit price</span><span>Tax %</span><span>Disc %</span><span></span>
      </div>
      {items.map((it, i) => (
        <div className="item-row" key={i}>
          <input placeholder="Item description" value={it.description} onChange={(e) => update(i, { description: e.target.value })} required />
          <input type="number" step="0.01" value={it.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
          <input type="number" step="0.01" value={it.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} />
          <input type="number" step="0.01" value={it.tax_rate_percent} onChange={(e) => update(i, { tax_rate_percent: Number(e.target.value) })} />
          <input type="number" step="0.01" value={it.discount_percent} onChange={(e) => update(i, { discount_percent: Number(e.target.value) })} />
          <button type="button" className="btn secondary" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn secondary" onClick={() => setItems([...items, emptyItem()])}>+ Add line</button>
    </div>
  )
}

function InvoicesPanel() {
  const { items, loading, reload } = useDocList<InvoiceRow>('invoices')
  const [showForm, setShowForm] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [items2, setItems2] = useState<LineItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setError(null)
    const payload = { customer_name: customerName, issue_date: issueDate, due_date: dueDate || null, items: items2 }
    try {
      if (isOnline()) {
        await apiFetch('/invoices', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('invoices', payload)
      }
      setShowForm(false)
      setCustomerName(''); setItems2([emptyItem()])
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
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Due date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
          <LineItemsEditor items={items2} setItems={setItems2} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save invoice</button>
          {!isOnline() && <p className="muted">You're offline — this will queue and sync automatically once you're back online.</p>}
        </div>
      )}
      {loading ? <p className="muted">Loading…</p> : (
        <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th>Paid</th><th></th></tr></thead>
          <tbody>
            {items.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.number}</td><td>{inv.customer_name}</td><td>{inv.status}</td>
                <td>{inv.grand_total}</td><td>{inv.amount_paid}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn secondary" onClick={() => downloadPdf(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)}>PDF</button>
                  <InvoiceStatusActions invoice={inv} onChanged={reload} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [items2, setItems2] = useState<LineItem[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setError(null)
    const payload = { customer_name: customerName, issue_date: issueDate, valid_until: validUntil || null, items: items2 }
    try {
      if (isOnline()) {
        await apiFetch('/quotations', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await queueOfflineCreate('quotations', payload)
      }
      setShowForm(false)
      setCustomerName(''); setItems2([emptyItem()])
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
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}><label>Issue date</label><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Valid until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          </div>
          <LineItemsEditor items={items2} setItems={setItems2} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" style={{ marginTop: 10 }} onClick={onCreate}>Save quotation</button>
        </div>
      )}
      {loading ? <p className="muted">Loading…</p> : (
        <table>
          <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {items.map((q) => (
              <tr key={q.id}>
                <td>{q.number}</td><td>{q.customer_name}</td><td>{q.status}</td><td>{q.grand_total}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn secondary" onClick={() => downloadPdf(`/quotations/${q.id}/pdf`, `${q.number}.pdf`)}>PDF</button>
                  {q.status !== 'converted' && <button className="btn secondary" onClick={() => onConvert(q.id)}>Convert to invoice</button>}
                  <QuotationStatusActions quotation={q} onChanged={reload} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      )}
    </div>
  )
}
