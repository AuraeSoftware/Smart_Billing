import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { downloadCsv } from '../../lib/csv'
import { useAuth } from '../../lib/auth'
import PasswordField from '../../components/PasswordField'
import { DashboardCard, KpiCard, StatusChip, EmptyState, Modal, DetailRow, Icon, ICONS } from '../../components/DashboardUI'

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
  plan_max_branches: number | null
  plan_max_products: number | null
  plan_has_priority_support: boolean
  plan_has_advanced_reports: boolean
  plan_has_employee_management: boolean
  plan_inventory_tier: string | null
  plan_role_permissions_tier: string | null
  plan_is_trial?: boolean
  plan_expires_at?: string | null
  days_left?: number | null
  expired?: boolean
}

interface UpgradePlan { id: string; name: string; price: number; currency: string; billing_cycle: string; max_users: number; max_invoices_per_month: number | null; is_trial: boolean; color: string }
interface UpgradeRequest { id: string; status: string; from_plan_name: string | null; to_plan_name: string; to_plan_price: number | null; to_plan_currency: string | null; to_plan_cycle: string | null; note: string | null; decision_note: string | null; created_at: string; decided_at: string | null }
interface PayInfo { bank_name: string | null; account_name: string | null; account_number: string | null; ifsc_code: string | null; upi_id: string | null; notes: string | null; gateway_available?: boolean }

function loadRazorpay(): Promise<void> {
  const w = window as unknown as { Razorpay?: unknown }
  if (w.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'))
    document.body.appendChild(s)
  })
}

export function MyPlanPage({ onPlanChanged }: { onPlanChanged?: () => void } = {}) {
  const [plan, setPlan] = useState<MyPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<MyPlan>('/account/my-plan').then(setPlan).finally(() => setLoading(false))
  }, [])

  if (loading) return <DashboardCard title="My Plan"><p className="muted">Loading…</p></DashboardCard>
  if (!plan) return <DashboardCard title="My Plan"><EmptyState title="Could not load plan details" /></DashboardCard>

  return (
    <>
    <DashboardCard title="My Plan" subtitle="Your plan, how long it lasts, and how to upgrade.">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <StatusChip status={plan.subscription_status} />
        <span className="muted">Billing currency: {plan.currency}</span>
        {plan.expired && <span className="status-chip status-chip-red">Plan expired</span>}
        {!plan.expired && plan.plan_expires_at && plan.days_left != null && plan.days_left <= 7 && <span className="status-chip status-chip-red">Expires in {plan.days_left} day{plan.days_left === 1 ? '' : 's'}</span>}
      </div>
      {plan.plan_name ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div><div className="muted">Plan</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_name}</div></div>
          <div><div className="muted">Price</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.currency} {plan.plan_price?.toFixed(2)} / {plan.plan_billing_cycle}</div></div>
          <div><div className="muted">Max users</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_users}</div></div>
          <div><div className="muted">Max invoices / month</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_invoices_per_month ?? 'Unlimited'}</div></div>
          <div><div className="muted">Max branches</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_branches ?? '—'}</div></div>
          <div><div className="muted">Max products</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_products ?? 'Unlimited'}</div></div>
          <div>
            <div className="muted">{plan.expired ? 'Expired on' : 'Valid until'}</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: plan.expired ? 'var(--red)' : undefined }}>
              {plan.plan_expires_at || 'No expiry'}
              {plan.days_left != null && !plan.expired && <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}> · {plan.days_left} day{plan.days_left === 1 ? '' : 's'} left</span>}
            </div>
          </div>
          {plan.plan_description && <div style={{ gridColumn: '1 / -1' }}><div className="muted">Description</div><div>{plan.plan_description}</div></div>}
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {plan.plan_has_priority_support && <span className="status-chip status-chip-blue">Priority support</span>}
            {plan.plan_has_advanced_reports && <span className="status-chip status-chip-blue">Advanced reports</span>}
            {plan.plan_has_employee_management && <span className="status-chip status-chip-blue">Employee management</span>}
            {plan.plan_inventory_tier === 'included' && <span className="status-chip status-chip-blue">Full inventory</span>}
            {plan.plan_role_permissions_tier && plan.plan_role_permissions_tier !== 'none' && <span className="status-chip status-chip-blue">Role permissions</span>}
          </div>
        </div>
      ) : (
        <EmptyState title="No plan assigned yet" sub="Aurae Software Solutions will assign a plan to your workspace shortly." />
      )}
    </DashboardCard>
    <UpgradeSection plan={plan} onRequested={onPlanChanged} />
    </>
  )
}

/** Upgrade / renewal: the Super Admin picks a plan and sends a request; the
 * Supreme Admin is notified and must approve before the plan changes. */
function UpgradeSection({ plan, onRequested }: { plan: MyPlan; onRequested?: () => void }) {
  const [requests, setRequests] = useState<UpgradeRequest[]>([])
  const [open, setOpen] = useState(false)
  const [plans, setPlans] = useState<UpgradePlan[]>([])
  const [choice, setChoice] = useState('')
  const [note, setNote] = useState('')
  const [pay, setPay] = useState<PayInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load() { apiFetch<UpgradeRequest[]>('/account/upgrade-requests').then(setRequests).catch(() => {}) }
  useEffect(load, [])

  const pending = requests.find((r) => r.status === 'pending')

  async function openDialog() {
    setError(null); setOpen(true)
    try {
      const all = await apiFetch<UpgradePlan[]>(`/subscription/plans?currency=${encodeURIComponent(plan.currency)}`)
      setPlans(all.filter((p) => !p.is_trial))
    } catch { setPlans([]) }
    apiFetch<PayInfo | null>('/account/payment-settings').then(setPay).catch(() => {})
  }

  async function submit() {
    setError(null)
    if (!choice) { setError('Choose the plan you want.'); return }
    setBusy(true)
    try {
      await apiFetch('/account/upgrade-requests', { method: 'POST', body: JSON.stringify({ plan_id: choice, note: note || null }) })
      setOpen(false); setChoice(''); setNote('')
      load(); onRequested?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the request.')
    } finally { setBusy(false) }
  }

  /** Online payment: pay by card/UPI/netbanking through Razorpay; the plan
   * changes straight away once the payment is verified. */
  async function payOnline() {
    setError(null)
    if (!choice) { setError('Choose the plan you want.'); return }
    setBusy(true)
    try {
      await loadRazorpay()
      const order = await apiFetch<{ order_id: string; amount: number; currency: string; key_id: string; plan_name: string }>(
        '/account/upgrade-payment/create-order', { method: 'POST', body: JSON.stringify({ plan_id: choice }) })
      const Rzp = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay
      new Rzp({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
        name: 'Smart Billing', description: `${order.plan_name} plan`, theme: { color: '#da1a31' },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await apiFetch('/account/upgrade-payment/verify', { method: 'POST', body: JSON.stringify(resp) })
            setOpen(false); setChoice(''); setNote('')
            load(); onRequested?.()
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Payment could not be verified. If money was deducted, contact Aurae Software Solutions.')
          } finally { setBusy(false) }
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not start the payment.')
      setBusy(false)
    }
  }

  const label = plan.expired ? 'Renew / upgrade plan' : 'Upgrade plan'
  return (
    <DashboardCard title="Upgrade or renew" subtitle="Pick a plan and send a request. Your plan changes after Aurae approves it.">
      {pending ? (
        <p style={{ color: 'var(--amber)', fontWeight: 700 }}>
          Request for {pending.to_plan_name} sent on {pending.created_at.slice(0, 10)}. Awaiting approval from Aurae Software Solutions.
        </p>
      ) : (
        <button className="btn amber" onClick={openDialog}>{label}</button>
      )}
      {requests.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 16 }}>
          <table>
            <thead><tr><th>Requested</th><th>Plan</th><th>Status</th><th>Reply</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at.slice(0, 10)}</td>
                  <td>{r.to_plan_name}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td style={{ whiteSpace: 'normal' }}>{r.decision_note || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Modal title={label} open onClose={() => setOpen(false)}>
          {plans.length === 0 ? <p className="muted">No plans are available in {plan.currency} right now. Contact Aurae Software Solutions.</p> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {plans.map((p) => (
                <div
                  key={p.id}
                  role="radio" aria-checked={choice === p.id} tabIndex={0}
                  onClick={() => setChoice(p.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChoice(p.id) } }}
                  style={{ display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'center', textAlign: 'left', border: `2px solid ${choice === p.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}
                >
                  <span aria-hidden style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--accent)', background: choice === p.id ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    <strong>{p.name}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                      {p.max_users} users · {p.max_invoices_per_month ?? 'Unlimited'} invoices/month
                    </span>
                  </span>
                  <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{p.currency} {p.price.toFixed(2)} / {p.billing_cycle}</span>
                </div>
              ))}
            </div>
          )}
          {pay && (pay.bank_name || pay.upi_id) && (
            <div style={{ marginTop: 12, fontSize: 13, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <strong>Pay Aurae Software Solutions</strong>
              {pay.bank_name && <div>{pay.bank_name}{pay.account_name ? ` · ${pay.account_name}` : ''}{pay.account_number ? ` · A/C ${pay.account_number}` : ''}{pay.ifsc_code ? ` · ${pay.ifsc_code}` : ''}</div>}
              {pay.upi_id && <div>UPI: {pay.upi_id}</div>}
              {pay.notes && <div className="muted">{pay.notes}</div>}
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <label>Payment reference or note (optional)</label>
            <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI ref 4821…" />
          </div>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {pay?.gateway_available && (
              <button className="btn" disabled={busy} onClick={payOnline}>{busy ? 'Please wait…' : 'Pay online'}</button>
            )}
            <button className="btn amber" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send request'}</button>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </DashboardCard>
  )
}

interface TeamCred { id: string; full_name: string; email: string; is_active: boolean }

/** Super Admin only: edit a team member's name / sign-in email, set a new
 * password for them, and switch their access on or off. */
function TeamCredentials() {
  const [rows, setRows] = useState<TeamCred[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TeamCred | null>(null)
  const [resetting, setResetting] = useState<TeamCred | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    try { setRows(await apiFetch<TeamCred[]>('/tenant-users')) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function saveEdit() {
    if (!editing) return
    setErr('')
    try {
      await apiFetch(`/tenant-users/${editing.id}`, { method: 'PUT', body: JSON.stringify({ full_name: name, email }) })
      setEditing(null); setNote('Team member updated.'); load()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.') }
  }
  async function savePassword() {
    if (!resetting) return
    setErr('')
    if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return }
    try {
      await apiFetch(`/tenant-users/${resetting.id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: pw }) })
      setResetting(null); setPw(''); setNote(`New password set for ${resetting.full_name}.`)
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not set the password.') }
  }
  async function toggle(m: TeamCred) {
    setErr(''); setNote('')
    try {
      await apiFetch(`/tenant-users/${m.id}/${m.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' })
      load()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not update access.') }
  }

  return (
    <DashboardCard title="Team credentials" subtitle="Change a team member's name or email, set a new password, or switch their access on or off.">
      {note && <p className="muted" role="status">{note}</p>}
      {!editing && !resetting && err && <p className="error-text" role="alert">{err}</p>}
      {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
        <EmptyState title="No team members yet" sub="Add team members from the Team tab." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 700 }}>{m.full_name}</td>
                  <td className="muted">{m.email}</td>
                  <td>{m.is_active ? <StatusChip status="active" /> : <StatusChip status="inactive" />}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn ghost" onClick={() => { setEditing(m); setName(m.full_name); setEmail(m.email); setErr('') }}>Edit</button>
                    <button className="btn secondary" onClick={() => { setResetting(m); setPw(''); setErr('') }}>Reset password</button>
                    <button className={m.is_active ? 'btn warn' : 'btn secondary'} onClick={() => toggle(m)}>{m.is_active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title="Edit team member" open={!!editing} onClose={() => setEditing(null)} maxWidth={420}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Email<input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {err && <p className="error-text" role="alert">{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={saveEdit} disabled={!name.trim() || !email.trim()}>Save changes</button>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      </Modal>
      <Modal title={`New password for ${resetting?.full_name ?? ''}`} open={!!resetting} onClose={() => setResetting(null)} maxWidth={420}>
        <div style={{ display: 'grid', gap: 12 }}>
          <PasswordField label="New password" autoComplete="new-password" minLength={8} value={pw} onChange={setPw} />
          {err && <p className="error-text" role="alert">{err}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={savePassword}>Set password</button>
            <button className="btn ghost" onClick={() => setResetting(null)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </DashboardCard>
  )
}

export function TenantCredentialsPage() {
  const { session } = useAuth()
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
    <div style={{ display: 'grid', gap: 20 }}>
    <DashboardCard title="Credentials" subtitle="Change your own password.">
      <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
        <PasswordField label="Current password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
        <PasswordField label="New password" autoComplete="new-password" minLength={8} value={newPassword} onChange={setNewPassword} />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {message && <p style={{ color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</p>}
        <button className="btn" onClick={submit} disabled={!currentPassword || !newPassword}>Update password</button>
      </div>
    </DashboardCard>
    {session?.role !== 'tenant_user' && <TeamCredentials />}
    </div>
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

// SB04: "typing 'QA Cal' showed no customer suggestions, and clicking the
// customer row did not open a detail or invoice-creation screen" — the
// searchable suggestions were added to the invoice/quotation editor itself
// (see CustomerField in SuperAdminDashboard.tsx); this closes the other
// half by giving each row a real action: a detail panel (contact info,
// invoice/quotation totals) and a one-click "New invoice" that jumps to the
// Invoices tab with this customer pre-filled.
export function CustomersPage({ onCreateInvoice }: { onCreateInvoice?: (customerName: string) => void } = {}) {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<CustomerRow | null>(null)

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
        subtitle="Everyone you have sent an invoice or quotation to. This list builds itself."
        action={<div className="search-box" style={{ width: 'min(300px, 100%)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="search" aria-label="Search customers" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>}
      >
        {loading ? <p className="muted">Loading…</p> : filtered.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.users} size={22} />} title="No customers yet" sub="Customers appear here as soon as you create an invoice or quotation." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Customer</th><th>Email</th><th>Invoices</th><th>Quotations</th><th>Billed</th><th>Paid</th><th>Last activity</th><th></th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.name} style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td className="muted">{r.email || '—'}</td>
                  <td>{r.invoice_count}</td>
                  <td>{r.quotation_count}</td>
                  <td style={{ fontWeight: 700 }}>{r.total_billed.toLocaleString()}</td>
                  <td style={{ color: 'var(--green)' }}>{r.total_paid.toLocaleString()}</td>
                  <td className="muted">{r.last_activity ? new Date(r.last_activity).toLocaleDateString() : '—'}</td>
                  <td>
                    {onCreateInvoice && (
                      <button
                        className="btn secondary"
                        onClick={(e) => { e.stopPropagation(); onCreateInvoice(r.name) }}
                      >
                        + New invoice
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </DashboardCard>

      <Modal title={detail?.name || 'Customer'} open={!!detail} onClose={() => setDetail(null)} maxWidth={440}>
        {detail && (
          <div style={{ display: 'grid', gap: 10 }}>
            <DetailRow label="Email" value={detail.email || '—'} />
            <DetailRow label="Invoices" value={detail.invoice_count} />
            <DetailRow label="Quotations" value={detail.quotation_count} />
            <DetailRow label="Total billed" value={detail.total_billed.toLocaleString()} />
            <DetailRow label="Total paid" value={detail.total_paid.toLocaleString()} />
            <DetailRow label="Outstanding" value={(detail.total_billed - detail.total_paid).toLocaleString()} strong />
            <DetailRow label="Last activity" value={detail.last_activity ? new Date(detail.last_activity).toLocaleDateString() : '—'} />
            {onCreateInvoice && (
              <button
                className="btn amber"
                style={{ marginTop: 6 }}
                onClick={() => { const name = detail.name; setDetail(null); onCreateInvoice(name) }}
              >
                + New invoice for {detail.name}
              </button>
            )}
          </div>
        )}
      </Modal>
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

  const [toggleError, setToggleError] = useState('')
  async function toggle(m: TeamMember) {
    setToggleError('')
    try {
      await apiFetch(`/tenant-users/${m.id}/${m.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' })
    } catch (e) {
      setToggleError(e instanceof ApiError ? e.message : 'Could not update this team member.')
    }
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

      {toggleError && <p className="error-text" role="alert">{toggleError}</p>}
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
          <label>Email<input type="email" name="team-member-email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <PasswordField label="Password" autoComplete="new-password" minLength={8} value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
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
  const [catSearch, setCatSearch] = useState('')

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
        <label>Unit price<input type="number" min={0} step="0.01" placeholder="0" value={form.default_unit_price === 0 ? '' : form.default_unit_price} onChange={(e) => setForm({ ...form, default_unit_price: Number(e.target.value) })} /></label>
        <label>Tax %<input type="number" min={0} max={100} step="0.01" placeholder="0" value={form.default_tax_rate_percent === 0 ? '' : form.default_tax_rate_percent} onChange={(e) => setForm({ ...form, default_tax_rate_percent: Number(e.target.value) })} /></label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active — available when creating invoices/quotations
      </label>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard icon={<Icon path={ICONS.package} />} label="Items" value={rows.length} color="var(--accent)" />
        <KpiCard icon={<Icon path={ICONS.checkCircle} />} label="Active" value={rows.filter((r) => r.is_active).length} color="var(--green)" />
        <KpiCard icon={<Icon path={ICONS.xCircle} />} label="Inactive" value={rows.filter((r) => !r.is_active).length} color="var(--amber)" />
      </div>

      <DashboardCard
        title="Catalog"
        subtitle="Save a priced item once, then drop it into any invoice or quotation line without retyping price and tax."
        action={(
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-box" style={{ width: 'min(300px, 100%)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input type="search" aria-label="Search catalog" placeholder="Search items" value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
          </div>
            <button className="btn" onClick={openAdd}>+ Add item</button>
          </div>
        )}
      >
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
          <EmptyState icon={<Icon path={ICONS.invoice} size={22} />} title="No catalog items yet" sub="Click 'Add item' to save your first reusable line item." />
        ) : (
          <div className="table-scroll">
          <table>
            <thead><tr><th>Item</th><th>Unit</th><th>Unit price</th><th>Tax %</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.filter((r) => `${r.name} ${r.description || ''}`.toLowerCase().includes(catSearch.toLowerCase())).map((item) => (
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
  address: string | null; phone: string | null; email: string | null; tax_id: string | null
  default_cgst_percent: number; default_sgst_percent: number; default_igst_percent: number
}
const emptyGstSettings: GstSettings = {
  gstin: '', pan: '', legal_name: '', place_of_supply: '',
  address: '', phone: '', email: '', tax_id: '',
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
  const [codeError, setCodeError] = useState<string | null>(null)

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

  const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
  const panValue = (settings.pan || '').trim()
  const gstinValue = (settings.gstin || '').trim()
  const panError = panValue && !PAN_RE.test(panValue) ? 'PAN is 10 characters: 5 letters, 4 digits, 1 letter (for example ABCDE1234F).' : ''
  const gstinError = gstinValue && !GSTIN_RE.test(gstinValue) ? 'GSTIN is 15 characters, for example 22AAAAA0000A1Z5.' : ''
  const [gstError, setGstError] = useState<string | null>(null)

  async function saveSettings() {
    setSaved(false); setGstError(null)
    if (panError || gstinError) { setGstError(panError || gstinError); return }
    try {
      const updated = await apiFetch<GstSettings>('/gst/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setSettings({ ...emptyGstSettings, ...updated })
      setSaved(true)
    } catch (err) {
      setGstError(err instanceof ApiError ? err.message : 'Could not save. Please try again.')
    }
  }

  async function addCode() {
    if (!codeForm.code.trim()) { setCodeError('Enter the HSN/SAC code.'); return }
    setCodeError(null)
    try {
      await apiFetch('/gst/tax-codes', { method: 'POST', body: JSON.stringify(codeForm) })
      setCodeForm(emptyTaxCodeForm)
      setShowAdd(false)
      load()
    } catch (err) {
      setCodeError(err instanceof ApiError ? err.message : 'Could not add the code.')
    }
  }
  async function removeCode(id: string) {
    await apiFetch(`/gst/tax-codes/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <DashboardCard title="GST Manager"><p className="muted">Loading…</p></DashboardCard>

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DashboardCard title="GST Registration" subtitle="Your GSTIN, PAN and tax rates. They fill in new invoices and quotations for you.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label>GSTIN<input maxLength={15} spellCheck={false} aria-invalid={!!gstinError} value={settings.gstin || ''} onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="22AAAAA0000A1Z5" />
            {gstinError && <span className="error-text" style={{ fontSize: 12 }}>{gstinError}</span>}</label>
          <label>PAN<input data-pan maxLength={10} spellCheck={false} aria-invalid={!!panError} value={settings.pan || ''} onChange={(e) => setSettings({ ...settings, pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) })} placeholder="ABCDE1234F" />
            {panError && <span className="error-text" style={{ fontSize: 12 }}>{panError}</span>}</label>
          <label>Legal name<input value={settings.legal_name || ''} onChange={(e) => setSettings({ ...settings, legal_name: e.target.value })} /></label>
          <label>Place of supply<input value={settings.place_of_supply || ''} onChange={(e) => setSettings({ ...settings, place_of_supply: e.target.value })} placeholder="e.g. Kerala" /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
          <label>TIN / SSM no.<input maxLength={60} spellCheck={false} value={settings.tax_id || ''} onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })} placeholder="Tax ID or SSM registration" /></label>
          <label>Phone no.<input type="tel" maxLength={30} value={settings.phone || ''} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} placeholder="+60 12 345 6789" /></label>
          <label>Email<input type="email" maxLength={255} value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} placeholder="accounts@business.com" /></label>
          <label style={{ gridColumn: '1 / -1' }}>Address<textarea rows={2} maxLength={500} value={settings.address || ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} placeholder="Street, city, state, postcode" /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
          <label>Default CGST %<input type="number" min={0} max={100} step="0.01" value={settings.default_cgst_percent} onChange={(e) => setSettings({ ...settings, default_cgst_percent: Number(e.target.value) })} /></label>
          <label>Default SGST %<input type="number" min={0} max={100} step="0.01" value={settings.default_sgst_percent} onChange={(e) => setSettings({ ...settings, default_sgst_percent: Number(e.target.value) })} /></label>
          <label>Default IGST %<input type="number" min={0} max={100} step="0.01" value={settings.default_igst_percent} onChange={(e) => setSettings({ ...settings, default_igst_percent: Number(e.target.value) })} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn" onClick={saveSettings} style={{ minWidth: 160 }}>Save GST Settings</button>
          {saved && <span className="status-chip status-chip-green">Saved</span>}
          {gstError && <span className="error-text" style={{ margin: 0 }}>{gstError}</span>}
        </div>
      </DashboardCard>

      <DashboardCard title="HSN / SAC Codes" subtitle="Keep the HSN/SAC codes you use here, so billing stays consistent." action={<button className="btn secondary" onClick={() => setShowAdd(true)}>+ Add code</button>}>
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
          <label>GST rate %<input type="number" min={0} max={100} step="0.01" value={codeForm.gst_rate_percent} onChange={(e) => setCodeForm({ ...codeForm, gst_rate_percent: Number(e.target.value) })} /></label>
          {codeError && <p className="error-text" style={{ margin: 0 }}>{codeError}</p>}
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

// SB06 — date-filtered report rows + a real CSV export, additive alongside
// the all-time stats already fetched above (unchanged).
interface ReportRow { date: string; doc_type: string; number: string; customer_name: string; status: string; amount: number; completed_on?: string | null }
interface TenantReportOut {
  from_date: string | null; to_date: string | null
  invoice_count: number; quotation_count: number; receipt_count: number
  revenue_collected: number; outstanding_receivables: number
  rows: ReportRow[]
}

export function TenantReportsPage() {
  const [stats, setStats] = useState<TenantAnalyticsForReports | null>(null)
  useEffect(() => { apiFetch<TenantAnalyticsForReports>('/analytics/tenant').then(setStats).catch(() => {}) }, [])

  // Date range defaults to the last 30 days so the page opens with something
  // useful, same window as the "Last 30 days" KPI already on this page —
  // either end can be cleared/widened at will.
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [report, setReport] = useState<TenantReportOut | null>(null)
  const [loadingReport, setLoadingReport] = useState(true)

  useEffect(() => {
    setLoadingReport(true)
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    apiFetch<TenantReportOut>(`/analytics/tenant/report?${params.toString()}`)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoadingReport(false))
  }, [fromDate, toDate])

  function exportCsv() {
    if (!report || report.rows.length === 0) return
    downloadCsv(`report_${fromDate || 'all'}_to_${toDate || 'all'}.csv`, [
      { title: 'Smart Billing - Date-range report', rows: [
        ['Generated', new Date().toLocaleString()],
        ['From', fromDate || 'Beginning'],
        ['To', toDate || 'Today'],
      ] },
      { title: 'Summary for this range', headers: ['Metric', 'Value'], rows: [
        ['Revenue collected', report.revenue_collected.toFixed(2)],
        ['Outstanding receivables', report.outstanding_receivables.toFixed(2)],
        ['Invoices', report.invoice_count], ['Quotations', report.quotation_count], ['Receipts', report.receipt_count],
      ] },
      { title: 'Documents', headers: ['Date', 'Type', 'Number', 'Customer', 'Status', 'Paid / converted on', 'Amount'],
        rows: report.rows.map((r) => [r.date, r.doc_type, r.number, r.customer_name, r.status.replaceAll('_', ' '), r.completed_on || '', r.amount.toFixed(2)]) },
    ])
  }

  if (!stats) return <DashboardCard title="Reports"><p className="muted">Loading…</p></DashboardCard>

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DashboardCard title="Reports" subtitle="Your sales and documents at a glance (all time).">
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

      <DashboardCard
        title="Date-range report"
        subtitle="Choose dates to filter the list below, then download it as a CSV."
        action={<button className="btn secondary" onClick={exportCsv} disabled={!report || report.rows.length === 0}>⬇ Export (CSV)</button>}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="field" style={{ minWidth: 160 }}><label>From</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="field" style={{ minWidth: 160 }}><label>To</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
        </div>

        {loadingReport ? <p className="muted">Loading…</p> : !report || report.rows.length === 0 ? (
          <EmptyState title="No activity in this range" sub="Try widening the date range." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16, marginBottom: 16 }}>
              <div><div className="muted">Revenue in range</div><div style={{ fontSize: 18, fontWeight: 800 }}>{report.revenue_collected.toLocaleString()}</div></div>
              <div><div className="muted">Outstanding (as of range)</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber)' }}>{report.outstanding_receivables.toLocaleString()}</div></div>
              <div><div className="muted">Invoices</div><div style={{ fontSize: 18, fontWeight: 800 }}>{report.invoice_count}</div></div>
              <div><div className="muted">Quotations</div><div style={{ fontSize: 18, fontWeight: 800 }}>{report.quotation_count}</div></div>
              <div><div className="muted">Receipts</div><div style={{ fontSize: 18, fontWeight: 800 }}>{report.receipt_count}</div></div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Number</th><th>Customer</th><th>Status</th><th>Paid / converted on</th><th>Amount</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={`${r.doc_type}-${r.number}`}>
                      <td>{r.date}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.doc_type}</td>
                      <td style={{ fontWeight: 700 }}>{r.number}</td>
                      <td>{r.customer_name}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.status.replaceAll('_', ' ')}</td>
                      <td>{r.completed_on || '—'}</td>
                      <td>{r.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DashboardCard>
    </div>
  )
}
