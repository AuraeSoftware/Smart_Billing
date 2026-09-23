import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'

/** Step 1 of subscription onboarding (SOW 3.4). Step 2 (branding) follows
 * immediately and is mandatory before the tenant workspace is usable. */
export default function SubscribeSignup() {
  const [form, setForm] = useState({
    tenant_name: '', slug: '', contact_email: '',
    super_admin_full_name: '', super_admin_email: '', super_admin_password: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const tenant = await apiFetch<{ id: string }>('/subscription/signup', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      navigate(`/subscribe/${tenant.id}/branding`)
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
        <p className="muted">Step 1 of 2 — business details. Branding comes next and is required before your workspace goes live.</p>
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
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Continue to branding'}
          </button>
        </form>
      </div>
    </div>
  )
}
