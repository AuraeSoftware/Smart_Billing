import type { ReactNode } from 'react'
import Brand from './Brand'
import ThemeToggle from './ThemeToggle'

/**
 * Split-panel auth layout (dark marketing panel + white form panel) —
 * matches the reference design: a dark left panel carrying the pitch and a
 * bulleted feature list, and a card on the right holding the actual form.
 * Used by Login and the signup (Super Admin registration) pages; Payment
 * and Branding keep their existing simple centered layout since no
 * reference design was given for those steps.
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
        <Brand size={34} textColor="#ffffff" />
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
          <div className="auth-split-card-brand"><Brand size={40} stacked /></div>
          {children}
        </div>
      </div>
    </div>
  )
}
