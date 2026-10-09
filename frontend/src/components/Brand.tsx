/**
 * Smart Billing's real logo lockup (red "S"-wallet mark + "SMART BILLING" +
 * "Ignite every transaction"), supplied as two finished exports — a wide
 * horizontal version and a stacked/square version — both on a white
 * background with black wordmark text. Rendered as-is inside a small white
 * "chip" so it reads cleanly whether it sits on the app's dark marketing
 * panel or a light card: the chip supplies its own guaranteed-white
 * backing, so the logo never depends on (or has to match) the page's
 * current theme.
 */
const ASPECT = { wide: 1694 / 678, stacked: 1342 / 1664 }

export default function Brand({
  size = 40,
  variant = 'wide',
  chip = true,
}: {
  /** Rendered height in px (chip padding scales with it). */
  size?: number
  /** 'wide' — horizontal lockup, for tight header bars.
   *  'stacked' — icon-over-wordmark, for a centered card brand. */
  variant?: 'wide' | 'stacked'
  /** Wrap in a white rounded card. Leave off only when the surface behind
   * it is already guaranteed white (e.g. inside another white chip). */
  chip?: boolean
}) {
  const src = variant === 'stacked' ? '/logo/lockup-stacked.png' : '/logo/lockup-wide.png'
  const height = size
  const width = Math.round(height * ASPECT[variant])
  const img = (
    <img
      src={src}
      alt="Smart Billing — Ignite every transaction"
      style={{ display: 'block', height, width }}
    />
  )
  if (!chip) return img
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        alignSelf: 'flex-start', flexShrink: 0,
        background: '#ffffff',
        borderRadius: variant === 'stacked' ? Math.max(12, size * 0.18) : Math.max(8, size * 0.22),
        padding: variant === 'stacked' ? size * 0.22 : size * 0.18,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08), 0 6px 20px rgba(0,0,0,0.14)',
      }}
    >
      {img}
    </div>
  )
}
