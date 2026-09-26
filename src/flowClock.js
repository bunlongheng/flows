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

const PERIOD_MS = 2600 // one full source -> target trip

const subs = new Set()
let raf = 0
let phase = 0 // 0..1, shared by every edge

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
    phase = (now % PERIOD_MS) / PERIOD_MS
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

export const CAPTURE_PERIOD_MS = PERIOD_MS

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
 * Stagger each edge so a diagram does not pulse in lockstep, which reads as a
 * throb rather than as flow. Derived from the edge id so it is stable across
 * re-renders and identical between a live canvas and an exported frame.
 */
export function offsetFor(id) {
  let h = 0
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0
  return (h % 1000) / 1000
}
