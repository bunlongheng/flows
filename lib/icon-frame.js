// A white-edged icon on a white card has no visible edge, so the tile reads as
// a white block (the owner's bheng, Stickies and Sequences tiles). When most
// of an icon's outer ring is near white, the card draws a 1 px grey frame
// around the tile. Decided once, as the icon is stored, so the canvas and the
// SVG never decode a picture: `iconFrame: true` on the node is the answer, and
// a caller may also set it by hand. sharp is a dev dependency, so where it is
// missing (the Vercel API) nothing is detected and the flag stays as sent.
const RING = 0.08; // the outer 8% on every side
const NEAR_WHITE = 235;
const MOST = 0.5;

/** True when more than half of the opaque pixels in the outer ring are near white. */
export function ringIsWhite(data, w, h) {
  const m = Math.max(2, Math.round(Math.min(w, h) * RING));
  let ring = 0, white = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= m && x < w - m && y >= m && y < h - m) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue; // a rounded corner, not an edge
      ring += 1;
      if (data[i] > NEAR_WHITE && data[i + 1] > NEAR_WHITE && data[i + 2] > NEAR_WHITE) white += 1;
    }
  }
  return ring > 0 && white / ring > MOST;
}

const PNG = "data:image/png;base64,";

/** Whether a square PNG data icon needs the grey frame. False wherever sharp is not installed. */
export async function detectIconFrame(uri) {
  if (typeof uri !== "string" || !uri.startsWith(PNG)) return false;
  let sharp;
  try { sharp = (await import("sharp")).default; } catch { return false; }
  try {
    const { data, info } = await sharp(Buffer.from(uri.slice(PNG.length), "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return info.width === info.height && ringIsWhite(data, info.width, info.height);
  } catch { return false; }
}
