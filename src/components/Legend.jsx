import { LEGEND_ROWS, LEGEND_INK as K } from '../legend.js'

// The swatch for 1 legend row, 28 x 14: a line, a dash, a red dash, a red X
// tile or the NEW pill.
function Swatch({ kind }) {
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
export function Legend({ rows }) {
  if (!rows.length) return null
  return (
    <div className="sd-legend" data-testid="legend" style={{
      position: 'absolute', left: 16, bottom: 16, zIndex: 20, background: '#ffffff', border: '1px solid #e4e6e8',
      borderRadius: 10, boxShadow: '0 4px 18px rgba(0,0,0,0.07)', padding: '9px 12px', fontSize: 11.5, color: '#1f2937', pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Legend</div>
      {rows.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 20 }}>
          <span style={{ width: 34, display: 'inline-flex', justifyContent: 'center' }}><Swatch kind={LEGEND_ROWS[k].kind} /></span>
          {LEGEND_ROWS[k].label}
        </div>
      ))}
    </div>
  )
}
