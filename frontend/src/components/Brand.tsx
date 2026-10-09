/**
 * Smart Billing's wordmark lockup — the supplied logo files turned out to
 * have a defect in their light-mode wordmark text (exported white-on-white,
 * so only the "S"/"B" initials were ever visible against a white or
 * transparent background). Rather than ship that, this uses only the
 * colour mark from those files (red + white, which reads cleanly on any
 * background) and renders "SMART BILLING" as real, theme-aware text next
 * to it — same visual result, no broken asset.
 */
export default function Brand({
  size = 40,
  stacked = false,
  textColor,
}: {
  size?: number
  stacked?: boolean
  /** Defaults to the current theme's --text; pass a fixed color (e.g. '#fff'
   * for a panel that's always dark regardless of site theme). */
  textColor?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28, flexDirection: stacked ? 'column' : 'row' }}>
      <img src="/logo/icon.png" alt="" style={{ height: size, width: 'auto', flexShrink: 0 }} />
      <div
        style={{
          fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.05,
          fontSize: size * 0.42, color: textColor ?? 'var(--text)',
          textAlign: stacked ? 'center' : 'left',
        }}
      >
        <div>SMART</div>
        <div style={{ color: 'var(--accent)' }}>BILLING</div>
      </div>
    </div>
  )
}
