import { LEGEND_INK as K } from '../legend.js'

// The swatch for 1 legend row, 28 x 14: a line, a dash, a red dash, a red X
// tile, the NEW pill, or a custom row's colour box, line, dash or dots.
function Swatch({ kind, color }) {
  if (kind === 'custom-box') return <span style={{ display: 'inline-block', width: 14, height: 14, background: color, borderRadius: 3 }} />
  if (kind.startsWith('custom-')) return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      <path d="M1 7 H22" stroke={color} strokeWidth="1.6" strokeLinecap={kind === 'custom-dot' ? 'round' : undefined} strokeDasharray={kind === 'custom-dash' ? '4 3' : kind === 'custom-dot' ? '0.1 3.5' : undefined} />
      <path d="M21 3 L27 7 L21 11 Z" fill={color} />
    </svg>
  )
  if (kind === 'callout') return <span style={{ display: 'inline-block', width: 30, height: 12, background: K.callout, borderRadius: 4 }} />
  if (kind === 'new') return <span style={{ background: K.new, color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', lineHeight: '14px', padding: '0 5px', borderRadius: 999 }}>NEW</span>
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      {kind === 'x' ? <>
        <rect x="8" y="1" width="12" height="12" fill={K.xTint} stroke={K.xBorder} />
        <path d="M9 2 L19 12 M9 12 L19 2" stroke={K.x} strokeWidth="1.8" strokeLinecap="round" />
      </> : <>
        <path d="M1 7 H22" stroke={kind === 'removed' ? K.removed : kind === 'dash' ? K.dash : K.line} strokeWidth="1.6" strokeDasharray={kind === 'line' ? undefined : '4 3'} />
        <path d="M21 3 L27 7 L21 11 Z" fill={kind === 'removed' ? K.removed : kind === 'dash' ? K.dash : K.line} />
      </>}
    </svg>
  )
}

// Pinned bottom-left of the canvas, above the dots, never over the toolbar.
// `rows` are legendList() objects { label, kind, color? }.
export function Legend({ rows }) {
  if (!rows.length) return null
  return (
    <div className="sd-legend" data-testid="legend" style={{
      position: 'absolute', left: 16, bottom: 16, zIndex: 20, background: '#ffffff', border: '1px solid #e4e6e8',
      borderRadius: 10, boxShadow: '0 4px 18px rgba(0,0,0,0.07)', padding: '9px 12px', fontSize: 11.5, color: '#1f2937', pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Legend</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 20 }}>
          <span style={{ width: 34, display: 'inline-flex', justifyContent: 'center' }}><Swatch kind={r.kind} color={r.color} /></span>
          {r.label}
        </div>
      ))}
    </div>
  )
}
