// The sunset look: a node marked `sunset: true` is today's path and gets
// decommissioned, so it is drawn light silver and dimmed, its icon in
// greyscale. The red X marks its badges only, never the card. Silver is reserved for this
// state - nothing else in the app is painted silver, and a node with no colour
// of its own falls back to ink instead. Shared by the canvas and the exports.
export const SUNSET = {
  border: '#b9bfc7',   // silver line: the card border
  line: '#adb5be',     // every edge touching the card, in or out: light silver at 0.75 opacity, immune to any picked line style
  tint: '#f2f3f5',     // light silver card fill
  ink: '#9ca3af',      // greyed label, sub and badge text
  x: '#dc2626',        // the red X
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
