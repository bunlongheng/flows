// ─── Gallery skeleton ─────────────────────────────────────────────────────────
// What the gallery shows while the list is still in flight.
//
// It used to show the bundled IFTTT sample instead, so every cold load flashed
// a diagram the owner does not have. A placeholder must never be mistakable for
// content: this one borrows the real card's geometry - 42px brand tile, title
// and date line, 2 tag pills, a 2:1 thumbnail - and nothing else. No words, no
// counts, no title. Shape only.
//
// The shimmer is 1 sweep travelling left to right across the whole grid rather
// than each card pulsing on its own: a row of independently blinking boxes
// reads as broken, 1 pass over a still grid reads as loading. Cards enter on a
// short stagger so the grid assembles instead of appearing.

const BONE = '#e8eaee'
const COUNT = 8

function Bone({ w, h, r = 6, style }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: BONE, ...style }} />
}

export function GallerySkeleton({ count = COUNT }) {
  return (
    <div className="sd-grid sd-skel" aria-busy="true" aria-label="Loading diagrams"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sd-skel-card" style={{
          background: '#fff', borderRadius: 14, border: '2px solid transparent',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
          animationDelay: `${i * 60}ms`,
        }}>
          <div style={{ padding: '13px 14px 8px', display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <Bone w={42} h={42} r={10} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
              <Bone w="72%" h={11} />
              <Bone w="42%" h={9} style={{ marginTop: 8 }} />
            </div>
          </div>
          <div style={{ padding: '0 13px 8px', display: 'flex', gap: 4 }}>
            <Bone w={52} h={14} r={20} />
            <Bone w={44} h={14} r={20} />
          </div>
          <div style={{ padding: '0 12px 13px' }}>
            <div style={{ aspectRatio: '2 / 1', borderRadius: 8, background: '#f3f4f7', border: '1px solid #eef0f3' }} />
          </div>
        </div>
      ))}
      <style>{`
        .sd-skel-card { animation: sd-skel-in 240ms ease-out both; }
        @keyframes sd-skel-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        /* One sweep across the grid, not a pulse per card. */
        .sd-skel { position: relative; overflow: hidden; }
        .sd-skel::after {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.72) 50%, transparent 80%);
          transform: translateX(-100%);
          animation: sd-skel-sweep 1.5s ease-in-out infinite;
        }
        @keyframes sd-skel-sweep { to { transform: translateX(100%) } }
        @media (prefers-reduced-motion: reduce) {
          .sd-skel-card { animation: none }
          .sd-skel::after { animation: none; opacity: 0 }
        }
      `}</style>
    </div>
  )
}
