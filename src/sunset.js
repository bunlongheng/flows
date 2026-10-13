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

// The crack torn down the middle of a sunset card's icon, like ripped paper,
// in a 0..100 square. Drawn as a pale gap with a dark seam (canvas + exports).
export const CRACK_PATH = 'M53 -2 L45 12 L57 24 L44 37 L58 50 L45 63 L56 76 L46 89 L52 102'

// Ink: what a node with no colour of its own is painted, and the border colour
// of a node that stays. Never grey, so it cannot be mistaken for sunset.
export const INK = '#111827'
