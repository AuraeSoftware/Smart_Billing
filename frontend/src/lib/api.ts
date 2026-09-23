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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': options.body instanceof FormData ? undefined as unknown as string : 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
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
  return apiFetch<{ access_token: string; role: string; tenant_id: string | null; full_name: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      device_token: getDeviceToken(),
      device_label: getDeviceLabel(),
    }),
  })
}
