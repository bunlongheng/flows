import { PANEL, PANEL_CAPTION, PANEL_CLOSE } from '../panel.js'
import { SPEEDS, AMOUNTS, CURRENT_DEFAULT, FONT_DEFAULT, FONT_MIN, FONT_MAX } from '../view-state.js'
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

// A slider over a fixed list of steps: the value shows on the right, nothing else.
function StepSlider({ caption: title, values, value, format, onPick }) {
  const at = Math.max(0, values.indexOf(value))
  return (
    <section style={block}>
      <div style={{ ...caption, display: 'flex', justifyContent: 'space-between' }}><span>{title}</span><span>{format(values[at])}</span></div>
      <input type="range" min={0} max={values.length - 1} step={1} value={at} aria-label={title}
        onChange={e => onPick(values[Number(e.target.value)])}
        style={{ width: '100%', accentColor: '#6965db', cursor: 'pointer' }} />
    </section>
  )
}

// 2 sliders: 1 sizes the card title and subtitle together at the default
// ratio, the other sizes the line badges on their own (view_state.fonts).
const half = n => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n * 2) / 2))
const scaled = v => ({ title: half(v), sub: half(v * FONT_DEFAULT.sub / FONT_DEFAULT.title) })

export function CurrentPanel({ value, onChange, onClose, pattern, description, sizing, onSizing, fonts, onFonts }) {
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

      <StepSlider caption="Speed" values={SPEEDS} value={speed} format={v => `${v}x`} onPick={v => onChange({ speed: v })} />
      <StepSlider caption="Amount" values={AMOUNTS} value={amount} format={v => v} onPick={v => onChange({ amount: v })} />

      {onSizing && (
        <Row
          caption="Card size"
          values={SIZINGS}
          value={sizing}
          format={v => v[0].toUpperCase() + v.slice(1)}
          onPick={onSizing}
        />
      )}

      {onFonts && fonts && (
        <section style={block}>
          <div style={{ ...caption, display: 'flex', justifyContent: 'space-between' }}><span>Text size</span><span>{fonts.title} px</span></div>
          <input type="range" min={FONT_MIN} max={FONT_MAX} step={0.5} value={fonts.title}
            aria-label="Text size" onChange={e => onFonts({ ...fonts, ...scaled(Number(e.target.value)) })}
            style={{ width: '100%', accentColor: '#6965db', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280' }}>
            <span>{FONT_MIN}</span><span>{FONT_MAX}</span>
          </div>
          <div style={{ ...caption, display: 'flex', justifyContent: 'space-between', marginTop: 12 }}><span>Badge size</span><span>{fonts.tag} px</span></div>
          <input type="range" min={FONT_MIN} max={FONT_MAX} step={0.5} value={fonts.tag}
            aria-label="Badge size" onChange={e => onFonts({ ...fonts, tag: half(Number(e.target.value)) })}
            style={{ width: '100%', accentColor: '#6965db', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280' }}>
            <span>{FONT_MIN}</span><span>{FONT_MAX}</span>
          </div>
        </section>
      )}

    </aside>
  )
}
