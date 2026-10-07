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

/** The icon's colour is a node's default colour. Only an explicit, saturated one wins. */
export async function defaultIconColors(nodes) {
  return Promise.all(nodes.map(async (n) => {
    if (!n || !n.icon) return n;
    if (n.color != null && !isNeutral(n.color)) return n;
    const c = await logoColor(n.icon);
    return c && !isNeutral(c) ? { ...n, color: c } : n;
  }));
}
