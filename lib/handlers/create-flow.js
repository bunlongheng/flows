import db from "../db.js";
import { bearerOk, ownerId } from "../auth-owner.js";
import { uniqueFlowSlug } from "../slugs.js";
import { rateLimit } from "../rate-limit.js";
import { validateDesign, okColor } from "../validate-design.js";
import { resolveNodeIcons } from "../resolve-icon.js";
import { renderDiagramSvg } from "../render-svg.js";
import { arrangeNew } from "../arrange.js";
import { cleanNote } from "../../src/note.js";

const APP_URL = process.env.FLOWS_APP_URL || "https://flows-bheng.vercel.app";

// The single public, documented way to create an artifact. RENDER-ONLY:
// the caller supplies the finished React Flow structure ({ nodes, edges }); we
// persist and return its URL. Makes NO model call -> ZERO Anthropic spend.
const SAMPLE_BODY = {
  title: "Netflix Video Streaming",
  type: "flow",
  nodes: [
    { id: "user", position: { x: 40, y: 200 } },
    { id: "cloudfront", position: { x: 260, y: 200 } },
    { id: "apigw", position: { x: 480, y: 200 } },
    { id: "lambda", position: { x: 700, y: 200 } },
    { id: "dynamo", position: { x: 920, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "user", target: "cloudfront", label: "HTTPS", animated: true },
    { id: "e2", source: "cloudfront", target: "apigw", label: "origin" },
    { id: "e3", source: "apigw", target: "lambda", label: "invoke" },
    { id: "e4", source: "lambda", target: "dynamo", label: "read/write" },
  ],
};

function bad(res, error, extra = {}) {
  return res.status(400).json({
    error,
    supported_type: "flow ONLY (React Flow { nodes, edges } structure). \"flows\" is accepted as an alias.",
    required_fields: {
      title: 'string - a descriptive name (e.g. "Netflix Video Streaming")',
      nodes: 'array - non-empty [{ id, position:{x,y} }]; id must match a known service (e.g. "cloudfront", "lambda", "dynamo", "s3", "kinesis")',
      edges: "array - [{ source, target, label?, animated? }] connecting node ids",
      "nodes[].note": "string, optional - plain-text note shown under that node (bottom-left) in the app, every shared link and the SVG; max 400 chars",
      pattern: 'string, optional - the one-line "what it tests" shown above the diagram and on the share card (max 200 chars)',
      description: "string, optional - the goal paragraph shown under it (max 600 chars)",
      is_public: "boolean, optional (default false) - true makes the diagram open for anyone with the link and gives it a real preview card (Slack, iMessage). Private diagrams 404 for recipients and preview as the generic site card.",
    },
    sample_request: {
      method: "POST",
      url: "/api/ai/flows",
      headers: {
        Authorization: "Bearer <FLOWS_API_SECRET>",
        "Content-Type": "application/json",
      },
      body: SAMPLE_BODY,
    },
    ...extra,
  });
}

export default async function createFlow(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth: Bearer secret ONLY (public render endpoint; no model call) ────────
  if (!process.env.FLOWS_API_SECRET) {
    return res.status(500).json({ error: "FLOWS_API_SECRET not configured" });
  }
  if (!bearerOk(req)) return res.status(401).json({ error: "Unauthorized" });

  const limited = rateLimit(req, { key: "create", limit: 60, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { title, nodes, edges = [], type = "flow" } = body;
  // Private by default. Pass is_public: true when the link is going straight to
  // someone - only a public design opens for them and gets a real share card.
  const isPublic = body.is_public === true;
  // The 2 lines the detail view and the share card show above the diagram.
  // Optional, trimmed, bounded - there was no way to set them before.
  const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const pattern = text(body.pattern, 200);
  const description = text(body.description, 600);

  // ── Validate: ONLY the flows (React Flow) structure is accepted ─────
  // One row is one flow, so the stored value is the singular - that is the
  // column default and what the MCP path writes. The rename briefly made this
  // path store "flows", which left 3 rows disagreeing with the other 43 and
  // would have rejected an MCP-shaped call arriving over HTTP. Both spellings
  // are accepted on the way in; only the singular is stored.
  if (type && type !== "flow" && type !== "flows") return bad(res, `Unsupported type: "${type}".`);
  if (!title || typeof title !== "string" || !title.trim()) return bad(res, "Missing required field: title (string).");
  // One policy for every door (API, MCP, AI generate): lib/validate-design.js.
  const invalid = validateDesign({ nodes, edges });
  if (invalid) return bad(res, invalid.error, invalid.unresolved ? { unresolved: invalid.unresolved } : {});
  if (title.length > 200) return bad(res, "title too long (max 200 characters).");

  const owner = ownerId();
  if (!owner) return res.status(500).json({ error: "OWNER_USER_ID not configured" });

  // Callers may omit positions (the app auto-layouts on open). Default them to a
  // simple grid so stored nodes ALWAYS have a valid position - a position-less
  // node otherwise crashes the gallery minimap.
  // Fetch any remote https icon URLs and inline them as data: URIs, so the stored
  // diagram is self-contained. Reject if a caller-supplied remote icon can't load.
  const { nodes: iconNodes, failed } = await resolveNodeIcons(nodes);
  if (failed.length) {
    return bad(res, `Could not fetch the remote icon for node(s): ${failed.join(", ")}. Use an https image URL that returns image/* under 24KB (no redirects), or inline a data:image/... URI.`, { icon_fetch_failed: failed });
  }

  const normalizedNodes = arrangeNew(iconNodes.map((nd) => ({
    id: nd.id,
    ...(nd.position && typeof nd.position.x === "number" && typeof nd.position.y === "number"
      ? { position: nd.position }
      : {}),
    // Optional bring-your-own-icon fields - stored only when present.
    ...(typeof nd.icon === "string" && nd.icon ? { icon: nd.icon } : {}),
    ...(typeof nd.label === "string" && nd.label ? { label: nd.label } : {}),
    ...(okColor(nd.color) ? { color: nd.color } : {}),
    ...(typeof nd.sub === "string" && nd.sub ? { sub: nd.sub } : {}),
    ...(cleanNote(nd.note) ? { note: cleanNote(nd.note) } : {}),
  })), edges);

  // ── Insert (PARAMETERIZED only), owned by OWNER_USER_ID ─────────────────────
  // New diagrams are PRIVATE by default (is_public=false): /demo is auth-free, so
  // nothing should land there until the owner explicitly publishes it (PATCH
  // is_public). The column default is true only to keep the pre-existing showcase
  // demos visible.
  const slug = await uniqueFlowSlug(owner, title);
  const { rows } = await db.query(
    "INSERT INTO flows (user_id, title, slug, nodes, edges, type, tags, is_public, pattern, description) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::text[], $8, $9, $10) RETURNING id",
    // Normalised: the alias is accepted on the way in, never written.
    [owner, title.trim(), slug, JSON.stringify(normalizedNodes), JSON.stringify(edges), "flow", ["API"], isPublic, pattern, description],
  );
  if (rows.length === 0) return res.status(500).json({ error: "Insert failed" });

  const id = rows[0].id;
  // share_url is the link to hand to people: it opens for them and unfurls with
  // the diagram itself - once the design is public.
  const out = {
    id,
    url: `${APP_URL}/?id=${id}`,
    share_url: `${APP_URL}/demo?name=${encodeURIComponent(slug)}`,
    visibility: isPublic ? "public" : "private",
    ...(isPublic ? {} : { share_note: "Private: recipients get a 404 and Slack shows the generic site card. Create with is_public: true, or press Share in the app, before sending the link." }),
    svg_url: `${APP_URL}/api/flows/${id}?format=svg`,
  };
  // A remote agent (e.g. docs pipeline) can ask for the SVG inline in one round
  // trip: POST ...?format=svg  or  body { "return": "svg" }.
  const wantSvg = (req.query && req.query.format === "svg") || body.return === "svg" || body.format === "svg";
  if (wantSvg) {
    try {
      out.svg = renderDiagramSvg(iconNodes, edges);
    } catch (e) {
      // Never fail the create just because rendering hiccuped - the diagram is
      // saved; the caller can still fetch svg_url. Surface the reason.
      out.svg_error = String(e && e.message || e);
    }
  }
  return res.status(201).json(out);
}
