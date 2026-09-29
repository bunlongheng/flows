import db from "../db.js";
import { authorizeOwner, ownerId } from "../auth-owner.js";
import { rateLimit } from "../rate-limit.js";
import { renderDiagramSvg } from "../render-svg.js";
import { renderDiagramGif } from "../render-gif.js";
import { renderExcalidraw } from "../export/excalidraw.js";
import { cleanNote, cleanInfo } from "../../src/note.js";
import { okColor } from "../validate-design.js";

// GET  /api/flows/:idOrSlug -> public read of a saved artifact (the
//                                  { nodes, edges } the SPA renders). Accepts the
//                                  uuid or the readable slug behind /?name=.
// DELETE /api/flows/:id -> owner-only SOFT delete: stamps deleted_at so
//                                   the row goes to trash and stays recoverable.
//                                   ?purge=1 permanently removes a row that is
//                                   ALREADY in trash (empty-trash).
//                                   Requires the owner's signed-in session
//                                   (sd_session) or local dev; the public create
//                                   Bearer secret cannot delete.
// A download lands in the owner's Downloads folder, so it gets the readable
// slug rather than the uuid. Anything that is not a-z0-9 goes, since this ends
// up in a Content-Disposition header.
const exportName = (row) => String(row.slug || row.title || "flow")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "flow";

export default async function flowById(req, res) {
  const id = (req.query && req.query.id) || (req.params && req.params.id) || null;
  if (!id) return res.status(400).json({ error: "Missing id" });

  // The param is EITHER a uuid or a slug. Slugs exist so a shared link can read
  // as /?name=my-design instead of a uuid, and resolving one has to be a real
  // lookup here - it used to be done by scanning the two list endpoints, but the
  // owner list returns only PRIVATE designs and the public list only the 12
  // curated demos, so a published non-demo design was in neither and its own
  // share link 404'd.
  //
  // Mutations stay uuid-only: a slug changes meaning if a design is renamed, so
  // it is not a safe address to delete or overwrite by.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/i;
  if (!isUuid) {
    if (req.method !== "GET") return res.status(400).json({ error: "Invalid id" });
    if (!SLUG_RE.test(id)) return res.status(400).json({ error: "Invalid id" });
  }
  const KEY = isUuid ? "id" : "slug";

  if (req.method === "GET") {
    const limited = rateLimit(req, { key: "read", limit: 180, windowMs: 60000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfter));
      return res.status(429).json({ error: "Rate limit exceeded" });
    }
    const { rows } = await db.query(
      `SELECT id, title, slug, nodes, edges, type, tags, is_public, locked, description, pattern, difficulty, view_state, created_at
         FROM flows WHERE ${KEY} = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    // Private diagrams are visible only to the owner; hide as 404 otherwise so a
    // private id can't be probed. Only an explicit is_public===false is private
    // (missing/true is public - the column defaults true).
    if (rows[0].is_public === false && !(await authorizeOwner(req))) {
      return res.status(404).json({ error: "Not found" });
    }
    // ?format=gif -> an animated GIF of the diagram with its dots flowing. This
    // is the export an agent or a README can link: <img src="...?format=gif">.
    // The browser's GIF export needs a DOM and an owner session; this needs
    // neither, so anything that can fetch a URL can have one.
    if (req.query && req.query.format === "gif") {
      try {
        const gif = renderDiagramGif(rows[0].nodes, rows[0].edges, {
          frames: Number(req.query.frames) || undefined,
          width: Number(req.query.w) || undefined,
          start: rows[0].view_state?.start,
        });
        res.setHeader("Content-Type", "image/gif");
        res.setHeader("Content-Length", String(gif.length));
        // A README hotlinks this, so let a CDN hold it. A diagram changes rarely
        // and the render is a dozen rasterises - not work to repeat per view.
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        return res.status(200).send(gif);
      } catch (e) {
        return res.status(500).json({ error: "GIF render failed", detail: String(e && e.message || e) });
      }
    }
    // ?format=svg -> render the diagram to a self-contained SVG (docs-ready).
    if ((req.query && (req.query.format === "svg" || req.query.svg === "1")) || /image\/svg/.test(req.headers?.accept || "")) {
      try {
        const svg = renderDiagramSvg(rows[0].nodes, rows[0].edges, { start: rows[0].view_state?.start });
        res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=60");
        return res.status(200).send(svg);
      } catch (e) {
        return res.status(500).json({ error: "SVG render failed", detail: String(e && e.message || e) });
      }
    }
    // ?format=excalidraw -> the diagram as an EDITABLE .excalidraw scene: real
    // shapes, real bound arrows, logos embedded base64 so the file works
    // offline and outlives this app. The svg/gif exports above are pictures;
    // this one can be picked up and kept working on somewhere else.
    if (req.query && req.query.format === "excalidraw") {
      try {
        const scene = renderExcalidraw(rows[0].nodes, rows[0].edges);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${exportName(rows[0])}.excalidraw"`);
        return res.status(200).send(JSON.stringify(scene));
      } catch (e) {
        return res.status(500).json({ error: "Excalidraw export failed", detail: String(e && e.message || e) });
      }
    }
    return res.status(200).json(rows[0]);
  }

  // PATCH -> owner-only: flip is_public (public demo vs private), save the node
  // layout (positions) after the owner rearranges the canvas, OR remember which
  // panel/badge style was open so reopening restores it.
  if (req.method === "PATCH") {
    if (!(await authorizeOwner(req, { allowBearer: false }))) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body || {};

    // Save canvas layout. This takes only the position and size from the client
    // and merges them into the stored node BY ID; icon, label, colour and sub
    // are read from storage and never from the request.
    //
    // It used to replace the whole array with the client's copy. A tab left open
    // across a change therefore wrote its stale nodes back on the next drag - a
    // low-res logo that had just been backfilled away reappeared seven minutes
    // later, with no trace in update_reason, because a layout save is not
    // supposed to touch branding at all.
    if (Array.isArray(body.nodes)) {
      const moves = new Map();
      for (const n of body.nodes) {
        if (!n || typeof n.id !== "string") continue;
        moves.set(n.id, n);
      }
      if (!moves.size) return res.status(400).json({ error: "nodes must be a non-empty array" });

      const { rows: cur } = await db.query(
        "SELECT nodes FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [id, ownerId()],
      );
      if (cur.length === 0) return res.status(404).json({ error: "Not found" });

      const posOf = (n) =>
        n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
          ? { position: { x: n.position.x, y: n.position.y } }
          : null;
      const sizeOf = (n) =>
        n.size && Number.isFinite(n.size.w) && Number.isFinite(n.size.h)
          ? { size: { w: Math.min(600, Math.max(130, Math.round(n.size.w))), h: Math.min(600, Math.max(130, Math.round(n.size.h))) } }
          : null;
      // The icon or photo inside the card, when the owner stretched it.
      const iconSizeOf = (n) =>
        n.iconSize && Number.isFinite(n.iconSize.w) && Number.isFinite(n.iconSize.h)
          ? { iconSize: { w: Math.min(600, Math.max(16, Math.round(n.iconSize.w))), h: Math.min(600, Math.max(16, Math.round(n.iconSize.h))) } }
          : null;

      let moved = 0;
      const merged = (cur[0].nodes || []).map((stored) => {
        const from = moves.get(stored.id);
        if (!from) return stored;
        moves.delete(stored.id);
        const p = posOf(from);
        const s = sizeOf(from);
        const ic = iconSizeOf(from);
        // A double-click reset sends iconSize: null explicitly to clear it -
        // distinct from omitting the field, which leaves the stored value alone.
        const clearIcon = from.iconSize === null;
        if (!p && !s && !ic && !clearIcon) return stored;
        moved += 1;
        const next = { ...stored, ...(p || {}), ...(s || {}), ...(ic || {}) };
        if (clearIcon) delete next.iconSize;
        return next;
      });

      // A node the client has that storage does not is genuinely new, so it is
      // taken whole - that is the only path where the client supplies branding.
      for (const n of moves.values()) {
        merged.push({
          id: n.id,
          ...(posOf(n) || {}),
          ...(sizeOf(n) || {}),
          ...(iconSizeOf(n) || {}),
          ...(typeof n.icon === "string" && n.icon ? { icon: n.icon } : {}),
          ...(typeof n.label === "string" && n.label ? { label: n.label } : {}),
          ...(okColor(n.color) ? { color: n.color } : {}),
          ...(typeof n.sub === "string" && n.sub ? { sub: n.sub } : {}),
          ...(cleanNote(n.note) ? { note: cleanNote(n.note) } : {}),
          ...(cleanInfo(n.info) ? { info: cleanInfo(n.info) } : {}),
          ...(n.sunset === true ? { sunset: true } : {}),
        });
        moved += 1;
      }

      const { rows } = await db.query(
        "UPDATE flows SET nodes = $1, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(merged), id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, saved: moved });
    }

    // A per-node note and/or info, merged BY ID. Only the keys present on an
    // entry change - branding and position are read from storage, and a key
    // left off an entry leaves the stored value for that key alone. An empty
    // string removes the key.
    if (Array.isArray(body.notes)) {
      const patches = new Map();
      for (const n of body.notes) {
        if (!n || typeof n.id !== "string") continue;
        const hasNote = "note" in n;
        const hasInfo = "info" in n;
        const hasSunset = "sunset" in n;
        if (!hasNote && !hasInfo && !hasSunset) continue;
        patches.set(n.id, {
          ...(hasNote ? { note: cleanNote(n.note) } : {}),
          ...(hasInfo ? { info: cleanInfo(n.info) } : {}),
          ...(hasSunset ? { sunset: n.sunset } : {}),
        });
      }
      if (!patches.size) return res.status(400).json({ error: "notes must be a non-empty array of { id, note?, info?, sunset? }" });
      const { rows: cur } = await db.query(
        "SELECT nodes FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [id, ownerId()],
      );
      if (cur.length === 0) return res.status(404).json({ error: "Not found" });
      let noted = 0;
      const merged = (cur[0].nodes || []).map((stored) => {
        const patch = patches.get(stored.id);
        if (!patch) return stored;
        noted += 1;
        const next = { ...stored };
        if ("note" in patch) {
          if (patch.note) next.note = patch.note;
          else delete next.note;
        }
        if ("info" in patch) {
          if (patch.info) next.info = patch.info;
          else delete next.info;
        }
        if ("sunset" in patch) {
          patch.sunset === true ? next.sunset = true : delete next.sunset;
        }
        return next;
      });
      const { rows } = await db.query(
        "UPDATE flows SET nodes = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(merged), id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, noted });
    }

    const SIDES = new Set(["top", "right", "bottom", "left"]);
    // A pinned edge end: which face of the box, and how far along it. Missing or
    // malformed ends fall back to the automatic attach point.
    function cleanEnds(v) {
      if (!v || typeof v !== "object") return null;
      const out = {};
      for (const k of ["s", "t"]) {
        const e = v[k];
        if (!e || typeof e !== "object" || !SIDES.has(e.side) || !Number.isFinite(e.at)) continue;
        out[k] = { side: e.side, at: Math.min(0.95, Math.max(0.05, Number(e.at.toFixed(4)))) };
      }
      return Object.keys(out).length ? out : null;
    }

    // A hand-bent line: how far along the straight run (t) and how far off it
    // (d) the bend point sits. Malformed bends fall back to the automatic path.
    function cleanBend(v) {
      if (!v || typeof v !== "object" || !Number.isFinite(v.t) || !Number.isFinite(v.d)) return null;
      return { t: Math.min(0.9, Math.max(0.1, Number(v.t.toFixed(4)))), d: Math.min(600, Math.max(-600, Number(v.d.toFixed(1)))) };
    }

    // Where the owner slid a step badge to, as a 0..1 distance ALONG its edge.
    // A badge may only move on its own line - parked out on open canvas it stops
    // being obvious which edge it belongs to. Merged BY EDGE ID into the stored
    // edges so a stale client cannot drop labels or endpoints.
    if (Array.isArray(body.edges)) {
      const offsets = new Map();
      for (const e of body.edges) {
        if (!e || typeof e.id !== "string") continue;
        // labelT is a 0..1 distance ALONG the edge, so a badge can only ever
        // slide on its own line. It also survives the nodes moving, which a
        // free dx/dy did not.
        // Bounded away from the ends: t=0 and t=1 sit under the service boxes,
        // where a badge is hidden and cannot be grabbed again.
        const t = e.labelT;
        offsets.set(e.id, {
          t: Number.isFinite(t) ? Math.min(0.88, Math.max(0.12, Number(t.toFixed(4)))) : null,
          ends: cleanEnds(e.ends),
          bend: cleanBend(e.bend),
        });
      }
      const { rows: cur } = await db.query(
        "SELECT edges FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [id, ownerId()],
      );
      if (cur.length === 0) return res.status(404).json({ error: "Not found" });
      const merged = (cur[0].edges || []).map((e, i) => {
        const key = e.id || `e${i}`;
        if (!offsets.has(key)) return e;
        const off = offsets.get(key);
        const rest = { ...e };
        delete rest.labelT;
        delete rest.labelOffset; // legacy free-floating offset, superseded
        delete rest.ends;
        delete rest.bend;
        return {
          ...rest,
          ...(off.t != null ? { labelT: off.t } : {}),
          ...(off.ends ? { ends: off.ends } : {}),
          ...(off.bend ? { bend: off.bend } : {}),
        };
      });
      const { rows } = await db.query(
        "UPDATE flows SET edges = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(merged), id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, moved: merged.filter((e) => e.labelT != null).length });
    }

    // Remember which panel and badge style were open, so reopening this diagram
    // restores it instead of resetting. Small, bounded, and owner-only.
    if (body.view_state && typeof body.view_state === "object") {
      const v = body.view_state;
      // Panels are NOT mutually exclusive - Details and Steps can both be open -
      // so store the whole set. Storing one "winner" meant reopening restored
      // only the panel that happened to win the tie.
      // "notes-off" is stored inverted on purpose: notes show by default, so the
      // absence of a flag has to keep meaning "shown" for every row written
      // before the toggle existed.
      const PANELS = ["steps", "details", "share", "code", "notes-off"];
      const clean = {
        panels: Array.isArray(v.panels) ? PANELS.filter((x) => v.panels.includes(x)) : [],
        badge: ["dark", "silver", "color", "plain"].includes(v.badge) ? v.badge : null,
        // The owner's hand-placed Start pill. Omitted (not nulled) when missing
        // or invalid, so the client sends the whole view_state each time and
        // "absent" is what clears it - there is no old value for this branch to
        // preserve on its own.
        ...(v.start && Number.isFinite(v.start.x) && Number.isFinite(v.start.y)
          ? { start: { x: Math.round(v.start.x), y: Math.round(v.start.y) } }
          : {}),
      };
      const { rows } = await db.query(
        "UPDATE flows SET view_state = $1::jsonb WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(clean), id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, view_state: clean });
    }

    // { locked } - the only way in or out of the lock. Auth for this branch was
    // already checked above, so this is just the one extra body shape.
    if (typeof body.locked === "boolean") {
      const { rows } = await db.query(
        "UPDATE flows SET locked = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id, locked",
        [body.locked, id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    const isPublic = typeof body.is_public === "boolean" ? body.is_public : null;
    if (isPublic === null) return res.status(400).json({ error: "Body must be { is_public: boolean }, { nodes: [...] }, { edges: [...] }, { notes: [{ id, note?, info?, sunset? }] } or { view_state: {...} }" });
    const { rows } = await db.query(
      "UPDATE flows SET is_public = $1 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id, is_public",
      [isPublic, id, ownerId()],
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(rows[0]);
  }

  if (req.method === "DELETE") {
    if (!(await authorizeOwner(req, { allowBearer: false }))) return res.status(401).json({ error: "Unauthorized" });

    // A locked diagram refuses both the soft delete and the purge. Diagrams get
    // embedded in READMEs by URL, and a delete there breaks a page nobody was
    // looking at. Unlocking is a separate PATCH on purpose: the point of the
    // lock is that removing it is a decision, not a slip.
    const { rows: lockRows = [] } = await db.query(
      "SELECT locked FROM flows WHERE id = $1 AND user_id = $2",
      [id, ownerId()],
    );
    if (lockRows[0]?.locked) {
      return res.status(409).json({
        error: "This diagram is locked",
        detail: "It is embedded in a README or Confluence page. Unlock it first: PATCH { locked: false }.",
        locked: true,
      });
    }

    // ?purge=1 empties trash: a permanent delete, and ONLY for a row already in
    // trash. So destroying something takes two deliberate calls, and the first
    // one is always undoable.
    if (req.query?.purge === "1" || req.query?.purge === "true") {
      const { rowCount } = await db.query(
        "DELETE FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL",
        [id, ownerId()],
      );
      return res.status(200).json({ purged: rowCount > 0 });
    }

    const { rowCount } = await db.query(
      "UPDATE flows SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [id, ownerId()],
    );
    return res.status(200).json({ deleted: rowCount > 0, recoverable: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
