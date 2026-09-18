import db from '../lib/db.js'

// Per-design share card, straight from the framework.
//
// This replaces the whole workaround the Vite build needed: a share-page handler,
// an index.html baked into a JS module at build time, and a rewrite that only
// fired on /demo - because Vercel resolves "/" from the filesystem before
// rewrites run, so a link off the home route could never get its own card.
// generateMetadata runs on every route, so that limitation is gone too.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function designMetadata(searchParams, path) {
  const sp = await searchParams;
  const name = typeof sp?.name === "string" ? sp.name : null;
  // ?id=<uuid> is the link the API and MCP return, and the one that gets pasted
  // into Slack. It used to fall through to the generic site card even for a
  // public design, because only ?name= was looked up.
  const id = !name && typeof sp?.id === "string" && UUID_RE.test(sp.id) ? sp.id : null;
  if (!name && !id) return {};

  let rows = [];
  try {
    ({ rows } = await db.query(
      `SELECT title, slug, description, pattern FROM flows WHERE ${name ? "slug = $1" : "id = $1::uuid"} AND is_public = true AND deleted_at IS NULL LIMIT 1`,
      [name || id],
    ));
  } catch {
    // A card is decoration. An unreachable database must never take the page down.
    return {};
  }
  if (!rows.length) return {};

  const row = rows[0];
  const description = row.pattern || row.description || "An interactive AWS & GCP architecture diagram.";
  const url = `${path}?name=${encodeURIComponent(row.slug)}`;
  const image = `/api/og?name=${encodeURIComponent(row.slug)}`;
  return {
    title: `${row.title} · Flows`,
    description,
    openGraph: { type: "article", title: row.title, description, url, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: row.title, description, images: [image] },
  };
}
