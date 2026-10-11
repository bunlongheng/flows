// The dominant brand colour of a RASTER icon (PNG, JPEG).
//
// src/iconColor.js reads hex out of an inline SVG, which covers simple-icons
// marks. It cannot see a raster icon at all, and 92 of 460 nodes carry one - a
// Recurly tile that is plainly yellow was sitting in a purple box because the
// checker was blind to it and reported the diagram clean.
//
// Kept out of src/ on purpose: this pulls in sharp, which is a build-time
// dependency and must not reach the browser bundle. Only the audit uses it.

import sharp from "sharp";

const isTransparent = (a) => a < 128;

/** 0..1. Grey, white and black all sit near 0. */
function saturation(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The colour a person would call the icon's.
 *
 * An app icon is usually a coloured tile with a mark on top, so the answer is
 * the most common SATURATED pixel: the tile, not the white glyph over it and
 * not the transparent corners around it. Colours are bucketed to 24 levels per
 * channel, because a tile with a gradient or antialiasing is one colour to the
 * eye and hundreds to an exact histogram.
 */
export async function colorFromRaster(buf) {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: "inside" })       // 4k pixels is plenty and keeps it fast
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map();
  let opaque = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (isTransparent(a)) continue;
    opaque++;
    const sat = saturation(r, g, b);
    const light = Math.max(r, g, b);
    // Skip the near-white and near-black that make up glyphs, outlines and text.
    if (sat < 0.25 || light < 40 || (light > 235 && sat < 0.35)) continue;
    const key = [r, g, b].map((v) => Math.round(v / 24) * 24).join(",");
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  if (!buckets.size || !opaque) return null;

  const [, best] = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  // A tile colour should actually cover the icon. Below this it is a detail,
  // and forcing the box to match a detail is worse than leaving it alone.
  if (best.n / opaque < 0.08) return null;

  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

/** Decode a data: URI into bytes, or null when it is not one. */
export function bytesOfDataUri(icon) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(icon || "");
  return m ? Buffer.from(m[2], "base64") : null;
}

/**
 * The tile an app icon sits on, or null when no 1 colour plainly IS the icon.
 *
 * A rounded-square app icon is 1 flat colour with a mark on top, and that
 * colour covers most of it: the rebytes tiles measure 68 to 89%. A
 * multi-colour mark (Chrome 16%, Caddy 39%) never gets near, so it never gets
 * a verdict. A dark tile only counts when nothing on it has colour: a black
 * tile with a white rocket IS black, and a yellow border round it is wrong,
 * but a black tile with a green mark (Supabase) is the mark's, which is too
 * small to read reliably, so it gets no verdict. A white tile never does.
 */
export const TILE_SHARE = 0.6;
export async function tileFromRaster(buf) {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map();
  let opaque = 0, vivid = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (isTransparent(data[i + 3])) continue;
    opaque++;
    if (saturation(data[i], data[i + 1], data[i + 2]) >= 0.35 && Math.max(data[i], data[i + 1], data[i + 2]) >= 60) vivid++;
    const key = [0, 1, 2].map((j) => Math.round(data[i + j] / 32)).join(",");
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
    buckets.set(key, e);
  }
  if (!opaque) return null;
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (best.n / opaque < TILE_SHARE) return null;
  const [r, g, b] = [best.r, best.g, best.b].map((v) => Math.round(v / best.n));
  const max = Math.max(r, g, b);
  if (saturation(r, g, b) < 0.25 || max < 80) {
    if (max >= 80 || vivid / opaque >= 0.005) return null; // white tile, or a coloured mark
  }
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
