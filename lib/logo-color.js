// A node with its own logo is drawn in the logo's colour. That is the DEFAULT,
// not a repair: the border and the box tint come off the icon unless somebody
// deliberately picked something else. A .env card with a yellow icon is yellow,
// a localhost card with a blue monitor is blue, every time.
//
// Two ways a node used to come out wrong. It stored a near-black (#1a1d1f) or
// grey, and that explicit colour beat the logo, so Auth0 came out black instead
// of orange. Or it stored NO colour at all, and the card fell back to the house
// ink, which is near-black too - that is how .env ended up with a black border
// under a yellow icon.
//
// So: no colour, or a neutral one, means the icon decides. A saturated colour
// is an explicit override and always wins. A logo that states no colour of its
// own (a black wordmark, a silver photo) leaves the node as it was sent.
import { colorFromIcon, isNeutralColor } from "../src/iconColor.js";

// The one chroma test, shared with the canvas (src/iconColor.js).
export const isNeutral = isNeutralColor;

/** The logo's colour, or null when it states none (or sharp is missing for a PNG). */
export async function logoColor(icon) {
  if (typeof icon !== "string") return null;
  if (icon.startsWith("data:image/svg+xml")) return colorFromIcon(icon) || null;
  if (!icon.startsWith("data:image/png")) return null;
  try {
    const { colorFromRaster, bytesOfDataUri } = await import("../scripts/icon-color-raster.mjs");
    return (await colorFromRaster(bytesOfDataUri(icon))) || null;
  } catch { return null; }
}

const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return (h * 60 + 360) % 360;
};
const HUE_SLACK = 40;

/**
 * HARD GATE: a border never fights the tile it frames. When 1 colour plainly
 * IS a raster icon (scripts/icon-color-raster.mjs tileFromRaster), the node
 * draws in that colour: a red tile is never boxed in mint, a black tile never
 * in yellow. A white tile, or a dark one with a coloured mark, gets no verdict;
 * nor does an icon with no single tile (Chrome, Caddy) gets no verdict, so the stored colour
 * stands. Returns the colour the node must draw in, or null for no verdict.
 */
const tiles = new Map();
export async function tileColor(icon) {
  if (typeof icon !== "string" || !/^data:image\/(png|jpe?g|webp);/i.test(icon)) return null;
  if (tiles.has(icon)) return tiles.get(icon);
  let out = null;
  try {
    const { tileFromRaster, bytesOfDataUri } = await import("../scripts/icon-color-raster.mjs");
    out = await tileFromRaster(bytesOfDataUri(icon));
  } catch { out = null; }
  tiles.set(icon, out);
  return out;
}

/** Whether a stored colour plainly is not the tile's: another hue, or a hue on a black tile. */
export function clashes(color, tile) {
  if (!tile || typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return false;
  if (isNeutral(tile)) return !isNeutral(color);
  if (isNeutral(color)) return true;
  const d = Math.abs(hue(color) - hue(tile));
  return Math.min(d, 360 - d) > HUE_SLACK;
}

/** The icon's colour is a node's default colour. An explicit, saturated one wins unless it fights the tile. */
export async function defaultIconColors(nodes) {
  return Promise.all(nodes.map(async (n) => {
    if (!n || !n.icon) return n;
    if (n.color != null && !isNeutral(n.color)) {
      const tile = await tileColor(n.icon);
      return clashes(n.color, tile) ? { ...n, color: tile } : n;
    }
    const c = await logoColor(n.icon);
    return c && !isNeutral(c) ? { ...n, color: c } : n;
  }));
}
