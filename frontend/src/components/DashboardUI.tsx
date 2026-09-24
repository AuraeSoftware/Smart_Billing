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
} as const

export const CHART_COLORS = {
  primary: 'var(--accent)',
  secondary: 'var(--accent-2)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  red: 'var(--red)',
}
