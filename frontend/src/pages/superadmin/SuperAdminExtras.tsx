import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../../lib/api'
import { DashboardCard, StatusChip, EmptyState } from '../../components/DashboardUI'

/**
 * Tenant-facing equivalents of the Supreme Admin's subscription pages —
 * My Plan (read-only), Payment Settings (read-only, published by the
 * Supreme Admin), and Credentials (self-service password change).
 */

interface MyPlan {
  tenant_name: string
  subscription_status: string
  currency: string
  plan_name: string | null
  plan_description: string | null
  plan_price: number | null
  plan_billing_cycle: string | null
  plan_max_users: number | null
  plan_max_invoices_per_month: number | null
}

export function MyPlanPage() {
  const [plan, setPlan] = useState<MyPlan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<MyPlan>('/account/my-plan').then(setPlan).finally(() => setLoading(false))
  }, [])

  if (loading) return <DashboardCard title="My Plan"><p className="muted">Loading…</p></DashboardCard>
  if (!plan) return <DashboardCard title="My Plan"><EmptyState title="Could not load plan details" /></DashboardCard>

  return (
    <DashboardCard title="My Plan" subtitle="Your current subscription — contact Aurae Software Solutions to change plans.">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <StatusChip status={plan.subscription_status} />
        <span className="muted">Billing currency: {plan.currency}</span>
      </div>
      {plan.plan_name ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div><div className="muted">Plan</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_name}</div></div>
          <div><div className="muted">Price</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.currency} {plan.plan_price?.toFixed(2)} / {plan.plan_billing_cycle}</div></div>
          <div><div className="muted">Max users</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_users}</div></div>
          <div><div className="muted">Max invoices / month</div><div style={{ fontWeight: 800, fontSize: 16 }}>{plan.plan_max_invoices_per_month}</div></div>
          {plan.plan_description && <div style={{ gridColumn: '1 / -1' }}><div className="muted">Description</div><div>{plan.plan_description}</div></div>}
        </div>
      ) : (
        <EmptyState title="No plan assigned yet" sub="Aurae Software Solutions will assign a plan to your workspace shortly." />
      )}
    </DashboardCard>
  )
}

interface PaymentSettings {
  bank_name: string | null; account_name: string | null; account_number: string | null
  ifsc_code: string | null; upi_id: string | null; supported_gateways: string | null; notes: string | null
}

export function TenantPaymentSettingsPage() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<PaymentSettings | null>('/account/payment-settings').then(setSettings).finally(() => setLoading(false))
  }, [])

  if (loading) return <DashboardCard title="Payment Settings"><p className="muted">Loading…</p></DashboardCard>

  return (
    <DashboardCard title="Payment Settings" subtitle="Published by Aurae Software Solutions — read-only.">
      {!settings || (!settings.bank_name && !settings.upi_id) ? (
        <EmptyState title="No payment instructions published yet" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {settings.bank_name && <div><div className="muted">Bank</div><div style={{ fontWeight: 700 }}>{settings.bank_name}</div></div>}
          {settings.account_name && <div><div className="muted">Account name</div><div style={{ fontWeight: 700 }}>{settings.account_name}</div></div>}
          {settings.account_number && <div><div className="muted">Account number</div><div style={{ fontWeight: 700 }}>{settings.account_number}</div></div>}
          {settings.ifsc_code && <div><div className="muted">IFSC</div><div style={{ fontWeight: 700 }}>{settings.ifsc_code}</div></div>}
          {settings.upi_id && <div><div className="muted">UPI ID</div><div style={{ fontWeight: 700 }}>{settings.upi_id}</div></div>}
          {settings.supported_gateways && <div><div className="muted">Gateways</div><div style={{ fontWeight: 700 }}>{settings.supported_gateways}</div></div>}
          {settings.notes && <div style={{ gridColumn: '1 / -1' }}><div className="muted">Notes</div><div>{settings.notes}</div></div>}
        </div>
      )}
    </DashboardCard>
  )
}

export function TenantCredentialsPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  async function submit() {
    setMessage(null)
    if (newPassword !== confirm) {
      setMessage({ text: 'New password and confirmation do not match.', ok: false })
      return
    }
    try {
      await apiFetch('/account/change-password', { method: 'POST', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
      setMessage({ text: 'Password updated.', ok: true })
      setCurrentPassword(''); setNewPassword(''); setConfirm('')
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : 'Could not update password.', ok: false })
    }
  }

  return (
    <DashboardCard title="Credentials" subtitle="Change your password, or de-register this device from your account.">
      <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
        <label>Current password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
        <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {message && <p style={{ color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</p>}
        <button className="btn" onClick={submit} disabled={!currentPassword || !newPassword}>Update password</button>
      </div>
    </DashboardCard>
  )
}
