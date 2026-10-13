// The sunset look: a node marked `sunset: true` is today's path and gets
// decommissioned. Red means on its way out (owner rule 2026-10-13): a light red
// card in a red border, cracked open, its icon half greyscale, and every line
// touching it a red dash. The red X marks its badges. Shared by the canvas and
// the exports.
export const SUNSET = {
  border: '#f87171',   // the card border and the crack
  line: '#dc2626',     // every edge touching the card, in or out: a red dash, immune to any picked line style
  tint: '#fef2f2',     // light red card fill
  ink: '#6b7280',      // label, sub and badge text
  x: '#dc2626',        // the red X
}

// The new look: a node marked `new: true` is being added. Green means new: a
// green border and wash, and a NEW pill inside the top-left corner.
// A pinned tooltip: a red callout above its card for an important date (legend: Important date).
export const CALLOUT = { fill: '#dc2626', ink: '#ffffff', fs: 13, wrap: 22 }
// node.tooltipColor: the callout and tooltip fill, a 6-digit hex; '' when junk.
export const cleanTipColor = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : '')
// White text on a dark fill, ink on a light one, so any picked colour stays readable.
export const tipInk = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1c1e21' : '#ffffff'
}

export const NEW = {
  border: '#16a34a',
  tint: '#f0fdf4',
}

// The egg crack across a sunset card, in a 0..100 box (canvas +
// exports draw the same). The whole card splits along `main` and each half tips
// `angle` degrees outward on a hinge at the bottom of the crack, so it gapes
// open about 5 degrees; each half keeps its own hairline branches and chipped shards.
export const CRACK = {
  main: 'M50 -2 L46 10 L54 19 L44 31 L56 42 L47 53 L58 64 L49 76 L55 88 L50 102',
  angle: 2.5,
  left: {
    branches: ['M44 31 L35 36 L28 34'],
    shards: [],
  },
  right: {
    branches: ['M56 42 L65 46 L71 44'],
    shards: ['M54 19 L59 15 L62 21 L57 24 Z'],
  },
}

// Each half of the split card as polygon points in the 0..100 box: the crack
// line closed off past the left or the right edge.
const crackPts = CRACK.main.slice(1).split(' L').map(p => p.split(' ').map(Number))
export const CRACK_HALVES = {
  left: [[-20, -2], ...crackPts, [-20, 102]],
  right: [[120, -2], ...crackPts, [120, 102]],
}

// Ink: what a node with no colour of its own is painted, and the border colour
// of a node that stays. Never grey, so it cannot be mistaken for sunset.
export const INK = '#111827'
