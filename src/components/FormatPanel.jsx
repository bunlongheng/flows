import { STROKE_PICKS, BG_PICKS, BORDER_WIDTHS, BORDER_STYLES, RADII, FONTS, FONT_SIZES, ALIGNS } from '../style.js'

// The properties panel, modelled on Excalidraw's. Its metrics are Excalidraw's
// too - 36px square buttons, 8px radius, #e0dfff behind the active one, #6965db
// for its glyph - because the whole point of the request was "exactly like
// Excalidraw", and a panel that is nearly the same reads as a bad copy.
//
// It is presentational: it holds no state, renders the style it is handed, and
// reports a patch. Whoever mounts it owns persistence and undo.
const ACTIVE = '#6965db'
const ACTIVE_BG = '#e0dfff'

const btn = (on) => ({
  width: 36, height: 36, display: 'grid', placeItems: 'center', cursor: 'pointer',
  border: 'none', borderRadius: 8, padding: 0,
  background: on ? ACTIVE_BG : 'transparent', color: on ? ACTIVE : '#1b1b1f',
})

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#1b1b1f', marginBottom: 6 }}>{label}</div>
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

// Excalidraw draws each control as a glyph, never a word, so the panel reads at
// a glance in any language. These are the same shapes in plain SVG.
const Line = ({ w, dash }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeDasharray={dash || undefined} />
  </svg>
)
const Corner = ({ round }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d={round ? 'M3 15V8a5 5 0 0 1 5-5h7' : 'M3 15V3h12'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
const Align = ({ to }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => {
      const w = i % 2 ? 8 : 14
      const x = to === 'left' ? 2 : to === 'right' ? 16 - w : 9 - w / 2
      return <rect key={i} x={x} y={3 + i * 3.4} width={w} height="1.6" rx="0.8" fill="currentColor" />
    })}
  </svg>
)
const FONT_GLYPH = { sans: 'A', serif: 'A', mono: '</>' }

export function FormatPanel({ value, onChange, onReset }) {
  const v = value || {}
  const set = (k) => (x) => onChange({ ...v, [k]: x })
  const Tile = ({ k, pick, children, title }) => (
    <button type="button" title={title} onClick={() => set(k)(pick)} style={btn(v[k] === pick)}>{children}</button>
  )

  return (
    <div className="sd-format-panel" style={{
      width: 240, flexShrink: 0, background: '#f1f5f9', borderLeft: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column', padding: '20px 16px', overflowY: 'auto',
      animation: 'sd-slide-right 0.2s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Card</div>
        <button type="button" onClick={onReset} title="Back to the default look"
          style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: 11, cursor: 'pointer', padding: 0 }}>Reset</button>
      </div>

      <Section label="Stroke">
        {STROKE_PICKS.map((c) => <Swatch key={c} color={c} on={v.stroke === c} onPick={set('stroke')} />)}
      </Section>

      <Section label="Background">
        {BG_PICKS.map((c) => <Swatch key={c} color={c} on={v.bg === c} onPick={set('bg')} />)}
      </Section>

      <Section label="Stroke width">
        {BORDER_WIDTHS.map((w) => <Tile key={w} k="bw" pick={w} title={`${w}px`}><Line w={w} /></Tile>)}
      </Section>

      <Section label="Stroke style">
        {BORDER_STYLES.map((s) => (
          <Tile key={s} k="bs" pick={s} title={s}>
            <Line w={2} dash={s === 'dashed' ? '5 3' : s === 'dotted' ? '0.5 3' : null} />
          </Tile>
        ))}
      </Section>

      <Section label="Edges">
        {RADII.map((r) => <Tile key={r} k="radius" pick={r} title={r ? 'Round' : 'Sharp'}><Corner round={!!r} /></Tile>)}
      </Section>

      <Section label="Font family">
        {FONTS.map((f) => (
          <Tile key={f} k="font" pick={f} title={f}>
            <span style={{ fontSize: f === 'mono' ? 10 : 15, fontFamily: f === 'serif' ? 'Georgia, serif' : f === 'mono' ? 'ui-monospace, monospace' : 'inherit' }}>{FONT_GLYPH[f]}</span>
          </Tile>
        ))}
      </Section>

      <Section label="Font size">
        {FONT_SIZES.map((s, i) => (
          <Tile key={s} k="fs" pick={s} title={`${s}px`}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{['S', 'M', 'L', 'XL'][i]}</span>
          </Tile>
        ))}
      </Section>

      <Section label="Text align">
        {ALIGNS.map((a) => <Tile key={a} k="align" pick={a} title={a}><Align to={a} /></Tile>)}
      </Section>

      <Section label="Opacity">
        <input type="range" min={0} max={100} step={10} value={v.opacity ?? 100}
          onChange={(e) => set('opacity')(Number(e.target.value))}
          style={{ width: '100%', accentColor: ACTIVE, cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 10, color: '#6b7280' }}>
          <span>0</span><span>100</span>
        </div>
      </Section>
    </div>
  )
}
