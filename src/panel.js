// The 1 look every right-side panel shares: Format, Card, Share, History and
// any panel added later. Same width, ground, border, padding and slide-in, so
// opening a different panel never shifts the canvas by a different amount.
export const PANEL_WIDTH = 280

export const PANEL = {
  width: PANEL_WIDTH, flexShrink: 0, background: '#f1f5f9', borderLeft: '1px solid #e2e8f0',
  display: 'flex', flexDirection: 'column', padding: '20px 16px', overflowY: 'auto',
  animation: 'sd-slide-right 0.2s ease-out',
}

// The small caps caption that heads a panel (and a section inside one).
export const PANEL_CAPTION = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }

// The ✕ at a panel's top-right.
export const PANEL_CLOSE = { background: 'none', border: 'none', color: '#8a8d91', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: 0 }
