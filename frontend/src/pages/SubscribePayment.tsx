import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void }
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'))
    document.body.appendChild(script)
  })
}

/** Step between signup and branding for any paid plan (SOW: "if they go for
 * a paid plan in that itself it should automatically navigate them to
 * payment process"). A trial plan never lands here — SubscribeSignup routes
 * straight to branding for that. The workspace stays pending_onboarding
 * until this succeeds; branding submission re-checks it server-side. */
export default function SubscribePayment() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'checking' | 'ready' | 'paying' | 'paid' | 'error'>('checking')
  const [planName, setPlanName] = useState('')
  const [amountLabel, setAmountLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    apiFetch<{ status: string }>(`/subscription/${tenantId}/payment/status`)
      .then((res) => {
        if (res.status === 'not_required' || res.status === 'paid') {
          navigate(`/subscribe/${tenantId}/branding`, { replace: true })
        } else {
          setStatus('ready')
        }
      })
      .catch(() => setStatus('ready'))
  }, [tenantId, navigate])

  async function payNow() {
    if (!tenantId) return
    setError(null)
    setStatus('paying')
    try {
      await loadRazorpayScript()
      const order = await apiFetch<{ order_id: string; amount: number; currency: string; key_id: string; plan_name: string }>(
        `/subscription/${tenantId}/payment/create-order`,
        { method: 'POST' },
      )
      setPlanName(order.plan_name)
      setAmountLabel(`${order.currency} ${(order.amount / 100).toFixed(2)}`)

      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Smart Billing',
        description: `${order.plan_name} plan subscription`,
        theme: { color: '#da1a31' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await apiFetch(`/subscription/${tenantId}/payment/verify`, {
              method: 'POST',
              body: JSON.stringify(response),
            })
            setStatus('paid')
            navigate(`/subscribe/${tenantId}/branding`)
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment could not be verified. Please try again.')
            setStatus('ready')
          }
        },
        modal: {
          ondismiss: () => setStatus('ready'),
        },
      })
      razorpay.open()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStatus('ready')
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <h1>Complete your payment</h1>
        <p className="muted">
          {planName ? `${planName} — ${amountLabel}` : 'Step 2 of 3 — your plan requires payment before your workspace can be activated. Branding comes next.'}
        </p>
        {error && <p className="error-text">{error}</p>}
        {status === 'checking' ? (
          <p className="muted">Checking your subscription…</p>
        ) : (
          <button className="btn" onClick={payNow} disabled={status === 'paying' || status === 'paid'}>
            {status === 'paying' ? 'Opening secure checkout…' : status === 'paid' ? 'Payment received' : 'Pay now'}
          </button>
        )}
        <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
          Payments are processed securely by Razorpay. Your card and bank details never touch Smart Billing's servers.
        </p>
      </div>
    </div>
  )
}
