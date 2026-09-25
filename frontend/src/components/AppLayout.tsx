import { useState, type ReactNode } from 'react'
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
  // Sidebar is a fixed column on laptop/desktop and a slide-in drawer below
  // 900px (tablet/phone) — same nav, same items, nothing dropped, just
  // hidden behind a hamburger button until opened.
  const [navOpen, setNavOpen] = useState(false)

  function navigate(key: string) {
    onNavigate(key)
    setNavOpen(false)
  }

  return (
    <div className="app-shell">
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand">
          SMART<span className="dot">•</span>BILLING
          <button className="sidebar-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>✕</button>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={item.key === activeKey ? 'active' : ''}
              onClick={() => navigate(item.key)}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button className="hamburger-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <span /><span /><span />
            </button>
            <div className="title">{activeLabel}</div>
          </div>
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
