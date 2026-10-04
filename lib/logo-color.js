// A node with its own logo is drawn in the logo's colour. Agents kept storing a
// near-black (#1a1d1f) or grey on such nodes, and that explicit colour beat the
// logo, so Auth0 came out black instead of orange on the owner's work diagrams.
// Here a NEUTRAL colour (no chroma to speak of) on a node that carries its own
// colourful logo is replaced by the logo's colour as the node is stored. A
// saturated colour the owner picked on purpose stays; a logo that states no
// colour (a black wordmark, a silver photo) keeps whatever was sent.
import { colorFromIcon } from "../src/iconColor.js";

const CHROMA = 30; // below this, grey, black or white

export function isNeutral(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return false;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...c) - Math.min(...c) < CHROMA;
}

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

/** Nodes with a neutral colour on their own colourful logo get the logo's colour instead. */
export async function fixNeutralColors(nodes) {
  return Promise.all(nodes.map(async (n) => {
    if (!n || !n.icon || !isNeutral(n.color)) return n;
    const c = await logoColor(n.icon);
    return c && !isNeutral(c) ? { ...n, color: c } : n;
  }));
}
