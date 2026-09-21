// The colour a node is drawn in should be the colour of its own logo.
//
// A node created through the API or MCP carries its icon inline as a base64
// SVG data URI and no colour of its own. Falling back to services.js then
// matched generic ids - `browser`, `cli`, `api`, `db` - against unrelated
// curated entries, so a Chrome node drew pink and a green terminal drew blue.
// The logo already states the brand colour, so read it from there.
//
// Only inline SVGs are parsed. An icon referenced by path (/icons/lambda.svg)
// keeps its curated services.js colour, which is hand-checked and correct for
// the AWS and GCP sets.

const cache = new Map()

// Greys, pure white and the near-blacks used for strokes and text are almost
// never a brand colour - except when they are the WHOLE logo, as with Next.js.
// So they are only discarded while a more saturated colour is also present.
function isNeutral(hex) {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max - min < 18
}

function decode(icon) {
  const m = /^data:image\/svg\+xml;base64,(.+)$/.exec(icon)
  if (m) {
    try { return atob(m[1]) } catch { return null }
  }
  const u = /^data:image\/svg\+xml[;,]/.test(icon)
  if (u) { try { return decodeURIComponent(icon.replace(/^data:image\/svg\+xml[^,]*,/, '')) } catch { return null } }
  return null
}

/**
 * The dominant brand colour of an inline SVG icon, or null when the icon is not
 * inline or states no colour (a `currentColor` glyph, for instance).
 */
export function colorFromIcon(icon) {
  if (typeof icon !== 'string' || !icon) return null
  if (cache.has(icon)) return cache.get(icon)

  const svg = decode(icon)
  let out = null
  if (svg) {
    // Longhand #rrggbb and shorthand #rgb, which several simple-icons use.
    // Insertion order is kept deliberately: when two colours appear the same
    // number of times, the one drawn FIRST wins, because an SVG lays down its
    // main shape before its details. Sorting on count alone left ties to the
    // Map's iteration order, which picked a shadow over the brand colour on
    // logos where every colour appears once (Linode drew its darkest green).
    const counts = new Map()
    for (const m of svg.matchAll(/#([0-9a-fA-F]{6})\b|#([0-9a-fA-F]{3})\b/g)) {
      const hex = (m[1] || m[2].split('').map(c => c + c).join('')).toLowerCase()
      if (hex === 'ffffff') continue // the canvas behind a logo, never the logo
      counts.set(hex, (counts.get(hex) || 0) + 1)
    }
    if (counts.size) {
      const order = [...counts.keys()]
      const byCountThenFirstSeen = (a, b) =>
        counts.get(b) - counts.get(a) || order.indexOf(a) - order.indexOf(b)
      const vivid = order.filter((h) => !isNeutral(h)).sort(byCountThenFirstSeen)
      out = '#' + (vivid.length ? vivid[0] : order.sort(byCountThenFirstSeen)[0])
    }
  }
  cache.set(icon, out)
  return out
}
