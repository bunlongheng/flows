import db from "../db.js";
import { authorizeOwner, ownerId } from "../auth-owner.js";
import { rateLimit } from "../rate-limit.js";
import { buildScene } from "../export/scene.js";
import { SUNSET } from "../../src/sunset.js";

// POST /api/flows/:id/miro -> push a flow onto a Miro board as real shapes.
//
// Miro has no file import for structured diagrams at all - REST is the only way
// in, and a Miro token only ever comes out of an OAuth flow. Rather than run a
// redirect route and hold someone's credentials, the owner pastes a token from
// their own Miro app settings ("Install app and get OAuth token") along with the
// board URL.
//
// THE TOKEN IS REQUEST-SCOPED. It is never written to the database, never put
// in an env file, and never logged - not even on a failure, where the status
// code alone goes back.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API = "https://api.miro.com/v2";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A board URL reads https://miro.com/app/board/uXjVN4v8Z1k=/?moveToWidget=...
// The id ends in "=", which arrives percent-encoded about half the time
// depending on where it was copied from.
export function boardIdFrom(input) {
  const s = String(input || "").trim();
  const m = /miro\.com\/app\/board\/([^/?#]+)/.exec(s);
  const raw = m ? m[1] : s;
  if (!/^[A-Za-z0-9_%=+-]{6,64}$/.test(raw)) return null;
  return decodeURIComponent(raw);
}

// Miro answers 429 with Retry-After, and a push is a burst of 2 calls per node,
// so backing off is the normal path here rather than an exceptional one.
async function call(token, path, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 429 && i < tries - 1) {
      await sleep(Math.min(10, Number(r.headers.get("Retry-After")) || 1) * 1000);
      continue;
    }
    if (!r.ok) return { ok: false, status: r.status };
    const json = await r.json().catch(() => ({}));
    return { ok: true, id: json.id };
  }
  return { ok: false, status: 429 };
}

// 4 at a time: enough to stay well inside Miro's credit budget, enough that a
// 30-node flow does not take a minute.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async function pushToMiro(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = req.query?.id || null;
  if (!id || !UUID.test(id)) return res.status(400).json({ error: "Invalid id" });
  if (!(await authorizeOwner(req, { allowBearer: false }))) return res.status(401).json({ error: "Unauthorized" });

  const limited = rateLimit(req, { key: "miro", limit: 10, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const token = String(req.body?.token || "").trim();
  const board = boardIdFrom(req.body?.board);
  if (!token) return res.status(400).json({ error: "Paste a Miro token" });
  if (!board) return res.status(400).json({ error: "That is not a Miro board URL" });

  const { rows } = await db.query(
    "SELECT nodes, edges FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [id, ownerId()],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Not found" });

  const scene = buildScene(rows[0].nodes, rows[0].edges);
  if (!scene.nodes.length) return res.status(400).json({ error: "Nothing to push" });

  // Miro is centre-origin with y running down, the canvas is top-left origin.
  const centre = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2, origin: "center" });
  let failed = 0;

  // 1. A shape per node, carrying the label. Its id is what a connector binds
  //    to later, so this pass has to finish before any connector is written.
  const placed = await pool(scene.nodes, 4, async (n) => {
    const content = n.sub ? `<p><b>${esc(n.label)}</b></p><p>${esc(n.sub)}</p>` : `<p><b>${esc(n.label)}</b></p>`;
    const r = await call(token, `/boards/${board}/shapes`, {
      data: { shape: "rectangle", content },
      style: {
        fillColor: n.sunset ? SUNSET.tint : "#ffffff",
        borderColor: n.color,
        borderWidth: "2",
        color: n.sunset ? SUNSET.ink : "#1f2937",
        fontSize: "14",
      },
      position: centre(n),
      geometry: { width: n.w, height: n.h },
    });
    if (!r.ok) failed += 1;
    return { node: n, itemId: r.ok ? r.id : null };
  });

  // 2. The logo on top of its shape. This is the whole point of the export: a
  //    card without its mark is a white box with a word in it.
  await pool(placed.filter((p) => p.itemId && p.node.iconDataUri), 4, async (p) => {
    const s = Math.round(Math.min(p.node.w, p.node.h) * 0.45);
    const r = await call(token, `/boards/${board}/images`, {
      data: { url: p.node.iconDataUri },
      position: { x: p.node.x + p.node.w / 2, y: p.node.y + p.node.h * 0.38, origin: "center" },
      geometry: { width: s },
    });
    if (!r.ok) failed += 1;
  });

  // 3. What the i badge hid, as its own text item under the card. It does not
  //    go inside the shape: a 600-character info in a 180px box either overflows
  //    or shrinks the label with it.
  await pool(placed.filter((p) => p.itemId && p.node.info), 4, async (p) => {
    const r = await call(token, `/boards/${board}/texts`, {
      data: { content: `<p>${esc(p.node.info)}</p>` },
      style: { color: "#9ca3af", fontSize: "10" },
      position: { x: p.node.x + p.node.w / 2, y: p.node.y + p.node.h + 20, origin: "center" },
      geometry: { width: p.node.w },
    });
    if (!r.ok) failed += 1;
  });

  // 3b. The note, as a real bordered shape under the card - the canvas draws it
  //     as a box, not as loose text, and on a board a paragraph with no frame
  //     around it reads as someone's stray comment.
  await pool(placed.filter((p) => p.itemId && p.node.note), 4, async (p) => {
    const r = await call(token, `/boards/${board}/shapes`, {
      data: { shape: "rectangle", content: `<p>${esc(p.node.note)}</p>` },
      style: { fillColor: "#ffffff", borderColor: "#111111", color: "#111111", fontSize: "10", textAlign: "left", textAlignVertical: "top" },
      position: { x: p.node.x + p.node.w / 2, y: p.node.y + p.node.h + 60, origin: "center" },
      geometry: { width: p.node.w, height: 70 },
    });
    if (!r.ok) failed += 1;
  });

  // 4. Connectors, bound to the item ids step 1 handed back so Miro re-routes
  //    them itself whenever a shape is dragged.
  const byId = new Map(placed.map((p) => [p.node.id, p.itemId]));
  const wired = scene.edges.filter((e) => byId.get(e.source) && byId.get(e.target));
  await pool(wired, 4, async (e) => {
    const r = await call(token, `/boards/${board}/connectors`, {
      startItem: { id: byId.get(e.source) },
      endItem: { id: byId.get(e.target) },
      ...(e.label ? { captions: [{ content: esc(e.label) }] } : {}),
      shape: e.style?.arrow === "straight" ? "straight" : e.style?.arrow === "curved" ? "curved" : "elbowed",
      style: {
        strokeColor: e.sunset ? SUNSET.border : e.style?.stroke || "#1f2937",
        strokeStyle: e.sunset ? "dashed" : e.style?.bs === "solid" ? "normal" : e.style?.bs || "normal",
        ...(e.style?.bw ? { strokeWidth: String(e.style.bw) } : {}),
      },
    });
    if (!r.ok) failed += 1;
  });

  const created = placed.filter((p) => p.itemId).length;
  // A partial push is still a board worth opening, so it comes back 200 with a
  // count rather than a 500 that says nothing about what landed.
  if (!created) return res.status(502).json({ error: "Miro rejected every shape - check the token and the board" });
  return res.status(200).json({ created, failed, boardUrl: `https://miro.com/app/board/${board}/` });
}
