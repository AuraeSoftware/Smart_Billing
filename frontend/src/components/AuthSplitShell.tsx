import type { ReactNode } from 'react'
import Brand from './Brand'
import ThemeToggle from './ThemeToggle'

/**
 * Centered auth card — a single card on a plain page background with a
 * large brand mark above the form, matching Smart Garage 360's Login
 * reference. Used by Login and the signup (Super Admin registration) page.
 */
export default function AuthSplitShell({
  children,
  wide,
}: {
  children: ReactNode
  /** Signup's form has more fields than Login's — give it more room. */
  wide?: boolean
}) {
  return (
    <div className="auth-center">
      <div className="auth-center-theme"><ThemeToggle /></div>
      <div className={`auth-center-card card${wide ? ' auth-center-card-wide' : ''}`}>
        <div className="auth-center-brand"><Brand size={72} variant="stacked" /></div>
        {children}
      </div>
    </div>
  )
}
