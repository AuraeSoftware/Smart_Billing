import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'

interface PublicPlan {
  id: string
  name: string
  description: string | null
  currency: string
  price: number
  billing_cycle: string
  max_users: number
  max_invoices_per_month: number
  color: string
  has_priority_support: boolean
  has_api_access: boolean
  has_advanced_reports: boolean
  has_multi_currency: boolean
  is_trial: boolean
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
    <div className="auth-shell">
      <div className="auth-card auth-wide card">
        <h1>Start your Smart Billing subscription</h1>
        <p className="muted">Step 1 — business details. Paid plans continue to payment next; the trial plan skips straight to branding. Branding is required before your workspace goes live.</p>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              {plans.map((p) => {
                const selected = form.subscription_plan_id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => update('subscription_plan_id', p.id)}
                    style={{
                      cursor: 'pointer', borderRadius: 12, padding: 14,
                      border: `2px solid ${selected ? p.color : 'var(--border-2)'}`,
                      background: selected ? `${p.color}10` : 'var(--bg-2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: p.color }}>{p.name}</div>
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
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                      {p.max_invoices_per_month} invoices/mo · {p.max_users} users
                    </div>
                    {p.description && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{p.description}</div>}
                  </div>
                )
              })}
            </div>
          )}

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
          <div className="field">
            <label>Password</label>
            <input type="password" required minLength={8} value={form.super_admin_password} onChange={(e) => update('super_admin_password', e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading || plans.length === 0}>
            {loading ? 'Creating…' : 'Continue to branding'}
          </button>
        </form>
      </div>
    </div>
  )
}
