import { useState, type ReactNode } from 'react'
import ThemeToggle from './ThemeToggle'
import Brand from './Brand'
import { Icon, ICONS } from './DashboardUI'
import { useAuth } from '../lib/auth'

export interface NavItem {
  key: string
  label: string
  /** One of DashboardUI's ICONS keys — every nav item gets one so the
   * sidebar matches Smart Garage 360's icon+label row style. */
  icon: keyof typeof ICONS
}

interface AppLayoutProps {
  brandSuffix?: string
  navItems: NavItem[]
  activeKey: string
  onNavigate: (key: string) => void
  topbarExtra?: ReactNode
  children: ReactNode
}

function initialsOf(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Shared sidebar shell for the Super Admin and Supreme Admin dashboards —
 * icon+label nav with a red-accent active row, a centered brand mark in the
 * topbar, and a profile card (avatar initials, name, role, sign out) anchored
 * to the bottom of the sidebar — matching Smart Garage 360's dashboard chrome.
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

  const ROLE_LABELS: Record<string, string> = {
    supreme_admin: 'Supreme Admin', super_admin: 'Super Admin', tenant_user: 'Team member',
  }
  const roleLabel = brandSuffix ?? ROLE_LABELS[session?.role ?? ''] ?? 'Account'

  return (
    <div className="app-shell">
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="brand">
          SMART<span className="dot">•</span>BILLING
          <button className="sidebar-close" aria-label="Close menu" onClick={() => setNavOpen(false)}>✕</button>
        </div>
        <div className="sidebar-menu-label">Menu</div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={item.key === activeKey ? 'active' : ''}
              onClick={() => navigate(item.key)}
            >
              <Icon path={ICONS[item.icon]} size={17} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-profile">
            <div className="sidebar-avatar">{initialsOf(session?.fullName)}</div>
            <div className="sidebar-profile-text">
              <div className="sidebar-profile-name">{session?.fullName ?? 'Account'}</div>
              <div className="sidebar-profile-role">{roleLabel}</div>
            </div>
          </div>
          <button className="btn warn sidebar-signout" onClick={() => setSession(null)}>
            <Icon path="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <button className="hamburger-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <span /><span /><span />
            </button>
            <div className="title">{activeLabel}</div>
          </div>
          <div className="topbar-brand"><Brand size={22} variant="wide" /></div>
          <div className="topbar-actions" style={{ flex: 1, justifyContent: 'flex-end' }}>
            {topbarExtra}
            <ThemeToggle />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
