// The sunset look: a node marked `sunset: true` is today's path and gets
// decommissioned, so it is drawn light silver and dimmed, its icon in
// greyscale. The red X marks its badges only, never the card. Silver is reserved for this
// state - nothing else in the app is painted silver, and a node with no colour
// of its own falls back to ink instead. Shared by the canvas and the exports.
export const SUNSET = {
  border: '#b9bfc7',   // silver line: the card border
  line: '#e3e6ea',     // every edge touching the card: very light silver, drawn at half opacity
  tint: '#f2f3f5',     // light silver card fill
  ink: '#9ca3af',      // greyed label, sub and badge text
  x: '#dc2626',        // the red X
}

// Ink: what a node with no colour of its own is painted, and the border colour
// of a node that stays. Never grey, so it cannot be mistaken for sunset.
export const INK = '#111827'
