import { STROKE_PICKS, BG_PICKS, BORDER_WIDTHS, BORDER_STYLES, RADII, FONTS, FONT_SIZES, ALIGNS, ARROWS, STYLE_DEFAULTS } from '../style.js'
import { PANEL, PANEL_CAPTION } from '../panel.js'

// The properties panel, modelled on Excalidraw's. Its metrics are Excalidraw's
// too - 36px square buttons, 8px radius, #e0dfff behind the active one, #6965db
// for its glyph - because the whole point of the request was "exactly like
// Excalidraw", and a panel that is nearly the same reads as a bad copy.
//
// It is presentational: it holds no state, renders the style it is handed, and
// reports a patch. Whoever mounts it owns persistence and undo.
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

// Tile lives at module scope on purpose. Declared inside FormatPanel it was a
// new component type on every render, so React unmounted and remounted every
// tile each frame while the canvas animated: mousedown landed on one button,
// mouseup on its replacement, and the browser never fired click. The swatches
// never had this problem, which is why colours worked and nothing below did.
function Tile({ on, onPick, title, children }) {
  return (
    <button type="button" title={title} onClick={onPick} style={btn(on)}>{children}</button>
  )
}

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

// Straight, curved, squared-off - each drawn as the line it actually makes,
// with the same arrowhead, so the row reads without a word on it.
const ARROW_PATH = { straight: 'M3 15L13 5', curved: 'M3 15C3 8 8 5 13 5', step: 'M3 15h5V5h5' }
const Arrow = ({ kind }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d={ARROW_PATH[kind]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d={kind === 'straight' ? 'M9 5h4v4' : 'M10 2l3 3-3 3'} stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" fill="none"
      transform={kind === 'straight' ? 'rotate(-45 13 5)' : undefined} />
  </svg>
)

// Excalidraw shows the element's CURRENT colour beside its 2 colour rows,
// because a card's brand colour is never one of the 5 swatches and a row with
// nothing lit reads as a control that does not work. It sits on the label line
// rather than after the swatches: a 6th box on that row wraps at 240px wide and
// then reads as another option.
function Current({ background }) {
  return (
    <span title="Current" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6b7280' }}>
      now
      <span style={{ width: 18, height: 18, borderRadius: 5, background, border: '1px solid rgba(0,0,0,0.12)' }} />
    </span>
  )
}

export function FormatPanel({ value, onChange, onReset, target = 'node', stroke, fill }) {
  // A line has no inside, no corners and no text of its own, so it is offered
  // the four controls that mean something on a stroke and nothing it cannot use.
  const isNode = target === 'node'
  const v = value || {}
  // An unset key is not "nothing", it is the default the renderer already draws,
  // so that is what the row lights.
  const cur = (k) => (v[k] === undefined ? STYLE_DEFAULTS[k] : v[k])
  const set = (k) => (x) => onChange({ ...v, [k]: x })
  // Props for the one tile of row k that picks value `pick`.
  const tile = (k, pick) => ({ on: cur(k) === pick, onPick: () => set(k)(pick) })

  return (
    <div className="sd-format-panel" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={PANEL_CAPTION}>{isNode ? 'Card' : 'Line'}</div>
        <button type="button" onClick={onReset} title="Back to the default look"
          style={{ border: 'none', background: 'none', color: '#6b7280', fontSize: 11, cursor: 'pointer', padding: 0 }}>Reset</button>
      </div>

      <Section label="Stroke" right={(v.stroke || stroke) && <Current background={v.stroke || stroke} />}>
        {STROKE_PICKS.map((c) => <Swatch key={c} color={c} on={v.stroke === c} onPick={set('stroke')} />)}
      </Section>

      {isNode && (
        <Section label="Background" right={(v.bg || fill) && <Current background={v.bg === 'transparent' ? CHECKER : v.bg || fill} />}>
          {BG_PICKS.map((c) => <Swatch key={c} color={c} on={v.bg === c} onPick={set('bg')} />)}
        </Section>
      )}

      {!isNode && (
        <Section label="Arrow type">
          {ARROWS.map((a) => <Tile key={a} {...tile('arrow', a)} title={a}><Arrow kind={a} /></Tile>)}
        </Section>
      )}

      <Section label="Stroke width">
        {BORDER_WIDTHS.map((w) => <Tile key={w} {...tile('bw', w)} title={`${w}px`}><Line w={w} /></Tile>)}
      </Section>

      <Section label="Stroke style">
        {BORDER_STYLES.map((s) => (
          <Tile key={s} {...tile('bs', s)} title={s}>
            <Line w={2} dash={s === 'dashed' ? '5 3' : s === 'dotted' ? '0.5 3' : null} />
          </Tile>
        ))}
      </Section>

      {isNode && <>
        <Section label="Edges">
          {RADII.map((r) => <Tile key={r} {...tile('radius', r)} title={r ? 'Round' : 'Sharp'}><Corner round={!!r} /></Tile>)}
        </Section>

        <Section label="Font family">
          {FONTS.map((f) => (
            <Tile key={f} {...tile('font', f)} title={f}>
              <span style={{ fontSize: f === 'mono' ? 10 : 15, fontFamily: f === 'serif' ? 'Georgia, serif' : f === 'mono' ? 'ui-monospace, monospace' : 'inherit' }}>{FONT_GLYPH[f]}</span>
            </Tile>
          ))}
        </Section>

        <Section label="Font size">
          {FONT_SIZES.map((s, i) => (
            <Tile key={s} {...tile('fs', s)} title={`${s}px`}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{['S', 'M', 'L', 'XL'][i]}</span>
            </Tile>
          ))}
        </Section>

        <Section label="Text align">
          {ALIGNS.map((a) => <Tile key={a} {...tile('align', a)} title={a}><Align to={a} /></Tile>)}
        </Section>
      </>}

      <Section label="Opacity">
        <input type="range" min={0} max={100} step={10} value={cur('opacity')}
          onChange={(e) => set('opacity')(Number(e.target.value))}
          style={{ width: '100%', accentColor: ACTIVE, cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 10, color: '#6b7280' }}>
          <span>0</span><span>100</span>
        </div>
      </Section>
    </div>
  )
}
