import type { ReactNode } from 'react'
import Brand from './Brand'
import ThemeToggle from './ThemeToggle'

/**
 * Split-panel auth layout (dark marketing panel + white form card) — the
 * brand mark is centered at the top of the dark panel, large and clear.
 * Used by Login and the signup (Super Admin registration) page.
 */
export default function AuthSplitShell({
  headline,
  tagline,
  bullets,
  children,
  wide,
}: {
  headline: ReactNode
  tagline: string
  bullets: string[]
  children: ReactNode
  /** Signup's form has more fields than Login's — give it more room. */
  wide?: boolean
}) {
  return (
    <div className="auth-split">
      <div className="auth-split-left">
        {/* This panel's background is always dark (brand gradient), regardless
            of the site's light/dark theme, so the logo is pinned to the dark
            variant rather than following the theme. */}
        <div className="auth-split-brand"><Brand size={64} variant="stacked" theme="dark" /></div>
        <div className="auth-split-pitch">
          <h2>{headline}</h2>
          <p>{tagline}</p>
          <ul>
            {bullets.map((b) => (
              <li key={b}>
                <span className="auth-split-check">✓</span> {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-split-footer">Built by OS2 Studio</div>
      </div>
      <div className="auth-split-right">
        <div className="auth-split-theme"><ThemeToggle /></div>
        <div className={`auth-split-card card${wide ? ' auth-split-card-wide' : ''}`}>
          <div className="auth-split-card-brand"><Brand size={52} variant="stacked" /></div>
          {children}
        </div>
      </div>
    </div>
  )
}
