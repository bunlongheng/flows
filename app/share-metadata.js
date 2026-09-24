import db from '../lib/db.js'

// Per-design share card, straight from the framework.
//
// This replaces the whole workaround the Vite build needed: a share-page handler,
// an index.html baked into a JS module at build time, and a rewrite that only
// fired on /demo - because Vercel resolves "/" from the filesystem before
// rewrites run, so a link off the home route could never get its own card.
// generateMetadata runs on every route, so that limitation is gone too.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A design with no pattern or description still gets a line that says what is
// in it, built from its own node labels, instead of the same generic sentence
// on every card.
export function describe(row) {
  if (row.pattern) return row.pattern;
  if (row.description) return row.description;
  const labels = (Array.isArray(row.nodes) ? row.nodes : [])
    .map((n) => String(n?.label || "").trim())
    .filter(Boolean);
  if (!labels.length) return "An interactive architecture diagram on Flows.";
  const shown = labels.slice(0, 4);
  const rest = labels.length - shown.length;
  return `${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""} - an interactive architecture diagram on Flows.`;
}

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
      `SELECT title, slug, description, pattern, nodes, EXTRACT(EPOCH FROM updated_at)::bigint AS v FROM flows WHERE ${name ? "slug = $1" : "id = $1::uuid"} AND is_public = true AND deleted_at IS NULL LIMIT 1`,
      [name || id],
    ));
  } catch {
    // A card is decoration. An unreachable database must never take the page down.
    return {};
  }
  if (!rows.length) return {};

  const row = rows[0];
  const description = describe(row);
  const url = `${path}?name=${encodeURIComponent(row.slug)}`;
  // Crawlers cache an image by its URL for days. Stamping the last edit onto the
  // URL means a diagram that changed previews as it is now, not as it was when
  // the link was first pasted.
  const image = `/api/og?name=${encodeURIComponent(row.slug)}${row.v ? `&v=${row.v}` : ""}`;
  const alt = `${row.title} - architecture diagram`;
  return {
    title: `${row.title} · Flows`,
    description,
    openGraph: {
      type: "article", siteName: "Flows", title: row.title, description, url,
      images: [{ url: image, width: 1200, height: 630, alt }],
    },
    twitter: { card: "summary_large_image", title: row.title, description, images: [{ url: image, alt }] },
  };
}
