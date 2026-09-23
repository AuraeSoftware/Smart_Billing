import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch, ApiError } from '../lib/api'

interface Branding { logo_url: string | null; header_url: string | null; footer_url: string | null; footer_text: string | null }
interface TenantUser { id: string; full_name: string; email: string; is_active: boolean; created_at: string }

/**
 * Super Admin settings screen: edit branding after onboarding (proposal —
 * "remains editable afterward from the Super Admin settings panel") and
 * manage tenant staff accounts (proposal — "Super Admin manages that
 * tenant's own users").
 */
export default function Settings() {
  return (
    <div>
      <BrandingSection />
      <TenantUsersSection />
    </div>
  )
}

function BrandingSection() {
  const [branding, setBranding] = useState<Branding | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [header, setHeader] = useState<File | null>(null)
  const [footer, setFooter] = useState<File | null>(null)
  const [footerText, setFooterText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    try {
      const b = await apiFetch<Branding>('/subscription/branding')
      setBranding(b)
      setFooterText(b.footer_text || '')
    } catch {
      setBranding(null)
    }
  }
  useEffect(() => { load() }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setMessage(null)
    try {
      const fd = new FormData()
      if (logo) fd.append('logo', logo)
      if (header) fd.append('header', header)
      if (footer) fd.append('footer', footer)
      fd.append('footer_text', footerText)
      const updated = await apiFetch<Branding>('/subscription/branding', { method: 'PUT', body: fd })
      setBranding(updated)
      setLogo(null); setHeader(null); setFooter(null)
      setMessage('Branding updated. New documents will use these assets immediately.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save branding.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <h2>Branding</h2>
      <p className="muted">Logo, header, and footer used on every invoice, quotation, and receipt you send. Leave a field empty to keep the current asset.</p>
      {branding && (
        <div style={{ marginBottom: 16 }}>
          <span className="muted">
            On file: logo {branding.logo_url ? '✓' : '—'}, header {branding.header_url ? '✓' : '—'}, footer {branding.footer_url ? '✓' : '—'}
            {branding.footer_text ? ', footer text ✓' : ''}. Uploading a new file below replaces only that asset.
          </span>
        </div>
      )}
      <form onSubmit={onSave}>
        <div className="field"><label>Replace logo</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} /></div>
        <div className="field"><label>Replace header</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setHeader(e.target.files?.[0] ?? null)} /></div>
        <div className="field"><label>Replace footer</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFooter(e.target.files?.[0] ?? null)} /></div>
        <div className="field"><label>Footer text</label><textarea rows={3} value={footerText} onChange={(e) => setFooterText(e.target.value)} /></div>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn amber" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </form>
    </div>
  )
}

function TenantUsersSection() {
  const [users, setUsers] = useState<TenantUser[]>([])
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setUsers(await apiFetch<TenantUser[]>('/tenant-users'))
  }
  useEffect(() => { load() }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await apiFetch('/tenant-users', { method: 'POST', body: JSON.stringify({ full_name: fullName, email, password }) })
      setFullName(''); setEmail(''); setPassword(''); setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create user.')
    }
  }

  async function toggle(user: TenantUser) {
    await apiFetch(`/tenant-users/${user.id}/${user.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' })
    load()
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Team</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add staff member'}</button>
      </div>
      <p className="muted">Staff can create documents but can't change branding, billing settings, or the device-lock on your own Super Admin login.</p>
      {showForm && (
        <form onSubmit={onCreate} style={{ marginBottom: 16 }}>
          <div className="field"><label>Full name</label><input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="field"><label>Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label>Temporary password</label><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn amber" type="submit">Add</button>
        </form>
      )}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td><td>{u.email}</td>
              <td>{u.is_active ? <span className="badge online">Active</span> : <span className="badge offline">Inactive</span>}</td>
              <td><button className="btn secondary" onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button></td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={4} className="muted">No staff accounts yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
