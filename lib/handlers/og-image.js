import { Resvg } from "@resvg/resvg-js";

import db from "../db.js";
import { rateLimit } from "../rate-limit.js";
import { renderOgSvg, OG_W, OG_H } from "../render-og.js";
import { fonts } from "../resvg-fonts.js";


// GET /api/og?name=<slug>  (or ?id=<uuid>) -> PNG 1200x630 -> PUBLIC (no auth).
// The share card a crawler fetches: brand mark, title, pattern line, chips, and
// a preview of the diagram itself. Private designs get no card - a card would
// leak the title and the shape of something deliberately unlisted.
export default async function ogImage(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });

  const limited = rateLimit(req, { key: "og", limit: 120, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const q = req.query || {};
  const name = typeof q.name === "string" ? q.name : null;
  const id = typeof q.id === "string" ? q.id : null;

  // Same rule as the share page: never 500 a preview card. Any failure - the
  // database, the renderer, a font that would not load - falls through to the
  // static site card below.
  const COLS = "title, nodes, edges, description, pattern, difficulty";
  let design = null;
  try {
    if (name) {
      const { rows } = await db.query(
        `SELECT ${COLS} FROM flows WHERE slug = $1 AND is_public = true AND deleted_at IS NULL LIMIT 1`,
        [name],
      );
      design = rows[0] || null;
    } else if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      const { rows } = await db.query(
        `SELECT ${COLS} FROM flows WHERE id = $1 AND is_public = true AND deleted_at IS NULL`,
        [id],
      );
      design = rows[0] || null;
    }
  } catch {
    design = null;
  }

  // No match -> hand back the static site card rather than a broken image, so a
  // stale or private link still previews as something.
  if (!design) {
    // NOT cached. A design flips from private to public the instant Share is
    // pressed, and the share panel has usually already asked for this card while
    // it was still private. Caching that fallback meant the recipient's crawler
    // got the generic card for the next five minutes - on the freshly shared link.
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, "/og.png");
  }

  let png;
  try {
    const svg = renderOgSvg(design);
    png = new Resvg(svg, {
      fitTo: { mode: "width", value: OG_W },
      font: { fontFiles: fonts(), defaultFontFamily: "Roboto", loadSystemFonts: false },
    })
      .render()
      .asPng();
  } catch {
    // Same reasoning: a render that failed once must not be pinned.
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, "/og.png");
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", String(png.length));
  // Long cache: the card only changes when the design does, and a redeploy of
  // the renderer busts it anyway via the new deployment URL.
  res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return res.status(200).end(png);
}

export { OG_W, OG_H };
