import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/api'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import AuthSplitShell from '../components/AuthSplitShell'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { setSession } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await login(email, password)
      setSession({ token: res.access_token, role: res.role as never, tenantId: res.tenant_id, fullName: res.full_name, tenantStatus: res.tenant_status })
      navigate(res.role === 'supreme_admin' ? '/admin' : '/app')
    } catch (err) {
      // Device-binding rejections (SOW 3.3) surface here with a clear message,
      // e.g. "already registered to another device".
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitShell
      headline={<>Bill your customers <span style={{ color: 'var(--accent)' }}>smarter, faster.</span></>}
      tagline="Invoices, quotations, and receipts — branded, tracked, and under control, all in one place."
      bullets={[
        'Branded invoices, quotations & receipts',
        'Multi-currency billing, built in',
        'Usage and plan tracking at a glance',
        'Your own workspace, your own branding',
      ]}
    >
      <h1 style={{ textAlign: 'center' }}>Welcome back</h1>
      <p className="muted" style={{ textAlign: 'center', marginTop: -6 }}>Sign in to your workspace.</p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 16, textAlign: 'center' }}>
        New tenant? <a href="/subscribe">Start a subscription</a>
      </p>
    </AuthSplitShell>
  )
}
