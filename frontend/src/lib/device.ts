/**
 * Stable per-device identifier for the device-binding control in SOW 3.3.
 * Generated once and kept in localStorage (not sessionStorage, not cleared on
 * logout) so the same browser/device is recognized across sessions. Clearing
 * site data or reinstalling counts as "a new device" from the backend's
 * point of view, matching the SOW's note that a factory reset or browser
 * data wipe requires re-registration.
 */
const DEVICE_TOKEN_KEY = 'sb_device_token'

export function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

export function getDeviceLabel(): string {
  const ua = navigator.userAgent
  const isMobile = /Mobi|Android|iPhone|iPad/.test(ua)
  const platform = isMobile ? 'Mobile' : 'Desktop'
  let browser = 'Browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/')) browser = 'Safari'
  return `${browser} on ${platform}`
}
