import type { ReactNode } from 'react'

/**
 * Shared "command center" building blocks for the Supreme Admin and Super
 * Admin dashboards — carries over the Smart Garage 360 dashboard language
 * (KPI tiles with an icon chip, bordered cards, status chips, empty states)
 * into Smart Billing, styled entirely through the existing theme tokens in
 * index.css so light/dark both work without any extra work.
 */

export function DashboardCard({
  children,
  title,
  subtitle,
  action,
  accent,
  style,
}: {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
  accent?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className="card"
      style={{
        ...(accent ? { borderTop: `3px solid ${accent}` } : {}),
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: subtitle ? 2 : 14 }}>
          <div>
            {title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      {subtitle && <p className="muted" style={{ margin: '0 0 14px' }}>{subtitle}</p>}
      {children}
    </div>
  )
}

export function KpiCard({
  icon,
  label,
  value,
  sub,
  color = 'var(--accent)',
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string | number
  sub?: string
  color?: string
  onClick?: () => void
}) {
  return (
    <div
      className="kpi-card"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="kpi-card-label">{label}</div>
        <div className="kpi-card-icon" style={{ background: `${color}14`, border: `1px solid ${color}2a`, color }}>
          {icon}
        </div>
      </div>
      <div className="kpi-card-value">{value}</div>
      {sub && <div className="kpi-card-sub">{sub}</div>}
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  // Tenant subscription status
  active: 'green',
  pending_onboarding: 'amber',
  suspended: 'red',
  cancelled: 'red',
  // Invoice / quotation status
  draft: 'neutral',
  sent: 'blue',
  viewed: 'blue',
  paid: 'green',
  partially_paid: 'amber',
  overdue: 'red',
  accepted: 'green',
  declined: 'red',
  expired: 'red',
  converted: 'blue',
}

/** Small rounded status pill — color follows STATUS_TONE, unknown values
 * fall back to a neutral chip rather than guessing a color. */
export function StatusChip({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return <span className={`status-chip status-chip-${tone}`}>{status.replaceAll('_', ' ')}</span>
}

/** Detail popup — same role as Smart Garage's row/stat-card click-through:
 * a read-only breakdown, never a form. Closes on backdrop click or ✕. */
export function Modal({
  title,
  open,
  onClose,
  children,
  maxWidth = 480,
}: {
  title?: ReactNode
  open: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-panel" style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto',
        position: 'relative',
      }}>
        {/* Close button always renders, title or not — every popup gets a
            visible, click-away-independent way out. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: title ? 20 : 8 }}>
          {title ? <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h3> : <span />}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-3)',
              cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0, marginLeft: 'auto',
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** One label/value row inside a Modal breakdown. */
export function DetailRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: strong ? 800 : 700, color: strong ? 'var(--green)' : 'var(--text)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function EmptyState({ icon = '○', title, sub }: { icon?: ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, background: 'var(--bg-3)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, margin: '0 auto 12px', color: 'var(--text-3)',
      }}>
        {icon}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 280, margin: '0 auto' }}>{sub}</div>}
    </div>
  )
}

/** Minimal inline icon set — no external assets, matches the 2px stroke
 * outline style Smart Garage uses for its sidebar/stat icons. */
export function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

export const ICONS = {
  building: 'M3 21h18M6 21V7l6-4 6 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  revenue: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  invoice: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  quotation: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15h6M9 11h2',
  receipt: 'M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 2zM8 7h8M8 11h8M8 15h5',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  // Row-action icons — used by IconButton below on the invoice/quotation/
  // receipt tables, so PDF/mark-sent/mark-cancelled/convert read as glyphs
  // instead of a wall of text buttons.
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z',
  checkCircle: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  xCircle: 'M18 6L6 18M6 6l12 12',
  convert: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  trash: 'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z',
} as const

/** Small round icon-only action button for table rows — PDF, mark-sent,
 * convert, and so on. `title` doubles as the accessible name (rendered as
 * a native tooltip) and as a text fallback via aria-label, since the
 * button carries no visible label. `tone` tints it without a full custom
 * className per action. */
export function IconButton({
  icon, title, onClick, tone = 'neutral', type = 'button', disabled,
}: {
  icon: keyof typeof ICONS
  title: string
  onClick?: () => void
  tone?: 'neutral' | 'accent' | 'green' | 'red' | 'amber'
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const toneVars: Record<string, string> = {
    neutral: 'var(--text-2)',
    accent: 'var(--accent)',
    green: 'var(--green)',
    red: 'var(--red)',
    amber: 'var(--amber)',
  }
  return (
    <button
      type={type}
      className="icon-btn"
      style={{ color: toneVars[tone] }}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon path={ICONS[icon]} size={16} />
    </button>
  )
}

export const CHART_COLORS = {
  primary: 'var(--accent)',
  secondary: 'var(--accent-2)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  red: 'var(--red)',
}
