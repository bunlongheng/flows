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

// One step of the current: how long 1 dot takes to cross 1 line. A diagram is
// 1 cycle of `steps` of these, so a 6 line flow loops in 8.4 s and a 90 line
// map takes its time - the whole point is to watch 1 step at a time.
// Exported because lib/render-gif.js builds the GIF's frame delay from it: the
// export has to walk a line in exactly the time the canvas does.
export const STEP_MS = 1400

const subs = new Set()
let raf = 0
let phase = 0 // 0..1 across the WHOLE cycle, shared by every edge
let steps = 1 // how many lines the current walks before it starts over
let periodMs = STEP_MS

/**
 * How many lines the current has to walk, so the cycle is always 1 slot per
 * line. The canvas calls this when a diagram loads or a line is added.
 */
export function setSteps(n) {
  steps = Math.max(1, n | 0)
  periodMs = steps * STEP_MS
}

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

/** Where line `index` draws its dot, or null while the current is elsewhere. */
export function dotAt(phase, count, index) {
  const s = stepAt(phase, count)
  return s.index === index ? s.local : null
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
  const s = stepAt(phase, list.length)
  const live = list[s.index]
  if (live && live.target === nodeId) return ease(s.local)
  const prev = list[(s.index - 1 + s.count) % s.count]
  if (prev && prev !== live && prev.target === nodeId) return 1 - ease(Math.min(1, s.local / FADE))
  return 0
}
