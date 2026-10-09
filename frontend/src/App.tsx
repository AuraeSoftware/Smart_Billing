import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './pages/Login'
import SubscribeSignup from './pages/SubscribeSignup'
import SubscribePayment from './pages/SubscribePayment'
import SubscribeBranding from './pages/SubscribeBranding'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import SupremeAdminDashboard from './pages/SupremeAdminDashboard'
import LoadingScreen from './components/LoadingScreen'

function RequireRole({ role, children }: { role: 'supreme_admin' | 'any_tenant'; children: React.ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (role === 'supreme_admin' && session.role !== 'supreme_admin') return <Navigate to="/app" replace />
  if (role === 'any_tenant' && session.role === 'supreme_admin') return <Navigate to="/admin" replace />
  return <>{children}</>
}

// The branded splash plays once per browser tab session — on a hard
// reload/first visit, not on every in-app navigation — then gets out of
// the way for good.
const BOOT_KEY = 'sb_booted'

export default function App() {
  const [booting, setBooting] = useState(() => {
    try {
      return sessionStorage.getItem(BOOT_KEY) !== '1'
    } catch {
      return true
    }
  })

  if (booting) {
    return (
      <LoadingScreen
        onDone={() => {
          try {
            sessionStorage.setItem(BOOT_KEY, '1')
          } catch {
            // Private-browsing or storage-blocked — the splash just replays
            // next time, which is harmless.
          }
          setBooting(false)
        }}
      />
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/subscribe" element={<SubscribeSignup />} />
      <Route path="/subscribe/:tenantId/payment" element={<SubscribePayment />} />
      <Route path="/subscribe/:tenantId/branding" element={<SubscribeBranding />} />
      <Route path="/app" element={<RequireRole role="any_tenant"><SuperAdminDashboard /></RequireRole>} />
      <Route path="/admin" element={<RequireRole role="supreme_admin"><SupremeAdminDashboard /></RequireRole>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
