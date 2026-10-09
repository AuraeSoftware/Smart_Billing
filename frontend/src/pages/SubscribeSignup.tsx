import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'
import { Modal, readableAccent } from '../components/DashboardUI'
import AuthSplitShell from '../components/AuthSplitShell'
import PasswordField from '../components/PasswordField'

interface PublicPlan {
  id: string
  name: string
  description: string | null
  currency: string
  price: number
  billing_cycle: string
  max_users: number
  max_invoices_per_month: number | null
  color: string
  has_priority_support: boolean
  has_api_access: boolean
  has_advanced_reports: boolean
  has_multi_currency: boolean
  is_trial: boolean
  trial_days: number
  max_branches: number
  max_products: number | null
  has_employee_management: boolean
  has_expense_tracking: boolean
  has_multi_branch: boolean
  inventory_tier: 'basic' | 'included'
  role_permissions_tier: 'none' | 'basic' | 'included'
}

interface WorldCurrency { code: string; name: string }

/** Step 1 of subscription onboarding (SOW 3.4): business details, your
 * Super Admin account, and the subscription plan you're signing up for.
 * Step 2 (branding) follows and is mandatory before the tenant workspace
 * is usable — a plan is now required too, chosen right here rather than
 * left for the Supreme Admin to assign after the fact.
 *
 * Currency is automatic from the mobile number's country code, but stays
 * fully editable: picking a currency from the dropdown marks it as a
 * manual choice, and further edits to the phone number stop overriding it. */
export default function SubscribeSignup() {
  const [form, setForm] = useState({
    tenant_name: '', slug: '', contact_email: '',
    super_admin_full_name: '', super_admin_email: '', super_admin_password: '',
    super_admin_mobile_number: '', subscription_plan_id: '',
  })
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  // Monthly/Yearly is a single switch above the grid (standard SaaS pricing
  // pattern) — it picks which of each tier's two plan rows is shown and
  // selected, rather than making the visitor compare 8 separate cards.
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [previewTier, setPreviewTier] = useState<string | null>(null)
  const [currencies, setCurrencies] = useState<WorldCurrency[]>([])
  const [currency, setCurrency] = useState('')
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // World currency list for the dropdown — loaded once.
  useEffect(() => {
    apiFetch<WorldCurrency[]>('/subscription/currencies').then(setCurrencies).catch(() => setCurrencies([]))
  }, [])

  // Plan prices, resolved into a currency: an explicit pick from the
  // dropdown (currencyTouched) wins; otherwise the mobile number's country
  // code auto-detects it server-side. Re-fetches whenever either changes.
  useEffect(() => {
    setPlansLoading(true)
    const params = new URLSearchParams()
    if (currencyTouched && currency) params.set('currency', currency)
    else if (form.super_admin_mobile_number.trim()) params.set('mobile_number', form.super_admin_mobile_number.trim())
    const qs = params.toString()
    apiFetch<PublicPlan[]>(`/subscription/plans${qs ? `?${qs}` : ''}`)
      .then((list) => {
        setPlans(list)
        if (list.length > 0) {
          setForm((f) => ({ ...f, subscription_plan_id: f.subscription_plan_id || list[0].id }))
          if (!currencyTouched) setCurrency(list[0].currency)
        }
      })
      .finally(() => setPlansLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencyTouched, currency, form.super_admin_mobile_number])

  // The API returns each tier as two separate rows — "Starter (Monthly)"
  // and "Starter (Yearly)" — so pricing always has an exact plan to charge.
  // Here they're paired back up by tier name purely for display: one card
  // per tier, with the Monthly/Yearly switch above picking which row's
  // price (and id) is actually shown and selected.
  interface TierGroup { tierName: string; monthly?: PublicPlan; yearly?: PublicPlan }
  const tierGroups = useMemo<TierGroup[]>(() => {
    const map = new Map<string, TierGroup>()
    for (const p of plans) {
      const tierName = p.name.replace(/\s*\((Monthly|Yearly)\)\s*$/i, '').trim()
      const g = map.get(tierName) ?? { tierName }
      if (p.billing_cycle === 'yearly') g.yearly = p
      else g.monthly = p
      map.set(tierName, g)
    }
    return Array.from(map.values())
  }, [plans])

  function planFor(g: TierGroup, cycle: 'monthly' | 'yearly'): PublicPlan | undefined {
    return g[cycle] ?? g.monthly ?? g.yearly
  }

  // Enterprise is kept out of this self-serve picker — it's the
  // sales-assisted tier (custom onboarding, priority support SLAs), so it's
  // still a real plan the Supreme Admin can assign by hand, just not
  // something a visitor can sign up and pay for themselves here. Starter,
  // Business and Pro are offered self-serve in both India and Malaysia.
  const selfServeTiers = useMemo(
    () => tierGroups.filter((g) => g.tierName.toLowerCase() !== 'enterprise'),
    [tierGroups],
  )

  function selectTier(g: TierGroup) {
    const p = planFor(g, billingCycle)
    if (p) update('subscription_plan_id', p.id)
  }

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.subscription_plan_id) {
      setError('Please choose a subscription plan.')
      return
    }
    if (!form.super_admin_mobile_number.trim()) {
      setError('Please enter your mobile number, with country code (e.g. +91 98765 43210).')
      return
    }
    setLoading(true)
    try {
      const tenant = await apiFetch<{ id: string }>('/subscription/signup', {
        method: 'POST',
        body: JSON.stringify({ ...form, billing_currency: currency || undefined }),
      })
      // A paid plan needs a completed payment before the workspace can be
      // activated (enforced server-side too) — send them to pay first. A
      // trial plan skips straight to branding, as before.
      const chosenPlan = plans.find((p) => p.id === form.subscription_plan_id)
      if (chosenPlan && !chosenPlan.is_trial) {
        navigate(`/subscribe/${tenant.id}/payment`)
      } else {
        navigate(`/subscribe/${tenant.id}/branding`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitShell wide>
      <h1 style={{ textAlign: 'center' }}>Register Super Admin</h1>
      <p className="muted" style={{ textAlign: 'center', marginTop: -6 }}>Step 1 — business details. Paid plans continue to payment next; the trial plan skips straight to branding.</p>
      <form onSubmit={onSubmit}>
          <div className="field">
            <label>Business name</label>
            <input required value={form.tenant_name} onChange={(e) => update('tenant_name', e.target.value)} />
          </div>
          <div className="field">
            <label>Workspace slug (used in your URL)</label>
            <input required pattern="[a-z0-9\-]+" value={form.slug} onChange={(e) => update('slug', e.target.value.toLowerCase())} />
          </div>
          <div className="field">
            <label>Business contact email</label>
            <input type="email" required value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile number (with country code)</label>
            <input
              required placeholder="+91 98765 43210" value={form.super_admin_mobile_number}
              onChange={(e) => update('super_admin_mobile_number', e.target.value)}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '18px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
            <p className="muted" style={{ margin: 0 }}>Choose a plan</p>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, display: 'flex' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Currency</span>
              <select
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); setCurrencyTouched(true) }}
                style={{ width: 'auto', minWidth: 140 }}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </label>
          </div>
          {!currencyTouched && form.super_admin_mobile_number.trim() && (
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Currency auto-detected from your mobile number — pick a different one above any time.</p>
          )}
          {plansLoading ? (
            <p className="muted">Loading plans…</p>
          ) : plans.length === 0 ? (
            <p className="error-text">No subscription plans are available right now — please contact Aurae Software Solutions.</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', background: 'var(--bg-3)', padding: 4, borderRadius: 10 }}>
                  <button type="button" className={billingCycle === 'monthly' ? 'btn' : 'btn ghost'} style={{ padding: '7px 18px' }} onClick={() => setBillingCycle('monthly')}>Monthly</button>
                  <button type="button" className={billingCycle === 'yearly' ? 'btn' : 'btn ghost'} style={{ padding: '7px 18px' }} onClick={() => setBillingCycle('yearly')}>
                    Yearly <span style={{ opacity: 0.8, fontWeight: 500 }}>· save up to 2 months</span>
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                {selfServeTiers.map((g) => {
                  const p = planFor(g, billingCycle)
                  if (!p) return null
                  const selected = form.subscription_plan_id === p.id
                  const accent = readableAccent(p.color)
                  const yearlyOriginal = g.monthly && g.yearly ? g.monthly.price * 12 : null
                  const savingsPct = yearlyOriginal && yearlyOriginal > 0 ? Math.round((1 - g.yearly!.price / yearlyOriginal) * 100) : null
                  return (
                    <div
                      key={g.tierName}
                      onClick={() => selectTier(g)}
                      style={{
                        cursor: 'pointer', borderRadius: 12, padding: 14,
                        border: `2px solid ${selected ? p.color : 'var(--border-2)'}`,
                        background: selected ? `${p.color}10` : 'var(--bg-2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: accent }}>{g.tierName}</div>
                        {p.is_trial && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(37, 99, 235, 0.12)', color: 'var(--blue)' }}>
                            TRIAL · 1 per company
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>
                        {p.is_trial ? 'Free' : `${p.currency} ${p.price.toFixed(0)}`}
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>/{p.billing_cycle}</span>
                      </div>
                      {billingCycle === 'yearly' && savingsPct !== null && savingsPct > 0 && (
                        <div style={{ fontSize: 11, marginTop: 2 }}>
                          <span style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{p.currency} {yearlyOriginal!.toFixed(0)}</span>
                          <span style={{ color: 'var(--green)', fontWeight: 700, marginLeft: 6 }}>Save {savingsPct}%</span>
                        </div>
                      )}
                      {p.is_trial && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginTop: 2 }}>{p.trial_days}-day free trial · no card required</div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                        {p.max_invoices_per_month ?? 'Unlimited'} invoices/mo · {p.max_users} users · {p.max_branches} branch{p.max_branches === 1 ? '' : 'es'}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreviewTier(g.tierName) }}
                        style={{ background: 'none', border: 'none', padding: 0, marginTop: 8, fontSize: 12, fontWeight: 700, color: accent, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        View full features →
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Tier details — both billing cycles side by side with the
              yearly price's full-year-at-the-monthly-rate struck through,
              so the saving is explicit rather than left for the visitor to
              compute themselves. */}
          {(() => {
            const g = selfServeTiers.find((t) => t.tierName === previewTier)
            if (!g) return null
            const m = g.monthly, y = g.yearly
            const accent = readableAccent((m ?? y)!.color)
            const yearlyOriginal = m && y ? m.price * 12 : null
            const savingsPct = yearlyOriginal && yearlyOriginal > 0 ? Math.round((1 - y!.price / yearlyOriginal) * 100) : null
            const any = m ?? y!
            const features: [boolean, string][] = [
              [any.has_priority_support, 'Priority support'],
              [any.has_advanced_reports, 'Advanced reports'],
              [any.has_multi_currency, 'Multi-currency invoicing'],
              [any.has_employee_management, 'Employee management'],
              [any.inventory_tier === 'included', 'Full inventory'],
              [any.role_permissions_tier !== 'none', `Role permissions (${any.role_permissions_tier})`],
            ]
            return (
              <Modal title={g.tierName} open={!!previewTier} onClose={() => setPreviewTier(null)} maxWidth={480}>
                {any.description && <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-2)' }}>{any.description}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: m && y ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 18 }}>
                  {m && (
                    <div style={{ border: '1px solid var(--border-2)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Monthly</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: accent }}>{m.currency} {m.price.toFixed(0)}</div>
                    </div>
                  )}
                  {y && (
                    <div style={{ border: `2px solid ${accent}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Yearly</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: accent }}>{y.currency} {y.price.toFixed(0)}</div>
                      {yearlyOriginal !== null && savingsPct !== null && savingsPct > 0 && (
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          <span style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{y.currency} {yearlyOriginal.toFixed(0)}</span>
                          <span style={{ color: 'var(--green)', fontWeight: 700, marginLeft: 6 }}>Save {savingsPct}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>What's included</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, color: 'var(--text-2)', marginBottom: 18 }}>
                  <div><span style={{ color: accent, fontWeight: 800 }}>✓</span> {any.max_users} users · {any.max_invoices_per_month ?? 'Unlimited'} invoices/mo</div>
                  <div><span style={{ color: accent, fontWeight: 800 }}>✓</span> {any.max_branches} branch{any.max_branches === 1 ? '' : 'es'} · {any.max_products ?? 'Unlimited'} products</div>
                  {features.filter(([on]) => on).map(([, label]) => (
                    <div key={label}><span style={{ color: accent, fontWeight: 800 }}>✓</span> {label}</div>
                  ))}
                  {/* Expense tracking and multi-branch are plan metadata only — no
                      such module exists yet, so they're never shown as an included
                      feature here (that would be a false claim to a paying signup). */}
                </div>
                <button
                  type="button" className="btn" style={{ width: '100%' }}
                  onClick={() => { selectTier(g); setPreviewTier(null) }}
                >
                  Select {g.tierName} — {billingCycle === 'yearly' && y ? `${y.currency} ${y.price.toFixed(0)}/yr` : m ? `${m.currency} ${m.price.toFixed(0)}/mo` : ''}
                </button>
              </Modal>
            )
          })()}

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '18px 0' }} />
          <p className="muted">Your Super Admin account</p>
          <div className="field">
            <label>Full name</label>
            <input required value={form.super_admin_full_name} onChange={(e) => update('super_admin_full_name', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={form.super_admin_email} onChange={(e) => update('super_admin_email', e.target.value)} />
          </div>
          <PasswordField
            label="Password" value={form.super_admin_password} onChange={(v) => update('super_admin_password', v)}
            required minLength={8} autoComplete="new-password"
          />
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading || plans.length === 0} style={{ width: '100%' }}>
            {loading ? 'Creating…' : 'Continue to branding'}
          </button>
      </form>
    </AuthSplitShell>
  )
}
