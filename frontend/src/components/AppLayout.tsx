import type { ReactNode } from 'react'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../lib/auth'

export interface NavItem {
  key: string
  label: string
}

interface AppLayoutProps {
  brandSuffix?: string
  navItems: NavItem[]
  activeKey: string
  onNavigate: (key: string) => void
  topbarExtra?: ReactNode
  children: ReactNode
}

/**
 * Shared sidebar shell for the Super Admin and Supreme Admin dashboards —
 * replaces the old topbar + `.tabs` row with the sidebar nav defined in
 * index.css (Smart Garage 360 theme).
 */
export default function AppLayout({ brandSuffix, navItems, activeKey, onNavigate, topbarExtra, children }: AppLayoutProps) {
  const { session, setSession } = useAuth()
  const activeLabel = navItems.find((n) => n.key === activeKey)?.label ?? ''

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          SMART<span className="dot">•</span>BILLING
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={item.key === activeKey ? 'active' : ''}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {brandSuffix && <div>{brandSuffix}</div>}
          <div>{session?.fullName}</div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="title">{activeLabel}</div>
          <div className="topbar-actions">
            {topbarExtra}
            <ThemeToggle />
            <button className="btn ghost" onClick={() => setSession(null)}>Sign out</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
