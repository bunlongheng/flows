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

// The egg crack across a sunset card's icon, in a 0..100 box (canvas +
// exports draw the same). The icon splits along `main` and each half is pushed
// `open` units outward, so the shell gapes 2 x open (15%) apart; each half keeps
// its own hairline branches and chipped-out shards and rides along with it.
export const CRACK = {
  main: 'M50 -2 L46 10 L54 19 L44 31 L56 42 L47 53 L58 64 L49 76 L55 88 L50 102',
  open: 7.5,
  left: {
    branches: ['M44 31 L33 37 L25 34 L17 39', 'M47 53 L38 59 L31 67', 'M46 10 L37 6', 'M49 76 L41 83 L36 82'],
    shards: ['M47 53 L40 48 L36 55 L42 60 Z'],
  },
  right: {
    branches: ['M56 42 L67 47 L75 43 L85 49', 'M58 64 L66 72 L73 71'],
    shards: ['M54 19 L61 13 L66 21 L60 27 L56 25 Z', 'M55 88 L62 85 L64 93 L57 95 Z'],
  },
}

// Each half of the split icon as polygon points in the 0..100 box: the crack
// line closed off past the left or the right edge.
const crackPts = CRACK.main.slice(1).split(' L').map(p => p.split(' ').map(Number))
export const CRACK_HALVES = {
  left: [[-20, -2], ...crackPts, [-20, 102]],
  right: [[120, -2], ...crackPts, [120, 102]],
}

// Ink: what a node with no colour of its own is painted, and the border colour
// of a node that stays. Never grey, so it cannot be mistaken for sunset.
export const INK = '#111827'
