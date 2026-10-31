import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'
import DocumentStyleEditor, { DEFAULT_DOC_STYLE, type DocStyleValues } from '../components/DocumentStyleEditor'

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
  const [style, setStyle] = useState<DocStyleValues>(DEFAULT_DOC_STYLE)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Free trial workspaces are approved by the platform administrator before
  // first login; paid workspaces activate immediately, as before.
  const [awaitingApproval, setAwaitingApproval] = useState(false)

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
      fd.append('doc_paper_size', style.paper)
      fd.append('doc_font', style.font)
      fd.append('doc_font_size', String(style.size))
      fd.append('doc_accent_color', style.accent)
      fd.append('doc_header_style', style.headerStyle)
      fd.append('doc_address', style.address)
      fd.append('doc_phone', style.phone)
      fd.append('doc_registration', style.registration)
      await apiFetch(`/subscription/${tenantId}/branding`, { method: 'POST', body: fd })
      const pay = await apiFetch<{ status: string }>(`/subscription/${tenantId}/payment/status`).catch(() => null)
      if (pay?.status === 'not_required') setAwaitingApproval(true)
      else navigate('/login')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (awaitingApproval) {
    return (
      <div className="auth-shell">
        <div className="auth-card card" style={{ textAlign: 'center' }}>
          <h1>You're all set</h1>
          <p className="muted">
            Your free trial workspace has been created and is waiting for approval from the platform
            administrator. You'll be able to log in as soon as it is approved.
          </p>
          <button className="btn" type="button" onClick={() => navigate('/login')}>Back to login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card auth-wide card" style={{ maxWidth: 1040 }}>
        <button
          type="button"
          onClick={() => navigate('/subscribe')}
          style={{ background: 'none', border: 'none', padding: 0, marginBottom: 14, fontSize: 13, fontWeight: 700, color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ← Back to plan selection
        </button>
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

          <h3 style={{ marginTop: 24 }}>Document style</h3>
          <p className="muted">Choose how your invoices, quotations and receipts look. You can change this later in Settings.</p>
          <DocumentStyleEditor
            value={style}
            onChange={setStyle}
            previewPath="/subscription/document-preview"
            refreshKey={`${logo?.name ?? ''}${logo?.size ?? ''}|${header?.name ?? ''}${header?.size ?? ''}|${footer?.name ?? ''}${footer?.size ?? ''}|${footerText}`}
            extraFields={() => {
              const fd = new FormData()
              if (logo) fd.append('logo', logo)
              if (header) fd.append('header', header)
              if (footer) fd.append('footer', footer)
              fd.append('footer_text', footerText)
              return fd
            }}
          />

          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={loading} style={{ marginTop: 16 }}>
            {loading ? 'Activating…' : 'Activate my workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
