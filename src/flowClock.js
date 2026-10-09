// One clock for every edge dot on the canvas.
//
// Each edge draws a small circle travelling from its source to its target. The
// obvious implementation is SMIL (<animateMotion>) or a CSS offset-path, and
// both look right on screen - but html-to-image serialises the DOM's committed
// attributes, and a declaratively animated element serialises at its t=0 pose.
// Every frame of a GIF export would come out identical. So the position is held
// in JS state and written to cx/cy, which snapshots correctly.
//
// A rAF loop per edge would mean 20+ loops on a busy diagram, all waking the
// compositor independently. Instead there is one loop here that every edge
// subscribes to, and it only runs while something is listening.
import { CURRENT_DEFAULT, SPEEDS } from './view-state.js'


// One step of the current: how long 1 dot takes to cross 1 line. A diagram is
// 1 cycle of `steps` of these, so a 6 line flow loops in 8.4 s and a 90 line
// map takes its time - the whole point is to watch 1 step at a time.
// Exported because lib/render-gif.js builds the GIF's frame delay from it: the
// export has to walk a line in exactly the time the canvas does.
export const STEP_MS = 1400

// The small ambient current, documented at ambientAt below: the diagram's
// default TOTAL number of small dots, and how many steps one takes to cross a
// line. Declared up here because the module state further down starts from it.
// The default is the one src/view-state.js validates against, so the canvas,
// the row and both exports cannot drift to different numbers.
export const AMBIENT_AMOUNT = CURRENT_DEFAULT.amount
export const AMBIENT_STEPS = 4

// A line marked `async: true` fires on the same BEAT as the line numbered
// before it (owner rule 2026-10-08: "if 12 does not rely on 11 or 13, shoot
// those 3 out of the card at the same time"). The cycle is 1 slot per beat,
// not per line, so a 15 line flow with 2 async lines walks 13 beats. The flag
// is read off the stored edge or off the canvas edge's data, whichever it is.
const isAsync = e => !!e && (e.async === true || e.data?.async === true)

/** The beat (0-based) each line fires on, in line order. The first line always opens beat 0. */
export function beatsOf(edges) {
  const out = []
  let b = -1
  for (const [i, e] of (edges || []).entries()) { if (i === 0 || !isAsync(e)) b++; out.push(b) }
  return out
}

/** How many beats the current walks before it starts over. */
export function beatCount(edges) {
  const b = beatsOf(edges)
  return b.length ? b[b.length - 1] + 1 : 0
}

const subs = new Set()
let raf = 0
let phase = 0 // 0..1 across the WHOLE cycle, shared by every edge
let steps = 1 // how many lines the current walks before it starts over
// The owner's speed multiplier (1x..5x) and how many small dots the whole
// diagram carries, both off view_state.current - see src/view-state.js. Module
// state for the same reason `steps` is: every edge reads them from here, so a
// change lands on the next frame without re-rendering the canvas.
let speed = 1
let amount = AMBIENT_AMOUNT
let periodMs = STEP_MS

/**
 * How many lines the current has to walk, so the cycle is always 1 slot per
 * line. The canvas calls this when a diagram loads or a line is added.
 */
export function setSteps(n) {
  steps = Math.max(1, n | 0)
  periodMs = steps * STEP_MS / speed
}

/**
 * The owner's current settings, from the Start pill's panel: `speed` is the
 * multiplier on the whole clock (the big step dot and the ambient drift alike,
 * so 2x is the same walk twice over and 0.5x is it at half pace), `amount` the
 * TOTAL number of small dots spread across the diagram. Both are validated
 * presets (src/view-state.js), and anything else is clamped to their range.
 */
export function setCurrent(c) {
  const a = Number(c?.amount)
  speed = Math.min(Math.max(...SPEEDS), Math.max(Math.min(...SPEEDS), Number(c?.speed) || 1))
  amount = Number.isFinite(a) ? Math.max(0, a) : AMBIENT_AMOUNT
  periodMs = steps * STEP_MS / speed
}

/** The ambient total in force, for anything drawing dots without its own copy. */
export function currentAmount() { return amount }

// While a GIF is being captured the clock is driven by hand instead of by the
// wall clock. Frame capture takes a variable 100-300ms, so letting real time
// advance the phase would give unevenly spaced frames and a loop that visibly
// jumps where it wraps. Pinning it means N frames at exactly i/N of one period,
// which loops seamlessly no matter how slow the capture was.
let pinned = null

function emit(p) { for (const fn of subs) fn(p) }

function tick(now) {
  // Paused: hold the dots where they are and stop asking for frames. A capture
  // pins the phase itself, so it keeps working with the canvas stopped - the
  // GIF export does not need the button pressed.
  if (pinned == null && playing) {
    phase = (now % periodMs) / periodMs
    emit(phase)
  }
  raf = subs.size && playing ? requestAnimationFrame(tick) : 0
}

// Play state. The canvas is STILL by default: a diagram is usually being read,
// not watched, and a dozen dots crawling under the text is a distraction the
// reader never asked for. Pressing Play releases them.
let playing = false
const playSubs = new Set()

/** Whether the dots are currently running. */
export function isPlaying() { return playing }

/** Start or stop the dots. Notifies anything showing the control. */
export function setPlaying(next) {
  if (playing === next) return
  playing = next
  for (const fn of playSubs) fn(playing)
  emitFlowing()
  // Cancel on pause rather than waiting for the next tick to notice. Leaving a
  // stale frame id behind makes the following play a no-op, because the restart
  // below is guarded on there being no loop already.
  if (!playing) {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
  } else if (subs.size && !raf) {
    raf = requestAnimationFrame(tick)
  }
}

/** Subscribe to play/pause, for the button itself. */
export function subscribePlaying(fn) {
  playSubs.add(fn)
  return () => playSubs.delete(fn)
}

// "Flowing" is what the canvas draws, as opposed to what the button says.
// Paused, an edge is a plain solid line with no dot: the diagram is being read.
// Playing, the line dashes along and the dot travels. A GIF capture steps the
// dots by hand while the button still says Play, so the canvas has to show the
// flowing look for the frames even though nothing is "playing".
const flowSubs = new Set()
function emitFlowing() { for (const fn of flowSubs) fn(isFlowing()) }

/** Whether the canvas should draw dashes and dots right now. */
export function isFlowing() { return playing || pinned != null }

/** Subscribe to the flowing look, for the canvas. */
export function subscribeFlowing(fn) {
  flowSubs.add(fn)
  return () => flowSubs.delete(fn)
}

/** Take the dots off the wall clock so an export can step them frame by frame. */
export function beginCapture() { pinned = 0; emitFlowing() }

/** Put every dot at phase `p` (0..1) and paint it. */
export function stepCapture(p) { pinned = p; phase = p; emit(p) }

/** Hand the dots back to the wall clock. */
export function endCapture() { pinned = null; emitFlowing() }

/** One whole walk of the diagram, for the GIF's frame delay. */
export function capturePeriodMs() { return periodMs }

/** Subscribe to the shared phase. Returns an unsubscribe. */
export function subscribe(fn) {
  subs.add(fn)
  if (!raf && playing) raf = requestAnimationFrame(tick)
  return () => {
    subs.delete(fn)
    if (!subs.size && raf) { cancelAnimationFrame(raf); raf = 0 }
  }
}

/** The current phase, for a first paint before the first frame lands. */
export function currentPhase() { return phase }

/** Honour the OS setting - a travelling dot is exactly the kind of motion it means. */
export function motionAllowed() {
  return !(typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * ONE current at a time. Every dot used to set off and land on the same beat,
 * and the owner could not tell which step a diagram was on - 20 lines firing
 * together says nothing. The cycle is now cut into 1 slot per line, walked in
 * the order the lines are numbered, which is the order the Steps badges print.
 * At any instant exactly 1 line carries a dot and exactly 1 card is lit.
 *
 * A pure function of the phase, so a GIF frame and the canvas agree by
 * construction (see the header, and lib/render-svg.js).
 */
export function stepAt(phase, count) {
  const n = Math.max(1, count | 0)
  const p = ((phase % 1) + 1) % 1
  const index = Math.min(n - 1, Math.floor(p * n))
  return { index, local: p * n - index, count: n }
}

/**
 * The small ambient current under the big step dot: the diagram carries a
 * TOTAL of `amount` small dots, spread evenly over its lines, so the diagram
 * reads as many things happening at once while the 1 big dot still says which
 * step this is (owner 2026-10-09: "keep the big one, add smaller ones,
 * multiple dots like before"). They drift: a small dot takes about
 * AMBIENT_STEPS steps to cross a line, where the big one takes 1 (owner, same
 * day: "the speed of the other current needs to be way slower"). A cycle still
 * holds a whole number of crossings, so a GIF loops without a jump. Returns
 * the positions (0..1) along line `index`.
 *
 * A TOTAL, not a count per line. 1 apiece put 41 dots on BC Integrations and
 * the owner called it "a bit too much" the same day; a total reads the same on
 * a 6 line flow as on a 50 line map, and the Start pill's panel sets it
 * (5/10/20/50/100, default 10).
 */
/**
 * How many of the diagram's `amount` dots line `index` of `lines` carries.
 * Evenly spread and deterministic - the floors always sum to exactly `amount`,
 * so the canvas and a GIF frame draw the same dots on the same lines.
 */
export function ambientCount(index, lines, total = amount) {
  const n = Math.max(1, lines | 0)
  const a = Math.max(0, total | 0)
  if (index < 0 || index >= n) return 0
  return Math.floor(((index + 1) * a) / n) - Math.floor((index * a) / n)
}

export function ambientAt(phase, edges, index, total = amount) {
  const list = typeof edges === 'number' ? Array.from({ length: edges }, () => ({})) : (edges || [])
  const dots = ambientCount(index, list.length, total)
  if (!dots) return []
  const n = Math.max(1, Math.round(beatCount(list) / AMBIENT_STEPS))
  const p = ((phase % 1) + 1) % 1
  const base = (p * n + index * 0.37) % 1
  return Array.from({ length: dots }, (_, k) => (base + k / dots) % 1)
}

/**
 * Where line `index` draws its dot, or null while the current is elsewhere.
 * `edges` is the ordered list (a bare count still works for a diagram with no
 * async lines): every line on the live beat carries a dot at the same spot.
 */
export function dotAt(phase, edges, index) {
  const list = typeof edges === 'number' ? Array.from({ length: edges }, () => ({})) : (edges || [])
  const s = stepAt(phase, beatCount(list))
  return beatsOf(list)[index] === s.index ? s.local : null
}

// Smooth at both ends, so a card neither snaps on nor cuts off.
const ease = t => t * t * (3 - 2 * t)

// How much of the next step the card behind the dot takes to go dark. Short on
// purpose: the owner wants the light ON the step being crossed, so the hand off
// has to read as the current moving rather than as 2 cards lit at once.
const FADE = 0.4

/**
 * How brightly 1 card lights: up as the live step crosses towards it, full as
 * the dot lands, then back down while the next step runs. Every other card on
 * the canvas is 0 - the glow is there to say "the current is HERE".
 */
export function glowAt(phase, edges, nodeId) {
  const list = edges || []
  const beats = beatsOf(list)
  const s = stepAt(phase, beatCount(list))
  // Every line on a beat lands together, so each of their targets lights.
  const landsOn = b => list.some((e, i) => beats[i] === b && e.target === nodeId)
  if (landsOn(s.index)) return ease(s.local)
  const prev = (s.index - 1 + s.count) % s.count
  if (prev !== s.index && landsOn(prev)) return 1 - ease(Math.min(1, s.local / FADE))
  return 0
}
