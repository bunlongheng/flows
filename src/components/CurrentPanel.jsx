import { PANEL, PANEL_CAPTION, PANEL_CLOSE } from '../panel.js'
import { SPEEDS, AMOUNTS, CURRENT_DEFAULT } from '../view-state.js'
import { STEP_MS } from '../flowClock'

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
      <div style={hint}>{text}</div>
    </section>
  )
}

export function CurrentPanel({ value, onChange, onClose, pattern, description }) {
  const speed = value?.speed ?? CURRENT_DEFAULT.speed
  const amount = value?.amount ?? CURRENT_DEFAULT.amount
  // What the multiplier actually means on the clock, so the number is a time
  // and not a feel. Trailing zeros trimmed: 2.8s, 1.4s, 0.93s, 0.7s.
  const perLine = (STEP_MS / speed / 1000).toFixed(2).replace(/0$/, '').replace(/\.$/, '')

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

      <Row
        caption="Speed"
        values={SPEEDS}
        value={speed}
        format={v => `${v}x`}
        onPick={v => onChange({ speed: v })}
        hint={`The big dot crosses 1 line in ${perLine}s, and the small dots drift at a quarter of that. 2x is as fast as it reads; 0.5x is for watching a dense map.`}
      />

      <Row
        caption="Amount"
        values={AMOUNTS}
        value={amount}
        format={v => v}
        onPick={v => onChange({ amount: v })}
        hint={`${amount} small dots spread over the whole diagram, however many lines it has. The 1 big dot always says which step is live.`}
      />

      <div style={{ ...hint, marginTop: 0 }}>Press Play to watch it. Both settings belong to THIS diagram and are saved with it, so a picture or GIF export runs the same current.</div>
    </aside>
  )
}
