import { PANEL, PANEL_CAPTION, PANEL_CLOSE } from '../panel.js'
import { SPEEDS, AMOUNTS, CURRENT_DEFAULT } from '../view-state.js'
import { STEP_MS } from '../flowClock'

// The current's own panel, opened by clicking the Start here pill (owner
// 2026-10-09: "if I click on start here, show right panel for me to control
// speed of current 1 2 3 4 5 x, control amount 5 10 20 50 100"). Two rows of
// presets and nothing else: the current is something you watch, so the control
// is a dial, not a form.
//
// Both values are saved in view_state.current, so the SVG and GIF exports play
// the current the owner left running (src/view-state.js, lib/render-gif.js).

const caption = { ...PANEL_CAPTION, marginBottom: 8 }
const block = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }
const hint = { fontSize: 11, color: '#6b7280', lineHeight: 1.45, marginTop: 8 }

const chip = (on) => ({
  flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? '#1a2129' : '#e2e8f0'}`,
  background: on ? '#1a2129' : '#f8fafc', color: on ? '#fff' : '#334155',
  fontSize: 12, fontWeight: on ? 700 : 500,
})

function Row({ caption: title, values, value, format, onPick, hint: text }) {
  return (
    <section style={block}>
      <div style={caption}>{title}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {values.map(v => (
          <button key={v} type="button" onClick={() => onPick(v)} style={chip(v === value)}>{format(v)}</button>
        ))}
      </div>
      <div style={hint}>{text}</div>
    </section>
  )
}

export function CurrentPanel({ value, onChange, onClose }) {
  const speed = value?.speed ?? CURRENT_DEFAULT.speed
  const amount = value?.amount ?? CURRENT_DEFAULT.amount
  // What 1x actually means on the clock, so the number is a time and not a feel.
  const perLine = (STEP_MS / speed / 1000).toFixed(speed === 1 ? 1 : 2)

  return (
    <aside className="sd-current-panel" data-testid="current-panel" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={PANEL_CAPTION}>Current</div>
        <button type="button" onClick={onClose} aria-label="Close current panel" style={PANEL_CLOSE}>✕</button>
      </div>

      <Row
        caption="Speed"
        values={SPEEDS}
        value={speed}
        format={v => `${v}x`}
        onPick={v => onChange({ speed: v })}
        hint={`The big dot crosses 1 line in ${perLine}s${speed === 1 ? '' : `, ${speed}x the reading pace`}. The small dots drift at a quarter of that.`}
      />

      <Row
        caption="Amount"
        values={AMOUNTS}
        value={amount}
        format={v => v}
        onPick={v => onChange({ amount: v })}
        hint={`${amount} small dots spread over the whole diagram, however many lines it has. The 1 big dot always says which step is live.`}
      />

      <div style={{ ...hint, marginTop: 0 }}>Press Play to watch it. Both settings are saved with the diagram, so a picture or GIF export runs the same current.</div>
    </aside>
  )
}
