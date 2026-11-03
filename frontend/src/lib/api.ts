import { getDeviceLabel, getDeviceToken } from './device'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  const raw = localStorage.getItem('sb_session')
  if (!raw) return {}
  const { token } = JSON.parse(raw)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** FastAPI sends validation problems as a list of objects; turn them into a
 * short sentence a person can act on instead of "[object Object]". */
function friendlyDetail(d: unknown): string {
  if (typeof d === 'string') return d
  if (!Array.isArray(d)) return ''
  const parts = d.map((e: { loc?: unknown[]; msg?: string; type?: string }) => {
    const field = String((e.loc || []).filter((x) => x !== 'body' && x !== 'query').slice(-1)[0] ?? '').replace(/_/g, ' ')
    let msg = e.msg || 'is not valid'
    if (/email/i.test(msg) || /email/.test(field)) msg = 'Enter a valid email address, like name@company.com.'
    else if (e.type === 'missing') msg = `${cap(field) || 'This field'} is required.`
    else if (/string_too_short|at least/i.test(e.type + ' ' + msg)) msg = `${cap(field) || 'This field'} is too short.`
    else if (/greater_than|less_than|greater than|less than/i.test(e.type + ' ' + msg)) msg = `${cap(field) || 'This value'} is out of the allowed range.`
    else if (/int_parsing|float_parsing|number/i.test(e.type + ' ' + msg)) msg = `${cap(field) || 'This value'} must be a number.`
    else msg = `${cap(field) ? cap(field) + ': ' : ''}${msg.replace(/^Value error, /, '')}`
    return msg
  })
  return Array.from(new Set(parts)).join(' ')
}
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Important: when the body is FormData, we must NOT set a Content-Type
  // header at all -- not even by setting it to undefined, which the Fetch
  // API turns into the literal string "Content-Type: undefined" rather
  // than omitting it. That overwrites the browser's auto-generated
  // "multipart/form-data; boundary=..." header, and the server then can't
  // parse the upload (FastAPI reports it as 422 Unprocessable Entity,
  // since it can't find the required file fields in an unparseable body).
  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = friendlyDetail(body.detail) || detail
    } catch {
      // ignore — non-JSON error body
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/pdf')) return (await res.blob()) as unknown as T
  return (await res.json()) as T
}

export async function login(email: string, password: string) {
  return apiFetch<{ access_token: string; role: string; tenant_id: string | null; full_name: string; tenant_status: string | null }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      device_token: getDeviceToken(),
      device_label: getDeviceLabel(),
    }),
  })
}
