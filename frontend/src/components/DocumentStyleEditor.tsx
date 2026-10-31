import { useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api'

export interface DocStyleValues {
  paper: string
  font: string
  size: number
  accent: string
  headerStyle: 'shape' | 'image'
  address: string
  phone: string
  registration: string
}

export const DEFAULT_DOC_STYLE: DocStyleValues = {
  paper: 'A4', font: 'poppins', size: 9, accent: '#FDB515', headerStyle: 'shape', address: '', phone: '', registration: '',
}

const PAPERS = [
  { v: 'A4', l: 'A4 (210 × 297 mm)' },
  { v: 'LETTER', l: 'Letter (8.5 × 11 in)' },
  { v: 'LEGAL', l: 'Legal (8.5 × 14 in)' },
  { v: 'A5', l: 'A5 (148 × 210 mm)' },
]
const FONTS = [
  { v: 'poppins', l: 'Poppins' },
  { v: 'helvetica', l: 'Helvetica' },
  { v: 'times', l: 'Times' },
  { v: 'courier', l: 'Courier' },
]
const SIZES = [8, 9, 10, 11, 12, 13, 14]
const COLORS = [
  { v: '#FDB515', l: 'Amber' },
  { v: '#1E88E5', l: 'Blue' },
  { v: '#1F3A5F', l: 'Navy' },
  { v: '#2E9E6B', l: 'Green' },
  { v: '#14A3A3', l: 'Teal' },
  { v: '#7B4DFF', l: 'Purple' },
  { v: '#E5484D', l: 'Red' },
  { v: '#2B2B2B', l: 'Charcoal' },
]
const HEX = /^#[0-9a-fA-F]{6}$/
const DOCS = [
  { v: 'invoice', l: 'Invoice' },
  { v: 'quotation', l: 'Quotation' },
  { v: 'receipt', l: 'Receipt' },
]

interface Props {
  value: DocStyleValues
  onChange: (v: DocStyleValues) => void
  /** Endpoint that returns a sample PDF for the current settings. */
  previewPath: string
  /** Extra form fields / files to send with the preview request. */
  extraFields?: () => FormData
  /** Re-render the preview when this changes (e.g. chosen files). */
  refreshKey?: string
  disabled?: boolean
}

/** Paper size, font, size, colour (preset + hex) and a live preview of the
 * invoice, quotation and receipt. Used in Settings and in signup. */
export default function DocumentStyleEditor({ value, onChange, previewPath, extraFields, refreshKey = '', disabled }: Props) {
  const [doc, setDoc] = useState('invoice')
  const [hexText, setHexText] = useState(value.accent)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const reqId = useRef(0)
  const lastUrl = useRef<string | null>(null)

  useEffect(() => { setHexText(value.accent) }, [value.accent])

  const set = (patch: Partial<DocStyleValues>) => onChange({ ...value, ...patch })

  function onHex(text: string) {
    const t = text.startsWith('#') ? text : '#' + text
    setHexText(t)
    if (HEX.test(t)) set({ accent: t.toUpperCase() })
  }

  const preset = COLORS.find((c) => c.v.toLowerCase() === value.accent.toLowerCase())

  useEffect(() => {
    const id = ++reqId.current
    const timer = setTimeout(async () => {
      setBusy(true); setErr(null)
      try {
        const fd = extraFields ? extraFields() : new FormData()
        fd.set('doc_type', doc)
        fd.set('doc_paper_size', value.paper)
        fd.set('doc_font', value.font)
        fd.set('doc_font_size', String(value.size))
        fd.set('doc_accent_color', value.accent)
        fd.set('doc_header_style', value.headerStyle)
        fd.set('doc_address', value.address)
        fd.set('doc_phone', value.phone)
        fd.set('doc_registration', value.registration)
        const blob = await apiFetch<Blob>(previewPath, { method: 'POST', body: fd })
        if (id !== reqId.current) return
        const next = URL.createObjectURL(blob)
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
        lastUrl.current = next
        setUrl(next)
      } catch (e) {
        if (id === reqId.current) setErr(e instanceof ApiError ? e.message : 'Could not load the preview.')
      } finally {
        if (id === reqId.current) setBusy(false)
      }
    }, 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, value, previewPath, refreshKey])

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  return (
    <div className="doc-style">
      <div className="doc-style-grid">
        <div className="doc-style-controls">
          <div className="field">
            <label>Paper size</label>
            <select value={value.paper} disabled={disabled} onChange={(e) => set({ paper: e.target.value })}>
              {PAPERS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
          <div className="doc-style-row">
            <div className="field">
              <label>Font</label>
              <select value={value.font} disabled={disabled} onChange={(e) => set({ font: e.target.value })}>
                {FONTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Font size</label>
              <select value={value.size} disabled={disabled} onChange={(e) => set({ size: Number(e.target.value) })}>
                {SIZES.map((n) => <option key={n} value={n}>{n} pt</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Colour</label>
            <select
              value={preset ? preset.v : 'custom'}
              disabled={disabled}
              onChange={(e) => { if (e.target.value !== 'custom') set({ accent: e.target.value }) }}
            >
              {COLORS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="field">
            <label>Hex code</label>
            <div className="doc-style-hex">
              <input
                type="color" aria-label="Pick a colour" disabled={disabled}
                value={HEX.test(value.accent) ? value.accent.toLowerCase() : '#fdb515'}
                onChange={(e) => set({ accent: e.target.value.toUpperCase() })}
              />
              <input
                value={hexText} disabled={disabled} maxLength={7} spellCheck={false} placeholder="#FDB515"
                aria-invalid={!HEX.test(hexText)} onChange={(e) => onHex(e.target.value)}
              />
            </div>
            {!HEX.test(hexText) && <span className="error-text" style={{ fontSize: 12 }}>Use six digits, like #1E88E5.</span>}
          </div>
          <div className="field">
            <label>Top of the page</label>
            <select value={value.headerStyle} disabled={disabled} onChange={(e) => set({ headerStyle: e.target.value as 'shape' | 'image' })}>
              <option value="shape">Colour strip with title</option>
              <option value="image">My header image</option>
            </select>
          </div>
          <div className="field">
            <label>Business address</label>
            <textarea rows={3} value={value.address} disabled={disabled} placeholder={'Street, area\nCity, State, PIN'} onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="doc-style-row">
            <div className="field">
              <label>Phone</label>
              <input value={value.phone} disabled={disabled} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="field">
              <label>GST / Reg. no.</label>
              <input value={value.registration} disabled={disabled} onChange={(e) => set({ registration: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="doc-style-preview">
          <div className="doc-style-tabs" role="tablist">
            {DOCS.map((d) => (
              <button key={d.v} type="button" role="tab" aria-selected={doc === d.v} className={doc === d.v ? 'active' : ''} onClick={() => setDoc(d.v)}>
                {d.l}
              </button>
            ))}
          </div>
          <div className="doc-style-frame">
            {url && <iframe title={`${doc} preview`} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />}
            {!url && !err && <p className="muted" style={{ padding: 16 }}>Loading preview…</p>}
            {busy && url && <span className="doc-style-busy">Updating…</span>}
          </div>
          {err && <p className="error-text">{err}</p>}
          {url && <a className="muted" style={{ fontSize: 13 }} href={url} target="_blank" rel="noreferrer">Open the preview in a new tab</a>}
        </div>
      </div>
    </div>
  )
}
