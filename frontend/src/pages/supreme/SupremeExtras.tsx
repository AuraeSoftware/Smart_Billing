import { Fragment, useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { DashboardCard, KpiCard, StatusChip, EmptyState, Modal, DetailRow, Icon, ICONS } from '../../components/DashboardUI'

/**
 * Real backend-backed pages for the rest of Smart Garage 360's Supreme
 * Admin sidebar — rebuilt to match its actual source (washpro-main,
 * AdminShell.jsx / SuperAdminsPage.jsx / AdminPages.jsx /
 * SubscriptionHistoryPage.jsx) one-for-one in structure: card grids
 * instead of flat tables where Smart Garage uses cards, the same
 * stats-row + tab-toggle + expandable-card pattern for Super Admins, the
 * same colour-swatch + feature-checklist plan cards, the same
 * exchange-rate + per-plan-override table for Currency Config, and the
 * same Razorpay gateway form for Payment Settings — with every field
 * backed by a real endpoint, adapted to billing-domain data.
 */

const PLAN_COLORS = ['#da1a31', '#059669', '#d97706', '#3b82f6', '#8b5cf6', '#dc2626']

// ============================================================================
// Super Admins — card grid, stats row, All/Pending toggle, expandable card
// ============================================================================

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
  invoices_used: number
  invoices_limit: number | null
  usage_percent: number
  days_until_reset: number
  warning_level: 'none' | 'warning' | 'critical' | 'limit_reached'
}
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
  color: string
  has_priority_support: boolean
  has_api_access: boolean
  has_advanced_reports: boolean
  has_multi_currency: boolean
  tenant_count: number
}

export function SuperAdminsPage() {
  const [rows, setRows] = useState<SuperAdminRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'All' | 'Pending'>('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<SuperAdminRow | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', email: '', new_password: '' })
  const [showSub, setShowSub] = useState<SuperAdminRow | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [admins, planList] = await Promise.all([
        apiFetch<SuperAdminRow[]>('/admin/super-admins'),
        apiFetch<PlanRow[]>('/admin/subscription-plans'),
      ])
      setRows(admins)
      setPlans(planList)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const activeCount = rows.filter((r) => !r.is_suspended).length
  const suspendedCount = rows.filter((r) => r.is_suspended).length
  const pending = rows.filter((r) => r.tenant_status === 'pending_onboarding')
  const displayed = view === 'Pending' ? pending : rows.filter((r) => r.tenant_status !== 'pending_onboarding')

  async function toggleSuspend(r: SuperAdminRow) {
    await apiFetch(`/admin/users/${r.id}/${r.is_suspended ? 'reactivate' : 'suspend'}`, { method: 'POST' })
    load()
  }

  // Tenant-level activation, distinct from toggleSuspend above (which only
  // suspends/reactivates the Super Admin's login credential). A tenant
  // freshly signed up sits in "pending_onboarding" until the Supreme Admin
  // activates its workspace — that's this action.
  async function tenantAction(r: SuperAdminRow, action: 'suspend' | 'reactivate') {
    if (!r.tenant_id) return
    await apiFetch(`/admin/tenants/${r.tenant_id}/${action}`, { method: 'POST' })
    load()
  }

  function openEdit(r: SuperAdminRow) {
    setEditing(r)
    setEditForm({ full_name: r.full_name, email: r.email, new_password: '' })
  }
  async function saveEdit() {
    if (!editing) return
    await apiFetch(`/admin/users/${editing.id}`, { method: 'PUT', body: JSON.stringify({ full_name: editForm.full_name, email: editForm.email }) })
    if (editForm.new_password) {
      await apiFetch(`/admin/users/${editing.id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: editForm.new_password }) })
    }
    setEditing(null)
    load()
  }

  async function assignPlan(planId: string | null) {
    if (!showSub || !showSub.tenant_id) return
    await apiFetch(`/admin/tenants/${showSub.tenant_id}/assign-plan`, { method: 'POST', body: JSON.stringify({ plan_id: planId }) })
    setShowSub(null)
    load()
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard icon={<Icon path={ICONS.users} />} label="Total Super Admins" value={rows.length} color="var(--accent)" />
        <KpiCard icon={<Icon path="M20 6L9 17l-5-5" />} label="Active" value={activeCount} color="var(--green)" />
        <KpiCard icon={<Icon path={ICONS.alert} />} label="Suspended" value={suspendedCount} color="var(--red)" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Super Admins</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>Manage every tenant's Super Admin account, plan, and credentials.</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg-3)', padding: 4, borderRadius: 10 }}>
          <button className={view === 'All' ? 'btn' : 'btn ghost'} style={{ padding: '8px 16px' }} onClick={() => setView('All')}>Active &amp; Suspended</button>
          <button className={view === 'Pending' ? 'btn' : 'btn ghost'} style={{ padding: '8px 16px' }} onClick={() => setView('Pending')}>
            Pending Onboarding {pending.length > 0 && <span className="status-chip status-chip-red" style={{ marginLeft: 6 }}>{pending.length}</span>}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : displayed.length === 0 ? (
        <EmptyState title={view === 'Pending' ? 'No pending onboarding' : 'No Super Admins found'} sub="They're created automatically when a tenant signs up." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
          {displayed.map((r) => {
            const isSuspended = r.is_suspended
            return (
              <DashboardCard key={r.id} style={{ borderLeft: `4px solid ${isSuspended ? 'var(--red)' : 'var(--green)'}`, opacity: isSuspended ? 0.8 : 1 }}>
                <div onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, cursor: 'pointer' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: isSuspended ? 'linear-gradient(135deg, var(--text-3), #888)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: '#fff', flexShrink: 0,
                  }}>
                    {r.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{r.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.email}</div>
                  </div>
                  <StatusChip status={isSuspended ? 'suspended' : 'active'} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: 'var(--accent-dim, var(--bg-3))', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-3)' }}>Tenant: </span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.tenant_name || '—'}</span>
                    {r.tenant_status && <span style={{ marginLeft: 8 }}><StatusChip status={r.tenant_status} /></span>}
                  </div>
                  <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span><span style={{ color: 'var(--text-3)' }}>Plan: </span><span style={{ fontWeight: 700 }}>{r.plan_name || 'No plan'}</span></span>
                    <span style={{ color: 'var(--text-3)' }}>{r.tenant_currency}</span>
                  </div>
                  {r.invoices_limit != null && (
                    <div style={{
                      background: 'var(--bg-3)', border: `1px solid ${r.warning_level === 'none' ? 'var(--border)' : 'var(--amber)'}`,
                      borderRadius: 8, padding: '7px 10px', fontSize: 12, display: 'flex', justifyContent: 'space-between',
                    }}>
                      <span><span style={{ color: 'var(--text-3)' }}>Usage: </span>
                        <span style={{ fontWeight: 700, color: r.warning_level === 'none' ? 'var(--text)' : (r.warning_level === 'warning' ? 'var(--amber)' : 'var(--red)') }}>
                          {r.invoices_used}/{r.invoices_limit} invoices
                        </span>
                      </span>
                      <span style={{ color: 'var(--text-3)' }}>renews in {r.days_until_reset}d</span>
                    </div>
                  )}
                </div>

                {expandedId === r.id && (
                  <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <DetailRow label="Email" value={r.email} />
                    <DetailRow label="Tenant status" value={r.tenant_status || '—'} />
                    <DetailRow label="Currency" value={r.tenant_currency || '—'} />
                    {r.invoices_limit != null && (
                      <DetailRow label="Monthly usage" value={`${r.invoices_used}/${r.invoices_limit} invoices (${r.usage_percent.toFixed(0)}%)`} />
                    )}
                    <DetailRow label="Onboarded" value={new Date(r.created_at).toLocaleDateString()} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: r.tenant_id ? 8 : 0 }}>
                  <button className="btn ghost" style={{ flex: 1, padding: 6 }} onClick={() => openEdit(r)}>Edit</button>
                  <button className="btn secondary" style={{ flex: 1, padding: 6 }} onClick={() => setShowSub(r)}>Plan</button>
                  <button className={isSuspended ? 'btn' : 'btn warn'} style={{ flex: 1, padding: 6 }} onClick={() => toggleSuspend(r)} title="Suspends only this person's login — the tenant's workspace stays as-is.">
                    {isSuspended ? 'Activate login' : 'Suspend login'}
                  </button>
                </div>

                {/* Tenant workspace activation — separate from the login toggle
                    above. A freshly signed-up tenant sits in "Pending
                    Onboarding" until activated here. */}
                {r.tenant_id && r.tenant_status === 'pending_onboarding' && (
                  <button className="btn" style={{ width: '100%', padding: 8 }} onClick={() => tenantAction(r, 'reactivate')}>
                    Activate tenant
                  </button>
                )}
                {r.tenant_id && r.tenant_status === 'active' && (
                  <button className="btn warn" style={{ width: '100%', padding: 8 }} onClick={() => tenantAction(r, 'suspend')}>
                    Suspend tenant
                  </button>
                )}
                {r.tenant_id && r.tenant_status === 'suspended' && (
                  <button className="btn" style={{ width: '100%', padding: 8 }} onClick={() => tenantAction(r, 'reactivate')}>
                    Reactivate tenant
                  </button>
                )}
              </DashboardCard>
            )
          })}
        </div>
      )}

      <Modal title={`Edit — ${editing?.full_name}`} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>Full name<input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></label>
            <label>Email<input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></label>
            <label>New password (leave blank to keep)<input type="password" value={editForm.new_password} onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn" style={{ flex: 1 }} onClick={saveEdit}>Save changes</button>
              <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal title={`Subscription — ${showSub?.full_name}`} open={!!showSub} onClose={() => setShowSub(null)} maxWidth={480}>
        {showSub && (
          <div>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
              Current: <b style={{ color: 'var(--text)' }}>{showSub.plan_name || 'No plan'}</b>
            </div>
            {plans.filter((p) => p.is_active).map((p) => {
              const isCurrent = p.name === showSub.plan_name
              return (
                <div key={p.id} style={{ background: isCurrent ? `${p.color}10` : 'var(--bg-3)', border: `2px solid ${isCurrent ? p.color : 'var(--border)'}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: p.color }}>{p.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>{p.currency} {p.price.toFixed(0)}<span style={{ fontSize: 11, color: 'var(--text-3)' }}>/{p.billing_cycle}</span></div>
                  </div>
                  {isCurrent ? (
                    <div style={{ fontSize: 12, fontWeight: 700, color: p.color, textAlign: 'center', padding: 6, background: `${p.color}15`, borderRadius: 7 }}>Current plan</div>
                  ) : (
                    <button className="btn secondary" style={{ width: '100%' }} onClick={() => assignPlan(p.id)}>Assign {p.name}</button>
                  )}
                </div>
              )
            })}
            {showSub.plan_name && <button className="btn ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => assignPlan(null)}>Clear plan</button>}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ============================================================================
// Subscription Plans — colour-accented card grid with feature checklist
// ============================================================================

const emptyPlanForm = {
  name: '', description: '', currency: 'INR', price: 0, billing_cycle: 'monthly',
  max_users: 5, max_invoices_per_month: 100, is_active: true, color: PLAN_COLORS[0],
  has_priority_support: false, has_api_access: false, has_advanced_reports: false, has_multi_currency: false,
}

export function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [form, setForm] = useState(emptyPlanForm)
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

  function openAdd() { setForm(emptyPlanForm); setError(''); setShowAdd(true) }
  function openEdit(p: PlanRow) {
    setEditing(p)
    setForm({
      name: p.name, description: p.description || '', currency: p.currency, price: p.price,
      billing_cycle: p.billing_cycle, max_users: p.max_users, max_invoices_per_month: p.max_invoices_per_month,
      is_active: p.is_active, color: p.color, has_priority_support: p.has_priority_support,
      has_api_access: p.has_api_access, has_advanced_reports: p.has_advanced_reports, has_multi_currency: p.has_multi_currency,
    })
  }

  async function submitAdd() {
    if (!form.name) { setError('Plan name is required.'); return }
    try {
      await apiFetch('/admin/subscription-plans', { method: 'POST', body: JSON.stringify(form) })
      setShowAdd(false)
      load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not create the plan.') }
  }
  async function submitEdit() {
    if (!editing) return
    try {
      await apiFetch(`/admin/subscription-plans/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      setEditing(null)
      load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save the plan.') }
  }
  async function deactivate(id: string) {
    await apiFetch(`/admin/subscription-plans/${id}`, { method: 'DELETE' })
    load()
  }

  const renderForm = () => (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <label>Plan name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Pro" /></label>
        <label>Currency<input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={10} /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <label>Price<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></label>
        <label>Billing cycle
          <select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>Max users<input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} /></label>
      </div>
      <label>Max invoices / month<input type="number" value={form.max_invoices_per_month} onChange={(e) => setForm({ ...form, max_invoices_per_month: Number(e.target.value) })} /></label>
      <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></label>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Included features</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.has_priority_support} onChange={(e) => setForm({ ...form, has_priority_support: e.target.checked })} /> Priority support
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.has_api_access} onChange={(e) => setForm({ ...form, has_api_access: e.target.checked })} /> API access
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.has_advanced_reports} onChange={(e) => setForm({ ...form, has_advanced_reports: e.target.checked })} /> Advanced reports
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.has_multi_currency} onChange={(e) => setForm({ ...form, has_multi_currency: e.target.checked })} /> Multi-currency invoicing
          </label>
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase' }}>Theme colour</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {PLAN_COLORS.map((c) => (
            <div key={c} onClick={() => setForm({ ...form, color: c })}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid var(--text)' : '2px solid transparent' }} />
          ))}
        </div>
      </div>
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Subscription Plans</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>Manage the billing tiers offered to tenants.</p>
        </div>
        <button className="btn" onClick={openAdd}>+ Add Plan</button>
      </div>

      {loading ? <p className="muted">Loading…</p> : plans.length === 0 ? (
        <EmptyState title="No subscription plans" sub="Click 'Add Plan' to create one." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {plans.map((p) => (
            <DashboardCard key={p.id} style={{ borderTop: `4px solid ${p.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{p.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: p.color }}>{p.currency} {p.price.toFixed(0)}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>/{p.billing_cycle}</span>
                  </div>
                  {!p.is_active && <span className="status-chip status-chip-red" style={{ marginTop: 6, display: 'inline-block' }}>Inactive</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={() => openEdit(p)}>Edit</button>
                  {p.is_active && <button className="btn warn" style={{ padding: '6px 10px' }} onClick={() => deactivate(p.id)}>Deactivate</button>}
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Included</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                  <div><span style={{ color: p.color, fontWeight: 800 }}>✓</span> {p.max_users} users · {p.max_invoices_per_month} invoices/mo</div>
                  <div><span style={{ color: p.color, fontWeight: 800 }}>✓</span> {p.tenant_count} tenant{p.tenant_count === 1 ? '' : 's'} on this plan</div>
                  {p.has_priority_support && <div><span style={{ color: p.color, fontWeight: 800 }}>✓</span> Priority support</div>}
                  {p.has_api_access && <div><span style={{ color: p.color, fontWeight: 800 }}>✓</span> API access</div>}
                  {p.has_advanced_reports && <div><span style={{ color: p.color, fontWeight: 800 }}>✓</span> Advanced reports</div>}
                  {p.has_multi_currency && <div><span style={{ color: p.color, fontWeight: 800 }}>✓</span> Multi-currency invoicing</div>}
                </div>
              </div>
            </DashboardCard>
          ))}
        </div>
      )}

      <Modal title="Add Subscription Plan" open={showAdd} onClose={() => setShowAdd(false)} maxWidth={520}>
        {renderForm()}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn" style={{ flex: 1 }} onClick={submitAdd}>Create plan</button>
          <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      </Modal>
      <Modal title="Edit Subscription Plan" open={!!editing} onClose={() => setEditing(null)} maxWidth={520}>
        {renderForm()}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn" style={{ flex: 1 }} onClick={submitEdit}>Save changes</button>
          <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// Currency Config — exchange rates vs INR + per-plan price overrides
// ============================================================================

interface CurrencyRate { currency: string; rate_vs_base: number }
interface PlanOverride { plan_id: string; currency: string; price: number }

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD', 'MYR', 'AUD']

export function CurrencyConfigPage() {
  const [rates, setRates] = useState<Record<string, number>>({})
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({})
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addCurrency, setAddCurrency] = useState('')

  async function load() {
    const [cfg, planList] = await Promise.all([
      apiFetch<{ base_currency: string; rates: CurrencyRate[]; overrides: PlanOverride[] }>('/admin/currency-config'),
      apiFetch<PlanRow[]>('/admin/subscription-plans'),
    ])
    const rateMap: Record<string, number> = {}
    cfg.rates.forEach((r) => { rateMap[r.currency] = r.rate_vs_base })
    const ovrMap: Record<string, Record<string, number>> = {}
    cfg.overrides.forEach((o) => { ovrMap[o.currency] = { ...(ovrMap[o.currency] || {}), [o.plan_id]: o.price } })
    setRates(rateMap)
    setOverrides(ovrMap)
    setPlans(planList)
  }
  useEffect(() => { load() }, [])

  const currencies = useMemo(() => {
    const set = new Set([...Object.keys(rates), ...COMMON_CURRENCIES])
    return Array.from(set).filter((c) => c.toLowerCase().includes(search.toLowerCase())).sort()
  }, [rates, search])

  function setRate(curr: string, val: number) {
    setRates((r) => ({ ...r, [curr]: val }))
  }
  function setOverride(curr: string, planId: string, val: number) {
    setOverrides((o) => ({ ...o, [curr]: { ...(o[curr] || {}), [planId]: val } }))
  }
  function addNewCurrency() {
    const c = addCurrency.trim().toUpperCase()
    if (!c) return
    setRates((r) => ({ ...r, [c]: r[c] ?? 1 }))
    setAddCurrency('')
    setExpanded(c)
  }

  async function save() {
    setSaving(true)
    try {
      const ratesPayload: CurrencyRate[] = Object.entries(rates).map(([currency, rate_vs_base]) => ({ currency, rate_vs_base }))
      const overridesPayload: PlanOverride[] = []
      Object.entries(overrides).forEach(([currency, byPlan]) => {
        Object.entries(byPlan).forEach(([plan_id, price]) => {
          if (price > 0) overridesPayload.push({ currency, plan_id, price })
        })
      })
      await apiFetch('/admin/currency-config', { method: 'PUT', body: JSON.stringify({ rates: ratesPayload, overrides: overridesPayload }) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardCard
      title="Currency Configuration"
      subtitle="Exchange rates against INR (the platform base currency) and manual plan price overrides per currency."
      action={<button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Configuration'}</button>}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input placeholder="Search currency (e.g. USD)…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="Add currency code…" value={addCurrency} onChange={(e) => setAddCurrency(e.target.value)} style={{ width: 160 }} />
        <button className="btn secondary" onClick={addNewCurrency}>Add</button>
      </div>

      <table>
        <thead><tr><th>Currency</th><th>Exchange rate (1 INR =)</th><th></th></tr></thead>
        <tbody>
          {currencies.length === 0 && <tr><td colSpan={3} className="muted">No matches found.</td></tr>}
          {currencies.map((c) => (
            <Fragment key={c}>
              <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === c ? null : c)}>
                <td style={{ fontWeight: 700 }}>{c}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="number" step="0.0001" value={rates[c] ?? 1} onChange={(e) => setRate(c, Number(e.target.value))} style={{ width: 110 }} />
                </td>
                <td className="muted">{expanded === c ? 'Hide overrides ▲' : 'Configure overrides ▼'}</td>
              </tr>
              {expanded === c && (
                <tr>
                  <td colSpan={3} style={{ background: 'var(--bg-3)', padding: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 10 }}>Plan price overrides for {c}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {plans.map((p) => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <span style={{ fontWeight: 600 }}>{p.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="muted" style={{ fontSize: 12 }}>Converted: {(p.price * (rates[c] ?? 1)).toFixed(2)} {c}</span>
                            <input
                              type="number" placeholder="Override…"
                              value={overrides[c]?.[p.id] ?? ''}
                              onChange={(e) => setOverride(c, p.id, Number(e.target.value))}
                              style={{ width: 110 }}
                            />
                          </div>
                        </div>
                      ))}
                      {plans.length === 0 && <span className="muted">No plans to override yet.</span>}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </DashboardCard>
  )
}

// ============================================================================
// Subscription History — search + period filter + per-currency revenue
// stat cards + CSV export
// ============================================================================

interface SubEvent {
  id: string; tenant_id: string; tenant_name: string | null; event_type: string
  old_value: string | null; new_value: string | null; note: string | null
  changed_by_label: string | null; created_at: string
}

export function SubscriptionHistoryPage() {
  const [events, setEvents] = useState<SubEvent[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'All' | 'Day' | 'Month' | 'Year'>('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      apiFetch<SubEvent[]>('/admin/subscription-history'),
      apiFetch<PlanRow[]>('/admin/subscription-plans'),
    ]).then(([ev, pl]) => { setEvents(ev); setPlans(pl) }).finally(() => setLoading(false))
  }, [])

  const planPriceByName = useMemo(() => {
    const m: Record<string, { price: number; currency: string }> = {}
    plans.forEach((p) => { m[p.name] = { price: p.price, currency: p.currency } })
    return m
  }, [plans])

  const filtered = useMemo(() => {
    let result = events
    if (period !== 'All') {
      const now = new Date()
      result = result.filter((e) => {
        const d = new Date(e.created_at)
        if (period === 'Day') return d.toDateString() === now.toDateString()
        if (period === 'Month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        return d.getFullYear() === now.getFullYear()
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((e) =>
        (e.tenant_name || '').toLowerCase().includes(q) ||
        e.event_type.toLowerCase().includes(q) ||
        (e.new_value || '').toLowerCase().includes(q))
    }
    return result
  }, [events, period, search])

  const currencyStats = useMemo(() => {
    const stats: Record<string, { revenue: number; count: number }> = {}
    filtered.filter((e) => e.event_type === 'plan_changed' && e.new_value && e.new_value !== 'none').forEach((e) => {
      const plan = planPriceByName[e.new_value!]
      if (!plan) return
      const c = plan.currency
      if (!stats[c]) stats[c] = { revenue: 0, count: 0 }
      stats[c].revenue += plan.price
      stats[c].count += 1
    })
    return Object.entries(stats).sort((a, b) => b[1].revenue - a[1].revenue)
  }, [filtered, planPriceByName])

  function exportCsv() {
    if (filtered.length === 0) return
    const headers = ['Date', 'Tenant', 'Event', 'Old value', 'New value', 'By']
    const rows = filtered.map((e) => [e.created_at, e.tenant_name || '-', e.event_type, e.old_value || '-', e.new_value || '-', e.changed_by_label || 'system'])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `subscription_history_${period.toLowerCase()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Subscription History</h2>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-3)' }}>Every signup, activation, suspension, and plan/currency change across all tenants.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 180 }} />
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="All">All Time</option>
            <option value="Day">Today</option>
            <option value="Month">This Month</option>
            <option value="Year">This Year</option>
          </select>
          <button className="btn" onClick={exportCsv} disabled={filtered.length === 0}>Export Report (CSV)</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
        {currencyStats.length === 0 ? (
          <KpiCard icon={<Icon path={ICONS.revenue} />} label="Total Revenue" value="—" color="var(--text-3)" />
        ) : currencyStats.map(([currency, stat]) => (
          <KpiCard key={currency} icon={<Icon path={ICONS.revenue} />} label={`Revenue (${currency})`} value={`${currency} ${stat.revenue.toFixed(2)}`} sub={`${stat.count} plan changes`} color="var(--green)" />
        ))}
      </div>

      <DashboardCard title="Transaction Ledger" action={<span className="muted">{filtered.length} records found</span>}>
        {loading ? <p className="muted">Loading…</p> : filtered.length === 0 ? (
          <EmptyState title="No transactions found" sub="Try a different period or search term." />
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Tenant</th><th>Event</th><th>Change</th><th>By</th></tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleDateString()}<br /><span className="muted" style={{ fontSize: 11 }}>{new Date(e.created_at).toLocaleTimeString()}</span></td>
                  <td style={{ fontWeight: 600 }}>{e.tenant_name || '—'}</td>
                  <td>{e.event_type.replaceAll('_', ' ')}</td>
                  <td>{e.old_value || '—'} → {e.new_value || '—'}{e.note ? ` (${e.note})` : ''}</td>
                  <td>{e.changed_by_label || 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardCard>
    </div>
  )
}

// ============================================================================
// Payment Settings — Razorpay gateway credentials + bank/UPI instructions
// ============================================================================

interface PaymentSettings {
  bank_name: string | null; account_name: string | null; account_number: string | null
  ifsc_code: string | null; upi_id: string | null; supported_gateways: string | null; notes: string | null
  razorpay_key_id: string | null; razorpay_key_secret: string | null; razorpay_webhook_secret: string | null
}
const emptyPayment: PaymentSettings = {
  bank_name: '', account_name: '', account_number: '', ifsc_code: '', upi_id: '', supported_gateways: '', notes: '',
  razorpay_key_id: '', razorpay_key_secret: '', razorpay_webhook_secret: '',
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
    const updated = await apiFetch<PaymentSettings>('/admin/payment-settings', { method: 'PUT', body: JSON.stringify(form) })
    setForm({ ...emptyPayment, ...updated })
    setSaved(true)
  }

  if (loading) return <DashboardCard title="Payment Settings"><p className="muted">Loading…</p></DashboardCard>

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DashboardCard title="Razorpay Configuration" subtitle="These keys are used to collect subscription payments from tenants. Secrets are never shown again after saving.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label>Razorpay Key ID<input value={form.razorpay_key_id || ''} onChange={(e) => setForm({ ...form, razorpay_key_id: e.target.value })} placeholder="rzp_live_xxx…" /></label>
          <label>Razorpay Key Secret<input type="password" value={form.razorpay_key_secret || ''} onChange={(e) => setForm({ ...form, razorpay_key_secret: e.target.value })} placeholder="Enter secret key" /></label>
          <label>Webhook Secret<input type="password" value={form.razorpay_webhook_secret || ''} onChange={(e) => setForm({ ...form, razorpay_webhook_secret: e.target.value })} placeholder="Required for payment webhooks" /></label>
        </div>
      </DashboardCard>

      <DashboardCard title="Bank / UPI Details" subtitle="Published to every Super Admin as manual-payment instructions.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label>Bank name<input value={form.bank_name || ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></label>
          <label>Account name<input value={form.account_name || ''} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></label>
          <label>Account number<input value={form.account_number || ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></label>
          <label>IFSC code<input value={form.ifsc_code || ''} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} /></label>
          <label>UPI ID<input value={form.upi_id || ''} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} /></label>
          <label>Supported gateways<input value={form.supported_gateways || ''} onChange={(e) => setForm({ ...form, supported_gateways: e.target.value })} placeholder="Razorpay, Stripe, UPI" /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}>Notes<textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: '100%' }} /></label>
      </DashboardCard>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn" onClick={save}>Save Payment Settings</button>
        {saved && <span className="status-chip status-chip-green">Saved</span>}
      </div>
    </div>
  )
}

// ============================================================================
// Credentials — Supreme Admin's own password change + a flat management
// table of every Super Admin's credentials (Smart Garage 360's actual
// "Credentials" page). Passwords are never displayed — only reset.
// ============================================================================

export function CredentialsPage() {
  const [rows, setRows] = useState<SuperAdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState<SuperAdminRow | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [ownNewPassword, setOwnNewPassword] = useState('')
  const [ownConfirm, setOwnConfirm] = useState('')
  const [ownMessage, setOwnMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function load() {
    setLoading(true)
    try {
      setRows(await apiFetch<SuperAdminRow[]>('/admin/super-admins'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function toggleSuspend(r: SuperAdminRow) {
    await apiFetch(`/admin/users/${r.id}/${r.is_suspended ? 'reactivate' : 'suspend'}`, { method: 'POST' })
    load()
  }
  async function submitReset() {
    if (!resetting) return
    await apiFetch(`/admin/users/${resetting.id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) })
    setResetting(null)
    setNewPassword('')
  }

  async function submitOwnChange() {
    setOwnMessage(null)
    if (ownNewPassword !== ownConfirm) {
      setOwnMessage({ text: 'New password and confirmation do not match.', ok: false })
      return
    }
    try {
      await apiFetch('/admin/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: ownNewPassword }) })
      setOwnMessage({ text: 'Password updated.', ok: true })
      setCurrentPassword(''); setOwnNewPassword(''); setOwnConfirm('')
    } catch (e) {
      setOwnMessage({ text: e instanceof ApiError ? e.message : 'Could not update password.', ok: false })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <DashboardCard title="Your Credentials" subtitle="Change the password for this Supreme Admin account.">
        <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
          <label>Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label>New password<input type="password" value={ownNewPassword} onChange={(e) => setOwnNewPassword(e.target.value)} /></label>
          <label>Confirm new password<input type="password" value={ownConfirm} onChange={(e) => setOwnConfirm(e.target.value)} /></label>
          {ownMessage && <p style={{ color: ownMessage.ok ? 'var(--green)' : 'var(--red)' }}>{ownMessage.text}</p>}
          <button className="btn" onClick={submitOwnChange} disabled={!currentPassword || !ownNewPassword}>Update password</button>
        </div>
      </DashboardCard>

      <DashboardCard title="Super Admin Credentials" subtitle="Changes are saved persistently. Super Admins must re-login to use new credentials.">
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? (
          <EmptyState title="No Super Admins yet" />
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Tenant</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.full_name}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{r.email}</td>
                  <td>{r.tenant_name || '—'}</td>
                  <td>{r.is_suspended ? <StatusChip status="suspended" /> : <StatusChip status="active" />}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn ghost" onClick={() => { setResetting(r); setNewPassword('') }}>Reset password</button>
                    <button className={r.is_suspended ? 'btn secondary' : 'btn warn'} onClick={() => toggleSuspend(r)}>{r.is_suspended ? 'Activate' : 'Suspend'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardCard>

      <Modal title={`Reset password — ${resetting?.full_name}`} open={!!resetting} onClose={() => setResetting(null)} maxWidth={400}>
        {resetting && (
          <div style={{ display: 'grid', gap: 12 }}>
            <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" style={{ flex: 1 }} onClick={submitReset} disabled={newPassword.length < 8}>Set password</button>
              <button className="btn ghost" onClick={() => setResetting(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ============================================================================
// Reports — plan/usage tracking by tenant. Deliberately does not show each
// tenant's own invoice/quotation/receipt counts or revenue — that's the
// tenant's own business data, not something Aurae needs to see. What Aurae
// does need: which plan each Super Admin is on and how close they are to
// its monthly invoice limit, so support/upgrade conversations happen before
// a tenant gets blocked.
// ============================================================================

interface TenantUsageRow {
  tenant_id: string; name: string; slug: string; contact_email: string
  subscription_status: string; created_at: string
  plan_name: string | null
  invoices_used: number; invoices_limit: number | null
  usage_percent: number; days_until_reset: number
  warning_level: 'none' | 'warning' | 'critical' | 'limit_reached'
}

const WARNING_COLORS: Record<string, string> = {
  none: 'var(--text-3)', warning: 'var(--amber)', critical: 'var(--red)', limit_reached: 'var(--red)',
}

export function ReportsPage() {
  const [rows, setRows] = useState<TenantUsageRow[]>([])
  useEffect(() => { apiFetch<TenantUsageRow[]>('/analytics/platform/tenants').then(setRows).catch(() => {}) }, [])

  const atRisk = rows.filter((r) => r.warning_level === 'critical' || r.warning_level === 'limit_reached').length
  const noPlan = rows.filter((r) => !r.plan_name).length

  return (
    <DashboardCard
      title="Reports"
      subtitle="Which plan each Super Admin is on, and how close they are to its monthly invoice limit."
      action={<button className="btn secondary" onClick={() => window.print()}>⬇ Export / Print</button>}
    >
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div><div className="muted">Tenants</div><div style={{ fontSize: 20, fontWeight: 800 }}>{rows.length}</div></div>
        <div><div className="muted">Near or at their limit</div><div style={{ fontSize: 20, fontWeight: 800, color: atRisk > 0 ? 'var(--red)' : 'var(--text)' }}>{atRisk}</div></div>
        <div><div className="muted">Without a plan</div><div style={{ fontSize: 20, fontWeight: 800, color: noPlan > 0 ? 'var(--amber)' : 'var(--text)' }}>{noPlan}</div></div>
      </div>
      {rows.length === 0 ? <EmptyState title="No data yet" /> : (
        <table>
          <thead><tr><th>Tenant</th><th>Status</th><th>Plan</th><th>Invoices this month</th><th>Renews in</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenant_id}>
                <td style={{ fontWeight: 700 }}>{r.name}</td>
                <td><StatusChip status={r.subscription_status} /></td>
                <td>{r.plan_name || <span className="muted">No plan</span>}</td>
                <td>
                  {r.invoices_limit ? (
                    <span style={{ color: WARNING_COLORS[r.warning_level], fontWeight: r.warning_level === 'none' ? 400 : 700 }}>
                      {r.invoices_used}/{r.invoices_limit} ({r.usage_percent.toFixed(0)}%)
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="muted">{r.invoices_limit ? `${r.days_until_reset} day${r.days_until_reset === 1 ? '' : 's'}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  )
}
