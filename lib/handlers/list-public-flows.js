import db from "../db.js";
import { rateLimit } from "../rate-limit.js";

// The /demo showcase is a LOCKED, curated roster - exactly these 12 slugs, in this
// order. It is NOT "every public diagram": that let a personal/API/MCP diagram
// auto-join the public gallery the moment it was published. A design only appears
// on /demo if its slug is on this list AND it is still is_public. To change the
// showcase, edit this list on purpose - nothing is ever added automatically.
export const DEMO_SLUGS = [
  "url-shortener-like-bitly",
  "distributed-rate-limiter",
  "ifttt-zapier-workflow-automation",
  "email-newsletter-500m-subscribers",
  "llm-ai-platform-inference",
  "dropbox-google-drive-file-sync",
  "whatsapp-slack-realtime-chat",
  "payment-system-like-stripe",
  "twitter-instagram-news-feed",
  "uber-doordash-realtime-matching",
  "youtube",
  "youtube-netflix-video-streaming",
];

// GET /api/flows/public -> PUBLIC (no auth). The demo gallery anonymous
// visitors see: ONLY the curated DEMO_SLUGS above (and only while each is public),
// ordered by difficulty. Same row shape as the owner list so cards render identically.
export default async function listPublicFlows(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const limited = rateLimit(req, { key: "public-list", limit: 120, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const { rows } = await db.query(
    "SELECT id, title, slug, nodes, edges, type, tags, is_public, description, pattern, difficulty, created_at FROM flows WHERE is_public = true AND deleted_at IS NULL AND slug = ANY($1) ORDER BY difficulty ASC NULLS LAST, created_at DESC LIMIT 12",
    [DEMO_SLUGS],
  );
  return res.status(200).json(rows);
}
