import { ViewportPortal } from '@xyflow/react'

// ─── Snap guides ──────────────────────────────────────────────────────────────
// What a moving card is about to latch onto, in flow coordinates through a
// ViewportPortal so the marks pan and zoom with the canvas.
//
// 2 kinds, deliberately unalike, because they answer different questions:
//   alignment - a thin amber rule through the shared edge or centre line
//   padding   - a teal ribbon laid INSIDE the gap, wearing its own measure
// A rule says "these line up". A ribbon says "this space is the same space as
// everywhere else". Same colour for both would blur the 2 into one vague hint.

const PAD = 14 // let the rule overshoot both cards so it reads as a guide
const AMBER = '#eab308'
const TEAL = '#0d9488'

function Rule({ g }) {
  return (
    <div className="sd-snap-guide" style={{
      position: 'absolute', pointerEvents: 'none', zIndex: 5,
      background: AMBER, boxShadow: `0 0 6px ${AMBER}d9`,
      ...(g.axis === 'x'
        ? { left: g.at, top: g.from - PAD, width: 1.5, height: g.to - g.from + PAD * 2 }
        : { left: g.from - PAD, top: g.at, height: 1.5, width: g.to - g.from + PAD * 2 }),
    }} />
  )
}

// The ribbon fills the gap end to end and carries the number, so the gap is
// not merely marked but stated: 40 here, 40 everywhere else.
function Ribbon({ g }) {
  const span = Math.max(g.to - g.from, 0)
  const across = g.axis === 'x'
  return (
    <div className="sd-snap-gap" style={{
      position: 'absolute', pointerEvents: 'none', zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `${TEAL}26`,
      [across ? 'borderLeft' : 'borderTop']: `1.5px solid ${TEAL}`,
      [across ? 'borderRight' : 'borderBottom']: `1.5px solid ${TEAL}`,
      ...(across
        ? { left: g.from, top: g.at - 13, width: span, height: 26 }
        : { left: g.at - 13, top: g.from, width: 26, height: span }),
    }}>
      <span style={{
        background: TEAL, color: '#fff', borderRadius: 4,
        padding: '1px 5px', fontSize: 11, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.5, whiteSpace: 'nowrap',
      }}>{g.gap}</span>
    </div>
  )
}

export function SnapGuides({ guides = [] }) {
  if (!guides.length) return null
  return (
    <ViewportPortal>
      {guides.map(g => (g.kind === 'gap'
        ? <Ribbon key={`gap-${g.axis}-${g.at}-${g.from}`} g={g} />
        : <Rule key={`${g.axis}-${g.at}`} g={g} />))}
    </ViewportPortal>
  )
}
