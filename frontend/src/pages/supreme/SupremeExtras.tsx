import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { DashboardCard, StatusChip, EmptyState } from '../../components/DashboardUI'

/**
 * Real backend-backed pages for the rest of Smart Garage 360's Supreme
 * Admin sidebar: Super Admins, Subscription Plans, Currency Config,
 * Subscription History, Payment Settings, Reports, Credentials. Kept in
 * their own file so SupremeAdminDashboard.tsx stays focused on the
 * Overview command center.
 */

// --------------------------------------------------------------------------
// Super Admins
// --------------------------------------------------------------------------

interface SuperAdminRow {
  id: string
  full_name: string
  email: string
  is_active: boolean
  is_suspended: boolean
  tenant_id: string | null
  tenant_name: string | null
  tenant_status: string | null
  tenant_currency: string | null
  plan_name: string | null
  created_at: string
}

export function SuperAdminsPage() {
  const [rows, setRows] = useState<SuperAdminRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setRows(await apiFetch<SuperAdminRow[]>('/admin/super-admins'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function suspend(id: string) { await apiFetch(`/admin/users/${id}/suspend`, { method: 'POST' }); load() }
  async function reactivate(id: string) { await apiFetch(`/admin/users/${id}/reactivate`, { method: 'POST' }); load() }
  async function deregister(id: string) { await apiFetch(`/admin/users/${id}/deregister-device`, { method: 'POST' }); load() }

  return (
    <DashboardCard title="Super Admins" subtitle="Every tenant's Super Admin account, with plan and currency context.">
      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No Super Admins yet" sub="They're created automatically when a tenant signs up." />
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Tenant</th><th>Tenant status</th><th>Plan</th><th>Currency</th><th>Credential</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td>{r.email}</td>
                <td>{r.tenant_name || '—'}</td>
                <td>{r.tenant_status ? <StatusChip status={r.tenant_status} /> : '—'}</td>
                <td>{r.plan_name || <span className="muted">Unassigned</span>}</td>
                <td>{r.tenant_currency || '—'}</td>
                <td>{r.is_suspended ? <StatusChip status="suspended" /> : <StatusChip status="active" />}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.is_suspended ? (
                    <button className="btn secondary" onClick={() => reactivate(r.id)}>Reactivate</button>
                  ) : (
                    <button className="btn warn" onClick={() => suspend(r.id)}>Suspend</button>
                  )}
                  <button className="btn ghost" onClick={() => deregister(r.id)}>De-register device</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  )
}

// --------------------------------------------------------------------------
// Subscription Plans
// --------------------------------------------------------------------------

interface PlanRow {
  id: string
  name: string
  description: string | null
  currency: string
  price: number
  billing_cycle: string
  max_users: number
  max_invoices_per_month: number
  is_active: boolean
  tenant_count: number
}

const emptyPlanForm = {
  name: '', description: '', currency: 'INR', price: 0, billing_cycle: 'monthly',
  max_users: 5, max_invoices_per_month: 100, is_active: true,
}

export function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyPlanForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      setPlans(await apiFetch<PlanRow[]>('/admin/subscription-plans'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function startEdit(p: PlanRow) {
    setEditingId(p.id)
    setForm({
      name: p.name, description: p.description || '', currency: p.currency, price: p.price,
      billing_cycle: p.billing_cycle, max_users: p.max_users,
      max_invoices_per_month: p.max_invoices_per_month, is_active: p.is_active,
    })
  }
  function resetForm() { setEditingId(null); setForm(emptyPlanForm); setError('') }

  async function save() {
    setError('')
    try {
      if (editingId) {
        await apiFetch(`/admin/subscription-plans/${editingId}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await apiFetch('/admin/subscription-plans', { method: 'POST', body: JSON.stringify(form) })
      }
      resetForm()
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the plan.')
    }
  }

  async function deactivate(id: string) {
    await apiFetch(`/admin/subscription-plans/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DashboardCard title={editingId ? 'Edit plan' : 'New plan'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Currency<input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={10} /></label>
          <label>Price<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></label>
          <label>Billing cycle
            <select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>Max users<input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} /></label>
          <label>Max invoices/mo<input type="number" value={form.max_invoices_per_month} onChange={(e) => setForm({ ...form, max_invoices_per_month: Number(e.target.value) })} /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>Description
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ width: '100%' }} />
        </label>
        {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={save}>{editingId ? 'Save changes' : 'Create plan'}</button>
          {editingId && <button className="btn ghost" onClick={resetForm}>Cancel</button>}
        </div>
      </DashboardCard>

      <DashboardCard title="Plans" subtitle="Assigned from a tenant's row in Super Admins.">
        {loading ? <p className="muted">Loading…</p> : plans.length === 0 ? (
          <EmptyState title="No plans yet" sub="Create your first plan above." />
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Cycle</th><th>Limits</th><th>Tenants</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.currency} {p.price.toFixed(2)}</td>
                  <td>{p.billing_cycle}</td>
                  <td>{p.max_users} users · {p.max_invoices_per_month}/mo</td>
                  <td>{p.tenant_count}</td>
                  <td>{p.is_active ? <StatusChip status="active" /> : <StatusChip status="cancelled" />}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn secondary" onClick={() => startEdit(p)}>Edit</button>
                    {p.is_active && <button className="btn warn" onClick={() => deactivate(p.id)}>Deactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardCard>
    </div>
  )
}

// --------------------------------------------------------------------------
// Currency Config — assign per-tenant currency + plan
// --------------------------------------------------------------------------

interface TenantRow { id: string; name: string; slug: string; subscription_status: string; currency: string }

export function CurrencyConfigPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    const [t, p] = await Promise.all([
      apiFetch<TenantRow[]>('/admin/tenants'),
      apiFetch<PlanRow[]>('/admin/subscription-plans'),
    ])
    setTenants(t)
    setPlans(p)
  }
  useEffect(() => { load() }, [])

  async function setCurrency(tenantId: string, currency: string) {
    setSaving(tenantId)
    try {
      await apiFetch(`/admin/tenants/${tenantId}/currency`, { method: 'PUT', body: JSON.stringify({ currency }) })
      load()
    } finally {
      setSaving(null)
    }
  }
  async function assignPlan(tenantId: string, planId: string) {
    setSaving(tenantId)
    try {
      await apiFetch(`/admin/tenants/${tenantId}/assign-plan`, { method: 'POST', body: JSON.stringify({ plan_id: planId || null }) })
      load()
    } finally {
      setSaving(null)
    }
  }

  return (
    <DashboardCard title="Currency & Plan Config" subtitle="Per-tenant billing currency and plan assignment.">
      {tenants.length === 0 ? <EmptyState title="No tenants yet" /> : (
        <table>
          <thead><tr><th>Tenant</th><th>Status</th><th>Currency</th><th>Plan</th></tr></thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td><StatusChip status={t.subscription_status} /></td>
                <td>
                  <input
                    defaultValue={t.currency}
                    disabled={saving === t.id}
                    style={{ width: 70 }}
                    onBlur={(e) => e.target.value.toUpperCase() !== t.currency && setCurrency(t.id, e.target.value)}
                  />
                </td>
                <td>
                  <select
                    defaultValue=""
                    disabled={saving === t.id}
                    onChange={(e) => assignPlan(t.id, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {plans.filter((p) => p.is_active).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  )
}

// --------------------------------------------------------------------------
// Subscription History
// --------------------------------------------------------------------------

interface SubEvent {
  id: string; tenant_id: string; tenant_name: string | null; event_type: string
  old_value: string | null; new_value: string | null; note: string | null
  changed_by_label: string | null; created_at: string
}

export function SubscriptionHistoryPage() {
  const [events, setEvents] = useState<SubEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<SubEvent[]>('/admin/subscription-history').then(setEvents).finally(() => setLoading(false))
  }, [])

  return (
    <DashboardCard title="Subscription History" subtitle="Every signup, activation, suspension, plan and currency change — across all tenants.">
      {loading ? <p className="muted">Loading…</p> : events.length === 0 ? (
        <EmptyState title="No events yet" />
      ) : (
        <table>
          <thead><tr><th>When</th><th>Tenant</th><th>Event</th><th>Change</th><th>By</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.tenant_name || '—'}</td>
                <td>{e.event_type.replaceAll('_', ' ')}</td>
                <td>{e.old_value || '—'} → {e.new_value || '—'}{e.note ? ` (${e.note})` : ''}</td>
                <td>{e.changed_by_label || 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  )
}

// --------------------------------------------------------------------------
// Payment Settings
// --------------------------------------------------------------------------

interface PaymentSettings {
  bank_name: string | null; account_name: string | null; account_number: string | null
  ifsc_code: string | null; upi_id: string | null; supported_gateways: string | null; notes: string | null
}
const emptyPayment: PaymentSettings = {
  bank_name: '', account_name: '', account_number: '', ifsc_code: '', upi_id: '', supported_gateways: '', notes: '',
}

export function PaymentSettingsPage() {
  const [form, setForm] = useState<PaymentSettings>(emptyPayment)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiFetch<PaymentSettings>('/admin/payment-settings').then((s) => setForm({ ...emptyPayment, ...s })).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaved(false)
    await apiFetch('/admin/payment-settings', { method: 'PUT', body: JSON.stringify(form) })
    setSaved(true)
  }

  if (loading) return <DashboardCard title="Payment Settings"><p className="muted">Loading…</p></DashboardCard>

  return (
    <DashboardCard title="Payment Settings" subtitle="Published platform-wide — every Super Admin sees a read-only copy.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label>Bank name<input value={form.bank_name || ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></label>
        <label>Account name<input value={form.account_name || ''} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></label>
        <label>Account number<input value={form.account_number || ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></label>
        <label>IFSC code<input value={form.ifsc_code || ''} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} /></label>
        <label>UPI ID<input value={form.upi_id || ''} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} /></label>
        <label>Supported gateways<input value={form.supported_gateways || ''} onChange={(e) => setForm({ ...form, supported_gateways: e.target.value })} placeholder="Razorpay, Stripe, UPI" /></label>
      </div>
      <label style={{ display: 'block', marginTop: 12 }}>Notes
        <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: '100%' }} />
      </label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
        <button className="btn" onClick={save}>Save</button>
        {saved && <span className="status-chip status-chip-green">Saved</span>}
      </div>
    </DashboardCard>
  )
}

// --------------------------------------------------------------------------
// Credentials — Supreme Admin's own password change
// --------------------------------------------------------------------------

export function CredentialsPage() {
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
      await apiFetch('/admin/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
      setMessage({ text: 'Password updated.', ok: true })
      setCurrentPassword(''); setNewPassword(''); setConfirm('')
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'Could not update password.', ok: false })
    }
  }

  return (
    <DashboardCard title="Credentials" subtitle="Change the password for this Supreme Admin account.">
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

// --------------------------------------------------------------------------
// Reports — reuses the platform analytics endpoints already built for
// Overview, presented as printable tables (Smart Garage 360's Reports page
// is the same underlying data set, formatted for export).
// --------------------------------------------------------------------------

interface TenantRevenueRow {
  tenant_id: string; name: string; slug: string; contact_email: string
  subscription_status: string; created_at: string
  invoice_count: number; quotation_count: number; receipt_count: number; revenue_collected: number
}

export function ReportsPage() {
  const [rows, setRows] = useState<TenantRevenueRow[]>([])
  useEffect(() => { apiFetch<TenantRevenueRow[]>('/analytics/platform/tenants').then(setRows).catch(() => {}) }, [])

  const totalRevenue = rows.reduce((s, r) => s + r.revenue_collected, 0)
  const totalDocs = rows.reduce((s, r) => s + r.invoice_count + r.quotation_count + r.receipt_count, 0)

  return (
    <DashboardCard
      title="Reports"
      subtitle="Platform-wide revenue and document activity, by tenant."
      action={<button className="btn secondary" onClick={() => window.print()}>⬇ Export / Print</button>}
    >
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div><div className="muted">Total revenue</div><div style={{ fontSize: 20, fontWeight: 800 }}>{totalRevenue.toLocaleString(undefined, { style: 'currency', currency: 'INR' })}</div></div>
        <div><div className="muted">Total documents</div><div style={{ fontSize: 20, fontWeight: 800 }}>{totalDocs}</div></div>
        <div><div className="muted">Tenants</div><div style={{ fontSize: 20, fontWeight: 800 }}>{rows.length}</div></div>
      </div>
      {rows.length === 0 ? <EmptyState title="No data yet" /> : (
        <table>
          <thead><tr><th>Tenant</th><th>Status</th><th>Invoices</th><th>Quotations</th><th>Receipts</th><th>Revenue</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenant_id}>
                <td>{r.name}</td>
                <td><StatusChip status={r.subscription_status} /></td>
                <td>{r.invoice_count}</td>
                <td>{r.quotation_count}</td>
                <td>{r.receipt_count}</td>
                <td>{r.revenue_collected.toLocaleString(undefined, { style: 'currency', currency: 'INR' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  )
}
