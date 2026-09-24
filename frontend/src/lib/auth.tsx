import { createContext, useContext, useState, type ReactNode } from 'react'

export interface Session {
  token: string
  role: 'supreme_admin' | 'super_admin' | 'tenant_user'
  tenantId: string | null
  fullName: string
  // "pending_onboarding" | "active" | null (supreme admin has no tenant).
  // Suspended/cancelled workspaces are rejected at login itself, so this
  // value is only ever those two for a signed-in tenant user.
  tenantStatus?: string | null
}

const SESSION_KEY = 'sb_session'

function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? (JSON.parse(raw) as Session) : null
}

interface AuthContextValue {
  session: Session | null
  setSession: (s: Session | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(loadSession())

  function setSession(s: Session | null) {
    setSessionState(s)
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  }

  return <AuthContext.Provider value={{ session, setSession }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
