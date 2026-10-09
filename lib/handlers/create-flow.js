import { creationTags } from "../linked.js";
import db from "../db.js";
import { bearerOk, ownerId } from "../auth-owner.js";
import { uniqueFlowSlug } from "../slugs.js";
import { rateLimit } from "../rate-limit.js";
import { validateDesign, okColor } from "../validate-design.js";
import { resolveNodeIcons } from "../resolve-icon.js";
import { resolveNodeImages } from "../resolve-image.js";
import { renderDiagramSvg } from "../render-svg.js";
import { cleanLanes } from "../../src/lanes.js";
import { cleanStyle } from "../../src/style.js";
import { cleanView } from "../../src/view-state.js";
import { arrangeNew } from "../arrange.js";
import { cleanNote, cleanInfo } from "../../src/note.js";
import { cleanDesc } from "../../src/tag.js";

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
      edges: "array - [{ source, target, label?, description?, animated? }] connecting node ids; the tag on the line reads the label, or the description (max 300) cut short, and hovering the tag shows the whole description",
      "nodes[].note": "string, optional - note shown under that node (bottom-left) in the app, every shared link and the SVG; max 400 chars. Light markdown: **bold**, *italic*, __underline__, ~~strike~~, `code`, 1 level. A URL becomes a blue link showing its ticket key (SHAR-7977) or its bare address",
      "nodes[].info": "string, optional - what this thing is and why it is in this diagram, 1-3 sentences; hidden until the reader hovers or clicks the i badge on the card, 1 open at a time; shown as '<card name> is <text>', so write it to read after 'is'; max 600 chars",
      "nodes[].sunset": "boolean, optional - true marks a node that is today's path and gets decommissioned: drawn light silver and dimmed, icon in greyscale, the red X on the badge of every edge into it, and every edge touching it (in or out) light silver, immune to any line style; no X on the card. Silver is reserved for this; never paint a node grey or silver to mean retired, set sunset instead.",
      "nodes[].icon": "string, optional - a URL or /icons/<file> to override the service logo. A node id that is a known service already draws the right logo; use this only for something the catalog has no key for.",
      "nodes[].label": "string, optional - override the card title. \"nodes[].sub\" overrides the grey second line under it.",
      "nodes[].color": "string, optional - #hex border and accent. Leave it OFF: the colour is taken from the logo itself, which is almost always right, and a grey or near-black here is rejected and replaced by the logo colour.",
      "nodes[].size": "object, optional - { w, h } in canvas units, clamped 130-600, to resize the card. Default 180 x 180 (240 x 225 for a picture node). The note hangs BELOW the card and is not part of h.",
      "nodes[].iconSize": "object, optional - { w, h } clamped 16-600, to stretch the logo tile inside the card. Only for a wide wordmark that is unreadable at the stock tile.",
      "nodes[].iconFrame": "boolean, optional - true draws a 1 px grey frame around the icon tile, for a PNG whose outer ring is white.",
      "nodes[].image": "string, optional - a URL or data: URI to draw a picture card instead of a logo card.",
      "nodes[].style": "object, optional - the same look object the format panel writes: stroke #hex, bg #hex or \"transparent\", bw 1|2|4, bs solid|dashed|dotted, radius 0|12, font sans|serif|mono, fs 12|14|18|24, align left|center|right, opacity 0-100. An illegal key or value is dropped.",
      "edges[].async": "boolean, optional - true fires this line on the same beat as the line before it: the current leaves the card on both lines at once and both targets light together. For a fan-out whose lines do not depend on each other; chain it on consecutive lines to fire 3 or more together.",
      "edges[].id": "string, optional but ALWAYS SEND IT - a stable id such as \"e1\". Styling, badge position and hand bends are matched to a line by id; with no id they fall back to the array index, so inserting a line in the middle moves all of that onto the wrong lines.",
      "edges[].style": "object, optional - per-line look. A line uses only stroke, bw, bs, arrow (step|curved|straight) and opacity.",
      edges_order: "THE EDGES ARRAY ORDER IS THE DIAGRAM: it numbers the Steps chips 1..N and it is the path the single current walks. Order it the way a reader should read the diagram.",
      lanes: "array, optional - swimlanes, max 12: rows [{ id, title, y, h, color?, size?, sections? }] for a top-down layout or columns [{ id, title, x, w, ... }] for a left-to-right one, 1 kind per diagram. There is no canvas button for these; they are configuration.",
      view_state: "object, optional - how the diagram opens: { panels: [\"steps\"|\"share\"|\"code\"|\"notes-off\"], badge: \"dark\"|\"silver\"|\"color\"|\"plain\", start: {x,y}, current: { speed: 0.5|1|1.5|2, amount: 5|10|20|50|100|200|500 } }. \"steps\" prints the numbered chip on every line; \"notes-off\" hides the notes, which show by default.",
      pattern: 'string, optional - the one-line "what it tests" shown above the diagram and on the share card (max 200 chars)',
      description: "string, optional - the goal paragraph shown under it (max 600 chars)",
      is_public: "boolean, optional (default false) - true makes the diagram open for anyone with the link and gives it a real preview card (Slack, iMessage). Private diagrams 404 for recipients and preview as the generic site card.",
      linked: "boolean, optional - true lists the diagram under the gallery's Linked tab (README, PR, repo audit) instead of My Diagrams. A title that starts with owner/repo is Linked on its own; false keeps it out.",
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
  // A repo audit wants a picture for its report, not a row in the gallery
  // (owner rule 2026-10-04): source "repo-audit", or store: false, renders the
  // SVG and stores nothing, so an audit never lands in the diagrams list. The
  // source travels in the body, so the caller is told apart by what it says
  // it is, not by its title.
  const source = text(body.source, 40);
  const renderOnly = source === "repo-audit" || body.store === false;

  // ── Validate: ONLY the flows (React Flow) structure is accepted ─────
  // One row is one flow, so the stored value is the singular - that is the
  // column default and what the MCP path writes. The rename briefly made this
  // path store "flows", which left 3 rows disagreeing with the other 43 and
  // would have rejected an MCP-shaped call arriving over HTTP. Both spellings
  // are accepted on the way in; only the singular is stored.
  if (type && type !== "flow" && type !== "flows") return bad(res, `Unsupported type: "${type}".`);
  if (!title || typeof title !== "string" || !title.trim()) return bad(res, "Missing required field: title (string).");
  // One policy for every door (API, MCP, AI generate): lib/validate-design.js.
  const invalid = validateDesign({ nodes, edges, lanes: Array.isArray(body.lanes) ? body.lanes : null });
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
  // Picture nodes: `image` is resolved ONCE here into a 640x480 JPEG data URI,
  // the same way a remote icon is inlined above.
  const { nodes: imgNodes, failed: imgFailed } = await resolveNodeImages(iconNodes);
  if (imgFailed.length) {
    return bad(res, `Could not load the image for node(s): ${imgFailed.map(f => `${f.id} (${f.reason})`).join(", ")}. The API takes a data:image;base64 URI or an https image URL; file paths and airclips: refs work through the MCP.`);
  }

  const normalizedNodes = arrangeNew(imgNodes.map((nd) => ({
    id: nd.id,
    ...(nd.position && typeof nd.position.x === "number" && typeof nd.position.y === "number"
      ? { position: nd.position }
      : {}),
    ...(nd.size && Number.isFinite(nd.size.w) && Number.isFinite(nd.size.h)
      ? { size: { w: Math.min(600, Math.max(130, Math.round(nd.size.w))), h: Math.min(600, Math.max(130, Math.round(nd.size.h))) } }
      : {}),
    ...(nd.iconSize && Number.isFinite(nd.iconSize.w) && Number.isFinite(nd.iconSize.h)
      ? { iconSize: { w: Math.min(600, Math.max(16, Math.round(nd.iconSize.w))), h: Math.min(600, Math.max(16, Math.round(nd.iconSize.h))) } }
      : {}),
    // Optional bring-your-own-icon fields - stored only when present.
    ...(typeof nd.icon === "string" && nd.icon ? { icon: nd.icon } : {}),
    ...(typeof nd.label === "string" && nd.label ? { label: nd.label } : {}),
    ...(okColor(nd.color) ? { color: nd.color } : {}),
    ...(typeof nd.sub === "string" && nd.sub ? { sub: nd.sub } : {}),
    ...(cleanNote(nd.note) ? { note: cleanNote(nd.note) } : {}),
    ...(cleanInfo(nd.info) ? { info: cleanInfo(nd.info) } : {}),
    ...(nd.sunset === true ? { sunset: true } : {}),
    ...(nd.iconFrame === true ? { iconFrame: true } : {}),
    ...(typeof nd.image === "string" && nd.image.startsWith("data:image/jpeg;base64,") ? { image: nd.image } : {}),
    // The format panel's look. Validated by the same function the panel saves
    // through, so this door stores exactly what that one does.
    ...(cleanStyle(nd.style) ? { style: cleanStyle(nd.style) } : {}),
  })), edges);
  // An edge keeps what it came with plus a bounded description: the tag on
  // the line reads the label, or the description cut short, and hovering
  // the tag shows the whole description.
  // A line's look goes through cleanStyle too: it used to ride in raw, so a
  // typo'd key was stored and then silently ignored by every renderer.
  const storedEdges = edges.map(({ description, style, ...e }) => ({
    ...e,
    ...(cleanDesc(description) ? { description: cleanDesc(description) } : {}),
    ...(cleanStyle(style) ? { style: cleanStyle(style) } : {}),
  }));

  if (renderOnly) {
    try {
      const lanes = Array.isArray(body.lanes) ? cleanLanes(body.lanes) : [];
      const svg = renderDiagramSvg(normalizedNodes, storedEdges, { view: lanes.length ? { lanes } : {} });
      return res.status(200).json({ stored: false, source: source || "render-only", svg });
    } catch (e) {
      return res.status(500).json({ error: "SVG render failed", detail: String(e && e.message || e) });
    }
  }

  // ── Insert (PARAMETERIZED only), owned by OWNER_USER_ID ─────────────────────
  // New diagrams are PRIVATE by default (is_public=false): /demo is auth-free, so
  // nothing should land there until the owner explicitly publishes it (PATCH
  // is_public). The column default is true only to keep the pre-existing showcase
  // demos visible.
  const slug = await uniqueFlowSlug(owner, title);
  // Lanes ride in view_state, the shape the SPA and every export already read.
  // They were validated above and honoured for render-only calls, but never
  // written - so a create carrying lanes came back silently without them.
  const lanes = cleanLanes(Array.isArray(body.lanes) ? body.lanes : []);
  // How it OPENS, so an agent can ship a diagram with the Steps chips already
  // on instead of leaving the reader to find the button. Same validator as the
  // canvas PATCH (src/view-state.js); an empty panels list is not worth a row.
  const view = body.view_state && typeof body.view_state === "object" ? cleanView(body.view_state) : null;
  const viewState = {
    ...(lanes.length ? { lanes } : {}),
    ...(view && view.panels.length ? { panels: view.panels } : {}),
    ...(view && view.badge ? { badge: view.badge } : {}),
    ...(view && view.start ? { start: view.start } : {}),
  };
  const { rows } = await db.query(
    "INSERT INTO flows (user_id, title, slug, nodes, edges, type, tags, is_public, pattern, description, view_state) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::text[], $8, $9, $10, $11::jsonb) RETURNING id",
    // Normalised: the alias is accepted on the way in, never written.
    [owner, title.trim(), slug, JSON.stringify(normalizedNodes), JSON.stringify(storedEdges), "flow", creationTags("API", title, body.linked), isPublic, pattern, description, Object.keys(viewState).length ? JSON.stringify(viewState) : null],
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
    // The animated embed for a README. w=3200 is the widest render, so it
    // stays sharp on a retina screen at any zoom.
    gif_url: `${APP_URL}/api/flows/${encodeURIComponent(slug)}?format=gif&w=1800&frames=20`,
    readme: `![${title}](${APP_URL}/api/flows/${encodeURIComponent(slug)}?format=gif&w=1800&frames=20)`,
  };
  // A remote agent (e.g. docs pipeline) can ask for the SVG inline in one round
  // trip: POST ...?format=svg  or  body { "return": "svg" }.
  const wantSvg = (req.query && req.query.format === "svg") || body.return === "svg" || body.format === "svg";
  if (wantSvg) {
    try {
      out.svg = renderDiagramSvg(imgNodes, edges);
    } catch (e) {
      // Never fail the create just because rendering hiccuped - the diagram is
      // saved; the caller can still fetch svg_url. Surface the reason.
      out.svg_error = String(e && e.message || e);
    }
  }
  return res.status(201).json(out);
}
