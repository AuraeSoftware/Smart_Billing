/**
 * Smart Billing's logo lockup — transparent-background cutouts of the real
 * artwork (no white box around it), with the wordmark re-colored for each
 * theme: black text for light backgrounds, white text for dark ones (the
 * red icon and accent letters are untouched either way, since red reads
 * fine on both). Both images are always in the DOM and the app's existing
 * `.logo-light`/`.logo-dark` theme utilities — tied to
 * `html[data-theme="dark"]` — show only the one that matches the current
 * theme, so it switches instantly with the rest of the UI.
 */
const ASPECT = { wide: 1694 / 678, stacked: 1342 / 1664 }

export default function Brand({
  size = 40,
  variant = 'wide',
  theme,
}: {
  /** Rendered height in px. */
  size?: number
  /** 'wide' — horizontal lockup, for header bars.
   *  'stacked' — icon-over-wordmark, for a centered card brand. */
  variant?: 'wide' | 'stacked'
  /** Pin to one variant's colors regardless of the site theme — for a
   * surface with its own fixed background (e.g. the always-dark loading
   * screen) where following the app theme would pick the wrong contrast.
   * Leave unset to follow the app theme, which is the normal case. */
  theme?: 'light' | 'dark'
}) {
  const height = size
  const width = Math.round(height * ASPECT[variant])
  const imgStyle = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', display: 'block' }
  if (theme) {
    return (
      <span style={{ display: 'inline-block', position: 'relative', width, height }}>
        <img src={`/logo/lockup-${variant}-${theme}.png`} alt="Smart Billing — Ignite every transaction" style={imgStyle} />
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-block', position: 'relative', width, height }}>
      <img src={`/logo/lockup-${variant}-light.png`} alt="Smart Billing — Ignite every transaction" className="logo-light" style={imgStyle} />
      <img src={`/logo/lockup-${variant}-dark.png`} alt="Smart Billing — Ignite every transaction" className="logo-dark" style={imgStyle} />
    </span>
  )
}
