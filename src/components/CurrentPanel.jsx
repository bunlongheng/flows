import { PANEL, PANEL_CAPTION, PANEL_CLOSE } from '../panel.js'
import { SPEEDS, AMOUNTS, CURRENT_DEFAULT, FONT_DEFAULT, FONT_MIN, FONT_MAX, LAYOUT_RANGE } from '../view-state.js'
import { SIZINGS } from '../card-size.js'

// The current's own panel, opened by clicking the Start here pill (owner
// 2026-10-09: "if I click on start here, show right panel for me to control
// speed of current, control amount, control currents you know"). Two rows of
// presets: the current is something you watch, so the control is a dial, not a
// form.
//
// A diagram with swimlanes draws no Start pill, so the owner also opens this
// from the "i" badge top-left (owner, same day: "some graphs has no start, pls
// make sure show when click on i"). That badge used to unfold the summary card,
// so the summary comes along at the top of the panel - the owner loses nothing
// by the badge now opening this instead.
//
// Both values are saved in view_state.current, which is 1 column on 1 row, so
// the setting is PER DIAGRAM (owner, same day: "some flows I want to show off
// more current, some I wanna show less"). The SVG and GIF exports read the
// same row, so a picture plays the current that diagram was left running at
// (src/view-state.js, lib/render-gif.js).

const caption = { ...PANEL_CAPTION, marginBottom: 8 }
const block = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }
const hint = { fontSize: 11, color: '#6b7280', lineHeight: 1.45, marginTop: 8 }

const chip = (on) => ({
  padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? '#1a2129' : '#e2e8f0'}`,
  background: on ? '#1a2129' : '#f8fafc', color: on ? '#fff' : '#334155',
  fontSize: 12, fontWeight: on ? 700 : 500,
})

function Row({ caption: title, values, value, format, onPick, hint: text }) {
  return (
    <section style={block}>
      <div style={caption}>{title}</div>
      {/* A fixed 4 column grid, not a flex row: 8 amounts do not fit on 1 line
          of a 280 px panel, and wrapping them into equal cells keeps the chips
          the same size whichever row they land on. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {values.map(v => (
          <button key={v} type="button" onClick={() => onPick(v)} style={chip(v === value)}>{format(v)}</button>
        ))}
      </div>
      {text && <div style={hint}>{text}</div>}
    </section>
  )
}

// 1 compact row, like the Sequences layout panel: label, a thin slider, the value.
const rowStyle = { display: 'grid', gridTemplateColumns: '64px 1fr 44px', alignItems: 'center', gap: 10, height: 26 }
function SlimRow({ label, min, max, step, value, show, onPick }) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 12.5, color: '#1a2129' }}>{label}</span>
      <input type="range" className="sd-slim-range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={e => onPick(Number(e.target.value))} />
      <span style={{ fontSize: 12, color: '#8a94a6', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{show}</span>
    </div>
  )
}
// A row over a fixed list of steps (Speed, Amount): the slider moves by index.
const StepRow = ({ label, values, value, format, onPick }) => {
  const at = Math.max(0, values.indexOf(value))
  return <SlimRow label={label} min={0} max={values.length - 1} step={1} value={at} show={format(values[at])} onPick={k => onPick(values[k])} />
}

// 2 sliders: 1 sizes the card title and subtitle together at the default
// ratio, the other sizes the line badges on their own (view_state.fonts).
const half = n => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n * 2) / 2))
const scaled = v => ({ title: half(v), sub: half(v * FONT_DEFAULT.sub / FONT_DEFAULT.title) })

export function CurrentPanel({ value, onChange, onClose, pattern, description, sizing, onSizing, fonts, onFonts, layout, onLayout }) {
  const speed = value?.speed ?? CURRENT_DEFAULT.speed
  const amount = value?.amount ?? CURRENT_DEFAULT.amount

  return (
    <aside className="sd-current-panel" data-testid="current-panel" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={PANEL_CAPTION}>Current</div>
        <button type="button" onClick={onClose} aria-label="Close current panel" style={PANEL_CLOSE}>✕</button>
      </div>

      {(pattern || description) && (
        <section style={block}>
          {pattern && (
            <>
              <div style={caption}>What it tests</div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: '#1a2129' }}>{pattern}</div>
            </>
          )}
          {description && (
            <div style={{ ...hint, marginTop: pattern ? 8 : 0 }}>{description}</div>
          )}
        </section>
      )}

      <section style={block}>
        <div style={caption}>Layout</div>
        <StepRow label="Speed" values={SPEEDS} value={speed} format={v => `${v}x`} onPick={v => onChange({ speed: v })} />
        <StepRow label="Amount" values={AMOUNTS} value={amount} format={v => v} onPick={v => onChange({ amount: v })} />
        {onFonts && fonts && <>
          <SlimRow label="Text" min={FONT_MIN} max={FONT_MAX} step={0.5} value={fonts.title} show={`${fonts.title}px`} onPick={v => onFonts({ ...fonts, ...scaled(v) })} />
          <SlimRow label="Badge" min={FONT_MIN} max={FONT_MAX} step={0.5} value={fonts.tag} show={`${fonts.tag}px`} onPick={v => onFonts({ ...fonts, tag: half(v) })} />
        </>}
        {onLayout && layout && <>
          <SlimRow label="Box" min={LAYOUT_RANGE.box[0]} max={LAYOUT_RANGE.box[1]} step={0.05} value={layout.box} show={`${Math.round(layout.box * 100)}%`} onPick={v => onLayout({ ...layout, box: v })} />
          <SlimRow label="Gap" min={LAYOUT_RANGE.gap[0]} max={LAYOUT_RANGE.gap[1]} step={0.05} value={layout.gap} show={`${Math.round(layout.gap * 100)}%`} onPick={v => onLayout({ ...layout, gap: v })} />
          <SlimRow label="V.Gap" min={LAYOUT_RANGE.vgap[0]} max={LAYOUT_RANGE.vgap[1]} step={0.05} value={layout.vgap} show={`${Math.round(layout.vgap * 100)}%`} onPick={v => onLayout({ ...layout, vgap: v })} />
        </>}
      </section>

      {onSizing && (
        <Row
          caption="Card size"
          values={SIZINGS}
          value={sizing}
          format={v => v[0].toUpperCase() + v.slice(1)}
          onPick={onSizing}
        />
      )}


    </aside>
  )
}
