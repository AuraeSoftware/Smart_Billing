import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { DashboardCard, KpiCard, StatusChip, EmptyState, Modal, Icon, ICONS } from '../../components/DashboardUI'

/**
 * Tenant-facing equivalents of Smart Garage 360's Super Admin sidebar —
 * My Plan (read-only), Credentials (self-service password change),
 * Customers, Team, Catalog, GST Manager, and Reports — each adapted from
 * the real Smart Garage Super Admin component to a billing equivalent.
 * Payment Settings is deliberately not included here (billing tenants
 * settle with Aurae directly; there's no per-customer checkout to gate).
 */

interface MyPlan {
  tenant_name: string
  subscription_status: string
  currency: string
  plan_name: string | null
  plan_description: string | null
  plan_price: number | null
  plan_billing_cycle: string | null
  plan_max_users: number | null
  plan_max_invoices_per_month: number | null
}

export function MyPlanPage() {
  const [plan, setPlan] = useState<MyPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<MyPlan>('/account/my-plan').then(setPlan).finally(() => setLoading(false))
  }, [])

  if (loading) return <DashboardCard title="My Plan"><p className="muted">Loading…</p></DashboardCard>
  if (!plan) return <DashboardCard title="My Plan"><EmptyState title="Could not load plan details" /></DashboardCard>

  return (
    <DashboardCard title="My Plan" subtitle="Your current subscription — contact Aurae Software Solutions to change plans.">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <StatusChip status={plan.subscription_status} />
        <span className="muted">Billing currency: {plan.currency}</span>
      </div>
      {plan.plan_name ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div><div className="muted">Plan</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_name}</div></div>
          <div><div className="muted">Price</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.currency} {plan.plan_price?.toFixed(2)} / {plan.plan_billing_cycle}</div></div>
          <div><div className="muted">Max users</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_users}</div></div>
          <div><div className="muted">Max invoices / month</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_invoices_per_month}</div></div>
          {plan.plan_description && <div style={{ gridColumn: '1 / -1' }}><div className="muted">Description</div><div>{plan.plan_description}</div></div>}
        </div>
      ) : (
        <EmptyState title="No plan assigned yet" sub="Aurae Software Solutions will assign a plan to your workspace shortly." />
      )}
    </DashboardCard>
  )
}

export function TenantCredentialsPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function submit() {
    setMessage(null)
    if (newPassword !== confirm) {
      setMessage({ text: 'New password and confirmation do not match.', ok: false })
      return
    }
    try {
      await apiFetch('/account/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
      setMessage({ text: 'Password updated.', ok: true })
      setCurrentPassword(''); setNewPassword(''); setConfirm('')
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'Could not update password.', ok: false })
    }
  }

  return (
    <DashboardCard title="Credentials" subtitle="Change your password, or de-register this device from your account.">
      <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
        <label>Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
        <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {message && <p style={{ color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</p>}
        <button className="btn" onClick={submit} disabled={!currentPassword || !newPassword}>Update password</button>
      </div>
    </DashboardCard>
  )
}

// ============================================================================
// Customers — aggregated from invoice/quotation customer fields (there's no
// separate Customer table). Smart Garage 360's "Customers" sidebar page,
// adapted for billing: a running ledger of who's been billed, how much, and
// how much has actually come in.
// ============================================================================

interface CustomerRow {
  name: string
  email: string | null
  invoice_count: number
  quotation_count: number
  total_billed: number
  total_paid: number
  last_activity: string | null
}

export function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiFetch<CustomerRow[]>('/analytics/tenant/customers').then(setRows).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()) || (r.email || '').toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  )
  const totalBilled = rows.reduce((s, r) => s + r.total_billed, 0)
  const totalOutstanding = rows.reduce((s, r) => s + (r.total_billed - r.total_paid), 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={<Icon path={ICONS.users} />} label="Customers" value={rows.length} color="var(--accent)" />
        <KpiCard icon={<Icon path={ICONS.revenue} />} label="Total billed" value={totalBilled.toLocaleString()} color="var(--green)" />
        <KpiCard icon={<Icon path={ICONS.alert} />} label="Outstanding" value={totalOutstanding.toLocaleString()} color="var(--amber)" />
      </div>

      <DashboardCard
        title="Customers"
        subtitle="Every customer you've invoiced or quoted, built automatically from your documents — no separate customer list to maintain."
        action={<input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />}
      >
        {loading ? <p className="muted">Loading…</p> : filtered.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.users} size={22} />} title="No customers yet" sub="Customers appear here as soon as you create an invoice or quotation." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Customer</th><th>Email</th><th>Invoices</th><th>Quotations</th><th>Billed</th><th>Paid</th><th>Last activity</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.name}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td className="muted">{r.email || '—'}</td>
                  <td>{r.invoice_count}</td>
                  <td>{r.quotation_count}</td>
                  <td style={{ fontWeight: 700 }}>{r.total_billed.toLocaleString()}</td>
                  <td style={{ color: 'var(--green)' }}>{r.total_paid.toLocaleString()}</td>
                  <td className="muted">{r.last_activity ? new Date(r.last_activity).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>
    </div>
  )
}

// ============================================================================
// Team — the tenant's own staff accounts. Smart Garage 360's "Washers"/
// "Workers" sidebar page, adapted for billing: the people who can log in
// under this Super Admin and work invoices/quotations/receipts. Backed by
// the existing /tenant-users endpoints.
// ============================================================================

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}
const emptyTeamForm = { full_name: '', email: '', password: '' }

export function TeamPage() {
  const [rows, setRows] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyTeamForm)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      setRows(await apiFetch<TeamMember[]>('/tenant-users'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function submitAdd() {
    if (!form.full_name || !form.email || form.password.length < 8) {
      setError('Full name, email, and an 8+ character password are required.')
      return
    }
    try {
      await apiFetch('/tenant-users', { method: 'POST', body: JSON.stringify(form) })
      setShowAdd(false)
      setForm(emptyTeamForm)
      setError('')
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add team member.')
    }
  }

  async function toggle(m: TeamMember) {
    await apiFetch(`/tenant-users/${m.id}/${m.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' })
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Team</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>Staff accounts that can work invoices, quotations, and receipts under your workspace.</p>
        </div>
        <button className="btn" onClick={() => { setForm(emptyTeamForm); setError(''); setShowAdd(true) }}>+ Add team member</button>
      </div>

      <DashboardCard>
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.users} size={22} />} title="No team members yet" sub="Add a staff account so they can log in under your workspace." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 700 }}>{m.full_name}</td>
                  <td className="muted">{m.email}</td>
                  <td>{m.is_active ? <StatusChip status="active" /> : <StatusChip status="inactive" />}</td>
                  <td className="muted">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td><button className={m.is_active ? 'btn warn' : 'btn secondary'} onClick={() => toggle(m)}>{m.is_active ? 'Deactivate' : 'Reactivate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>

      <Modal title="Add team member" open={showAdd} onClose={() => setShowAdd(false)} maxWidth={420}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>Full name<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
          <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={submitAdd}>Add member</button>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// Catalog — reusable, saved invoice/quotation line items. Smart Garage
// 360's "Packages"/"Products" sidebar page, adapted for billing.
// ============================================================================

interface CatalogItemRow {
  id: string
  name: string
  description: string | null
  unit: string | null
  default_unit_price: number
  default_tax_rate_percent: number
  is_active: boolean
}
const emptyCatalogForm = { name: '', description: '', unit: '', default_unit_price: 0, default_tax_rate_percent: 0, is_active: true }

export function CatalogPage() {
  const [rows, setRows] = useState<CatalogItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<CatalogItemRow | null>(null)
  const [form, setForm] = useState(emptyCatalogForm)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      setRows(await apiFetch<CatalogItemRow[]>('/catalog'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function openAdd() { setForm(emptyCatalogForm); setError(''); setShowAdd(true) }
  function openEdit(item: CatalogItemRow) {
    setEditing(item)
    setForm({
      name: item.name, description: item.description || '', unit: item.unit || '',
      default_unit_price: item.default_unit_price, default_tax_rate_percent: item.default_tax_rate_percent,
      is_active: item.is_active,
    })
  }

  async function submitAdd() {
    if (!form.name) { setError('Item name is required.'); return }
    try {
      await apiFetch('/catalog', { method: 'POST', body: JSON.stringify(form) })
      setShowAdd(false)
      load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not add item.') }
  }
  async function submitEdit() {
    if (!editing) return
    try {
      await apiFetch(`/catalog/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      setEditing(null)
      load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save item.') }
  }
  async function remove(id: string) {
    await apiFetch(`/catalog/${id}`, { method: 'DELETE' })
    load()
  }

  const renderForm = () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <label>Item name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website maintenance (monthly)" /></label>
      <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="hr, pc…" /></label>
        <label>Unit price<input type="number" step="0.01" value={form.default_unit_price} onChange={(e) => setForm({ ...form, default_unit_price: Number(e.target.value) })} /></label>
        <label>Tax %<input type="number" step="0.01" value={form.default_tax_rate_percent} onChange={(e) => setForm({ ...form, default_tax_rate_percent: Number(e.target.value) })} /></label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active — available when creating invoices/quotations
      </label>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Catalog</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>Save a priced item once, then drop it into any invoice or quotation line without retyping price and tax.</p>
        </div>
        <button className="btn" onClick={openAdd}>+ Add item</button>
      </div>

      <DashboardCard>
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.invoice} size={22} />} title="No catalog items yet" sub="Click 'Add item' to save your first reusable line item." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>Unit</th><th>Unit price</th><th>Tax %</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    {item.description && <div className="muted" style={{ fontSize: 12 }}>{item.description}</div>}
                  </td>
                  <td className="muted">{item.unit || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{item.default_unit_price.toLocaleString()}</td>
                  <td>{item.default_tax_rate_percent}%</td>
                  <td>{item.is_active ? <StatusChip status="active" /> : <StatusChip status="inactive" />}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost" onClick={() => openEdit(item)}>Edit</button>
                    <button className="btn warn" onClick={() => remove(item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>

      <Modal title="Add catalog item" open={showAdd} onClose={() => setShowAdd(false)} maxWidth={480}>
        {renderForm()}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1 }} onClick={submitAdd}>Add item</button>
          <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      </Modal>
      <Modal title="Edit catalog item" open={!!editing} onClose={() => setEditing(null)} maxWidth={480}>
        {renderForm()}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1 }} onClick={submitEdit}>Save changes</button>
          <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// GST Manager — GSTIN/PAN + default tax rates, and an HSN/SAC code lookup
// list. Smart Garage 360's "GST Manager" sidebar page, kept close to its
// original concept — genuinely useful for an Indian billing SaaS.
// ============================================================================

interface GstSettings {
  gstin: string | null; pan: string | null; legal_name: string | null; place_of_supply: string | null
  default_cgst_percent: number; default_sgst_percent: number; default_igst_percent: number
}
const emptyGstSettings: GstSettings = {
  gstin: '', pan: '', legal_name: '', place_of_supply: '',
  default_cgst_percent: 0, default_sgst_percent: 0, default_igst_percent: 0,
}
interface TaxCode { id: string; code: string; description: string | null; gst_rate_percent: number }
const emptyTaxCodeForm = { code: '', description: '', gst_rate_percent: 0 }

export function GstManagerPage() {
  const [settings, setSettings] = useState<GstSettings>(emptyGstSettings)
  const [codes, setCodes] = useState<TaxCode[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [codeForm, setCodeForm] = useState(emptyTaxCodeForm)

  async function load() {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([
        apiFetch<GstSettings>('/gst/settings'),
        apiFetch<TaxCode[]>('/gst/tax-codes'),
      ])
      setSettings({ ...emptyGstSettings, ...s })
      setCodes(c)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function saveSettings() {
    setSaved(false)
    const updated = await apiFetch<GstSettings>('/gst/settings', { method: 'PUT', body: JSON.stringify(settings) })
    setSettings({ ...emptyGstSettings, ...updated })
    setSaved(true)
  }

  async function addCode() {
    if (!codeForm.code) return
    await apiFetch('/gst/tax-codes', { method: 'POST', body: JSON.stringify(codeForm) })
    setCodeForm(emptyTaxCodeForm)
    setShowAdd(false)
    load()
  }
  async function removeCode(id: string) {
    await apiFetch(`/gst/tax-codes/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <DashboardCard title="GST Manager"><p className="muted">Loading…</p></DashboardCard>

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DashboardCard title="GST Registration" subtitle="Your GSTIN, PAN, and default tax rates — used to pre-fill new invoices and quotations.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label>GSTIN<input value={settings.gstin || ''} onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" /></label>
          <label>PAN<input value={settings.pan || ''} onChange={(e) => setSettings({ ...settings, pan: e.target.value.toUpperCase() })} placeholder="AAAAA0000A" /></label>
          <label>Legal name<input value={settings.legal_name || ''} onChange={(e) => setSettings({ ...settings, legal_name: e.target.value })} /></label>
          <label>Place of supply<input value={settings.place_of_supply || ''} onChange={(e) => setSettings({ ...settings, place_of_supply: e.target.value })} placeholder="e.g. Kerala" /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
          <label>Default CGST %<input type="number" step="0.01" value={settings.default_cgst_percent} onChange={(e) => setSettings({ ...settings, default_cgst_percent: Number(e.target.value) })} /></label>
          <label>Default SGST %<input type="number" step="0.01" value={settings.default_sgst_percent} onChange={(e) => setSettings({ ...settings, default_sgst_percent: Number(e.target.value) })} /></label>
          <label>Default IGST %<input type="number" step="0.01" value={settings.default_igst_percent} onChange={(e) => setSettings({ ...settings, default_igst_percent: Number(e.target.value) })} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button className="btn" onClick={saveSettings}>Save GST Settings</button>
          {saved && <span className="status-chip status-chip-green">Saved</span>}
        </div>
      </DashboardCard>

      <DashboardCard title="HSN / SAC Codes" subtitle="A quick-reference list of the codes you bill under, for consistent invoicing." action={<button className="btn secondary" onClick={() => setShowAdd(true)}>+ Add code</button>}>
        {codes.length === 0 ? (
          <EmptyState title="No tax codes saved yet" sub="Add the HSN/SAC codes you commonly bill under." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Code</th><th>Description</th><th>GST rate</th><th></th></tr></thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.code}</td>
                  <td className="muted">{c.description || '—'}</td>
                  <td>{c.gst_rate_percent}%</td>
                  <td><button className="btn warn" onClick={() => removeCode(c.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>

      <Modal title="Add HSN/SAC code" open={showAdd} onClose={() => setShowAdd(false)} maxWidth={400}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>Code<input value={codeForm.code} onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value })} placeholder="e.g. 9983" /></label>
          <label>Description<input value={codeForm.description} onChange={(e) => setCodeForm({ ...codeForm, description: e.target.value })} placeholder="e.g. IT consulting services" /></label>
          <label>GST rate %<input type="number" step="0.01" value={codeForm.gst_rate_percent} onChange={(e) => setCodeForm({ ...codeForm, gst_rate_percent: Number(e.target.value) })} /></label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={addCode}>Add code</button>
            <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// Reports — this tenant's own revenue trend and document activity. The
// tenant-scoped equivalent of the Supreme Admin's platform Reports page.
// ============================================================================

interface TenantAnalyticsForReports {
  invoice_count: number
  quotation_count: number
  receipt_count: number
  outstanding_receivables: number
  revenue_collected: number
  overdue_invoice_count: number
  last_30_days_revenue: number
}

export function TenantReportsPage() {
  const [stats, setStats] = useState<TenantAnalyticsForReports | null>(null)
  useEffect(() => { apiFetch<TenantAnalyticsForReports>('/analytics/tenant').then(setStats).catch(() => {}) }, [])

  if (!stats) return <DashboardCard title="Reports"><p className="muted">Loading…</p></DashboardCard>

  return (
    <DashboardCard
      title="Reports"
      subtitle="Your revenue and document activity at a glance."
      action={<button className="btn secondary" onClick={() => window.print()}>⬇ Export / Print</button>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
        <div><div className="muted">Revenue collected</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.revenue_collected.toLocaleString()}</div></div>
        <div><div className="muted">Last 30 days</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.last_30_days_revenue.toLocaleString()}</div></div>
        <div><div className="muted">Outstanding receivables</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--amber)' }}>{stats.outstanding_receivables.toLocaleString()}</div></div>
        <div><div className="muted">Overdue invoices</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{stats.overdue_invoice_count}</div></div>
        <div><div className="muted">Total invoices</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.invoice_count}</div></div>
        <div><div className="muted">Total quotations</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.quotation_count}</div></div>
        <div><div className="muted">Total receipts</div><div style={{ fontSize: 20, fontWeight: 800 }}>{stats.receipt_count}</div></div>
      </div>
    </DashboardCard>
  )
}
