import { useEffect, useState } from 'react'
import Brand from './Brand'

/**
 * Branded splash screen shown once per browser session, matching the
 * reference design: dark background, centered logo/wordmark, and an
 * animated progress bar under a short status line. There's no real async
 * bootstrap to gate this on (auth/theme init is synchronous), so it runs on
 * a fixed timer — long enough to read as a deliberate brand moment, short
 * enough not to feel like a delay.
 */
export default function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(4)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const start = Date.now()
    const duration = 1100
    const tick = window.setInterval(() => {
      const pct = Math.min(100, Math.round((Date.now() - start) / duration * 100))
      setProgress(pct)
      if (pct >= 100) {
        window.clearInterval(tick)
        setFading(true)
        window.setTimeout(onDone, 260)
      }
    }, 30)
    return () => window.clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 28, background: 'linear-gradient(160deg, #0b0f1a 0%, #161c2e 55%, #1c2338 100%)',
        opacity: fading ? 0 : 1, transition: 'opacity 260ms ease',
      }}
    >
      <Brand size={64} variant="stacked" theme="dark" />
      <div style={{ width: 220 }}>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', width: `${progress}%`, borderRadius: 4,
              background: 'linear-gradient(90deg, var(--accent), #ff5c6c)',
              transition: 'width 80ms linear',
            }}
          />
        </div>
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)' }}>
          LOADING SYSTEM…
        </div>
      </div>
    </div>
  )
}
