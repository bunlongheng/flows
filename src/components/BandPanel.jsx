import { useRef } from 'react'
import { PANEL, PANEL_CAPTION } from '../panel.js'

// The right panel for a picked panel or section, in Excalidraw's metrics:
// 36px square buttons, 8px radius, a ring on the chosen one.
const ACTIVE = '#6965db'
const ACTIVE_BG = '#e0dfff'

// Excalidraw draws the chosen tile as a lavender fill on a WHITE panel, where
// that is plenty of contrast. This panel's ground is #f1f5f9, and #e0dfff on
// #f1f5f9 is 2 pale colours a few points apart - the tile was technically lit
// and practically invisible, which reads as a control that does nothing. The
// ring is what makes it chosen at a glance; the unlit tile gets a white face so
// the row reads as a set of buttons rather than bare glyphs on the panel.
const btn = (on) => ({
  width: 36, height: 36, display: 'grid', placeItems: 'center', cursor: 'pointer',
  border: 'none', borderRadius: 8, padding: 0,
  background: on ? ACTIVE_BG : '#ffffff', color: on ? ACTIVE : '#1b1b1f',
  boxShadow: on ? `inset 0 0 0 2px ${ACTIVE}` : 'inset 0 0 0 1px rgba(15,23,42,0.08)',
})

function Section({ label, right, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#1b1b1f' }}>{label}</div>
        {right}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

// A swatch is the colour itself, so "transparent" has to draw as the checkerboard
// Excalidraw uses - an empty white square reads as white, which is a real choice.
const CHECKER = 'repeating-conic-gradient(#efefef 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

function Swatch({ color, on, onPick }) {
  return (
    <button type="button" title={color} onClick={() => onPick(color)}
      style={{
        width: 36, height: 36, borderRadius: 8, cursor: 'pointer', padding: 0,
        background: color === 'transparent' ? CHECKER : color,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${ACTIVE}` : 'none',
      }} />
  )
}

// The colour the band already is, on the label line.
function Current({ background }) {
  return (
    <span title="Current" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6b7280' }}>
      now
      <span style={{ width: 18, height: 18, borderRadius: 5, background, border: '1px solid rgba(0,0,0,0.12)' }} />
    </span>
  )
}

// Panel and section colours, greys first: a grey panel is the usual ask.
const BAND_PICKS = ['#64748b', '#94a3b8', '#475569', '#1e293b', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488']

// The right panel for a picked panel or section: 1 colour, from the swatches
// or any colour, and Auto to take its cards' colour again.
export function BandPanel({ band, onColor }) {
  const cur = (band.hand || '').toLowerCase()
  // The colour wheel reports every step of a drag; only where it rests is saved.
  const wait = useRef(null)
  const pickAny = c => { clearTimeout(wait.current); wait.current = setTimeout(() => onColor(c), 250) }
  return (
    <div className="sd-band-panel" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={PANEL_CAPTION}>{band.kind}</div>
        <button type="button" onClick={() => onColor(null)} title="Back to its cards' colour"
          style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: 11, cursor: 'pointer', padding: 0 }}>Auto</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1b1b1f', marginBottom: 12 }}>{band.title}</div>
      <Section label="Colour" right={<Current background={band.color} />}>
        {BAND_PICKS.map(c => <Swatch key={c} color={c} on={cur === c} onPick={onColor} />)}
        <label title="Any colour" style={{ ...btn(!!cur && !BAND_PICKS.includes(cur)), position: 'relative', overflow: 'hidden', background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(band.color) ? band.color : '#64748b'} onChange={e => pickAny(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
      </Section>
    </div>
  )
}
