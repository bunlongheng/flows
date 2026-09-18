import db from "./db.js";

export function toSlug(title) {
  return (
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

// Returns a slug unique to (user_id, slug) in flows. One round-trip:
// fetch all collisions, pick the first free counter. Mirrors diagrams' slugs.ts.
export async function uniqueFlowSlug(userId, title) {
  const base = toSlug(title);
  const { rows } = await db.query(
    "SELECT slug FROM flows WHERE user_id = $1 AND (slug = $2 OR slug LIKE $3)",
    [userId, base, `${base}-%`],
  );
  if (rows.length === 0) return base;
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
