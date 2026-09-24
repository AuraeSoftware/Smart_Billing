import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'

/** Step 2 of subscription onboarding (SOW 3.4): logo, header, footer are
 * mandatory here — the backend refuses to activate the tenant without all
 * three, and a live preview renders them before the tenant confirms. */
export default function SubscribeBranding() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [logo, setLogo] = useState<File | null>(null)
  const [header, setHeader] = useState<File | null>(null)
  const [footer, setFooter] = useState<File | null>(null)
  const [footerText, setFooterText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const preview = (file: File | null) => (file ? URL.createObjectURL(file) : null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!logo || !header || !footer) {
      setError('Logo, header, and footer are all required to activate your workspace.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('logo', logo)
      fd.append('header', header)
      fd.append('footer', footer)
      fd.append('footer_text', footerText)
      await apiFetch(`/subscription/${tenantId}/branding`, { method: 'POST', body: fd })
      navigate('/login')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card auth-wide card">
        <h1>Add your branding</h1>
        <p className="muted">Final step — required before your workspace activates. This appears on every invoice, quotation, and receipt you send.</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Logo</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field">
            <label>Header image (letterhead top)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(e) => setHeader(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field">
            <label>Footer image (bank details / letterhead bottom)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" required onChange={(e) => setFooter(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field">
            <label>Footer text (terms, bank details — optional)</label>
            <textarea rows={3} value={footerText} onChange={(e) => setFooterText(e.target.value)} />
          </div>

          <div className="card" style={{ background: 'var(--bg-3)' }}>
            <p className="muted" style={{ marginTop: 0 }}>Live preview</p>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {preview(logo) && <img src={preview(logo)!} alt="logo preview" style={{ height: 60 }} />}
              {preview(header) && <img src={preview(header)!} alt="header preview" style={{ height: 40 }} />}
              {preview(footer) && <img src={preview(footer)!} alt="footer preview" style={{ height: 30 }} />}
              {!logo && !header && !footer && <span className="muted">Choose files above to preview them here.</span>}
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Activating…' : 'Activate my workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
