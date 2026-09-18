import db from "../db.js";
import { ownerId, authorizeOwner } from "../auth-owner.js";
import { rateLimit } from "../rate-limit.js";
import { DEMO_SLUGS } from "./list-public-flows.js";

// GET /api/flows -> the owner's saved designs, newest first, for the
// gallery. Owner-only (the gallery is signed-in-only); a shared design is read
// via the separate public GET /api/flows/:id, which stays public.
// Returns the fields the gallery cards need to render a minimap. Capped at 60.
export default async function listFlows(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!(await authorizeOwner(req))) return res.status(401).json({ error: "Unauthorized" });

  const limited = rateLimit(req, { key: "list", limit: 120, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const owner = ownerId();
  if (!owner) return res.status(500).json({ error: "OWNER_USER_ID not configured" });

  const { rows } = await db.query(
    // Owner's own working index = everything of theirs EXCEPT the curated demo
    // roster, which has its own tab. It used to filter on is_public = false, so
    // publishing a diagram made it VANISH from My Diagrams: it was not private
    // any more, and it was not a demo either, so it appeared in neither list.
    `SELECT id, title, slug, nodes, edges, type, tags, is_public, description, pattern, difficulty, created_at
       FROM flows
      WHERE user_id = $1 AND deleted_at IS NULL AND slug <> ALL($2::text[])
      ORDER BY created_at DESC LIMIT 60`,
    [owner, DEMO_SLUGS],
  );
  return res.status(200).json(rows);
}
