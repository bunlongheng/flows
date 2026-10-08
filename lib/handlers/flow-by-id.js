import { createHash } from "node:crypto";
import db from "../db.js";
import { authorizeOwner, ownerId } from "../auth-owner.js";
import { rateLimit } from "../rate-limit.js";
import { renderDiagramSvg } from "../render-svg.js";
import { renderDiagramGif, GIF_FRAMES, GIF_WIDTH } from "../render-gif.js";
import { cleanLanes } from "../../src/lanes.js";
import { Resvg } from "@resvg/resvg-js";
import { fontOpts } from "../resvg-fonts.js";
import { renderExcalidraw } from "../export/excalidraw.js";
import { renderDrawio } from "../export/drawio.js";
import { cleanNote, cleanInfo, cleanEdgeLabel } from "../../src/note.js";
import { cleanStyle } from "../../src/style.js";
import { cleanView } from "../../src/view-state.js";
import { defaultIconColors } from "../logo-color.js";
import { okColor } from "../validate-design.js";
import { isBot, readVisit, notifyShareView } from "../share-alert.js";

// How long after its capture the row may still change before the gallery
// tile stops trusting that capture and renders the row instead.
const THUMB_GRACE_MS = 10_000;

// Where a share link lives, for the link Notify puts in the alert.
const APP_URL = (process.env.FLOWS_APP_URL || "https://flows-bheng.vercel.app").replace(/\/$/, "");

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

// Everything the renderer reads out of view_state, as a short stable string.
// It goes in a render's cache key because the picture depends on it while
// updated_at does not move when it changes.
const viewKey = (v) => createHash("sha1").update(JSON.stringify(v ?? null)).digest("hex").slice(0, 10);

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
    // The gallery asks for 1 tile per flow, up to 60 in a load, so tiles have
    // their own bucket: on the shared read budget 3 gallery loads a minute
    // would lock a reader out of every flow.
    const thumb = Boolean(req.query && req.query.format === "thumb");
    const limited = rateLimit(req, thumb ? { key: "thumb", limit: 900, windowMs: 60000 } : { key: "read", limit: 180, windowMs: 60000 });
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfter));
      return res.status(429).json({ error: "Rate limit exceeded" });
    }
    const { rows } = await db.query(
      `SELECT id, title, slug, nodes, edges, type, tags, is_public, locked, edit_locked, description, pattern, difficulty, view_state, thumbnail, thumbnail_at, updated_at, created_at
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
        // The key is the row's last change plus the size asked for: a finished
        // render is kept in flow_renders, so a repeat fetch from any region,
        // and the first fetch after the app warmed it, is a lookup.
        const stamp = Date.parse(rows[0].updated_at) || 0;
        // view_state is part of the PICTURE - notes on or off, the Steps chips,
        // the badge style, the lanes - but a view_state PATCH deliberately does
        // not touch updated_at (toggling a panel is not a new version of the
        // diagram, and it must not reorder the gallery). So the stamp alone
        // froze this key: the owner turned notes off, the row changed, and
        // ?format=gif kept serving the render WITH notes, out of flow_renders
        // and out of any CDN holding the matching ETag. Fingerprint it instead.
        const key = `${stamp}-${viewKey(rows[0].view_state)}-${req.query.w || GIF_WIDTH}-${req.query.frames || GIF_FRAMES}`;
        const kept = await db.query("SELECT bytes FROM flow_renders WHERE flow_id = $1 AND key = $2", [rows[0].id, key]).catch(() => null);
        let gif = kept?.rows?.[0]?.bytes;
        if (!gif) {
          gif = await renderDiagramGif(rows[0].nodes, rows[0].edges, {
            frames: Number(req.query.frames) || undefined,
            width: Number(req.query.w) || undefined,
            start: rows[0].view_state?.start,
            view: rows[0].view_state,
          });
          // Awaited, not fired and forgotten: Vercel freezes the function once
          // the response is sent, and a write still in flight is lost with it.
          await db.query("INSERT INTO flow_renders (flow_id, key, bytes) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [rows[0].id, key, gif])
            .then(() => db.query("DELETE FROM flow_renders WHERE flow_id = $1 AND key NOT LIKE $2", [rows[0].id, `${stamp}-%`]))
            .catch(() => {});
        }
        res.setHeader("Content-Type", "image/gif");
        res.setHeader("Content-Length", String(gif.length));
        // A README hotlinks this, so let a CDN hold it too. The ETag is the
        // same key, so a revalidation of an unchanged diagram costs a header.
        res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
        res.setHeader("ETag", `"${key}"`);
        return res.status(200).send(gif);
      } catch (e) {
        return res.status(500).json({ error: "GIF render failed", detail: String(e && e.message || e) });
      }
    }
    // ?format=thumb -> the gallery tile: the app's last fit-view capture of the
    // real canvas, while the row has not changed since it was taken, else the
    // SVG render below. An MCP or API edit moves updated_at past the capture,
    // so the tile shows the live diagram and not the canvas as it was. The
    // tile URL carries both stamps, so a change is a new address and the
    // browser may keep each one for good. The app's own fit-view save follows
    // its capture by under a second (and an unchanged capture is not sent
    // again), so a capture within THUMB_GRACE_MS of the change still counts.
    // pg hands these columns over as Date objects: compare in milliseconds.
    if (thumb) {
      let type = null, bytes = null;
      const at = (v) => new Date(v || 0).getTime() || 0;
      const fresh = at(rows[0].thumbnail_at) + THUMB_GRACE_MS >= at(rows[0].updated_at);
      const m = fresh ? /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(rows[0].thumbnail || "") : null;
      if (m) {
        type = m[1];
        bytes = Buffer.from(m[2], "base64");
      } else {
        // No capture, or one older than the row: rasterise the SVG render once
        // and keep it on the row, so the next gallery load reads bytes. The SVG
        // itself is not an option here - with its logos inlined a flow can weigh
        // 700 KB, and a gallery of them is 15 MB. The app's real capture
        // replaces this the next time the owner opens the flow.
        try {
          const svg = renderDiagramSvg(rows[0].nodes, rows[0].edges, { start: rows[0].view_state?.start, view: rows[0].view_state });
          // Fit the 2:1 tile: a tall flow is bound by height, a wide one by width.
          const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
          const tall = vb && Number(vb[2]) / Number(vb[1]) > 0.5;
          const fitTo = tall ? { mode: "height", value: 448 } : { mode: "width", value: 896 };
          bytes = Buffer.from(new Resvg(svg, { fitTo, font: fontOpts() }).render().asPng());
          type = "image/png";
          const data = `data:image/png;base64,${bytes.toString("base64")}`;
          // Only over a missing or outdated capture: one the app saved since
          // the row last changed wins.
          db.query("UPDATE flows SET thumbnail = $1, thumbnail_at = now() WHERE id = $2 AND (thumbnail_at IS NULL OR thumbnail_at + ($3 || ' milliseconds')::interval < updated_at)", [data, rows[0].id, String(THUMB_GRACE_MS)]).catch(() => {});
        } catch {
          bytes = null; // fall through to the SVG below
        }
      }
      if (bytes) {
        res.setHeader("Content-Type", type);
        res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
        return res.status(200).send(bytes);
      }
    }
    // ?format=svg -> render the diagram to a self-contained SVG (docs-ready).
    if (thumb || (req.query && (req.query.format === "svg" || req.query.svg === "1")) || /image\/svg/.test(req.headers?.accept || "")) {
      try {
        const svg = renderDiagramSvg(rows[0].nodes, rows[0].edges, { start: rows[0].view_state?.start, view: rows[0].view_state });
        res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
        res.setHeader("Cache-Control", thumb ? "private, max-age=31536000, immutable" : "public, max-age=60");
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
    // ?format=drawio -> the Lucidchart path. Lucid takes its own .lucid format
    // ONLY through an OAuth'd import API, but its File > Import accepts a
    // draw.io file on any account. The same file also opens in draw.io,
    // Confluence and VS Code, so this one format covers four tools.
    if (req.query && req.query.format === "drawio") {
      try {
        const xml = renderDrawio(rows[0].nodes, rows[0].edges);
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${exportName(rows[0])}.drawio"`);
        return res.status(200).send(xml);
      } catch (e) {
        return res.status(500).json({ error: "Draw.io export failed", detail: String(e && e.message || e) });
      }
    }
    // A plain JSON read is the share page loading the flow, so this is the 1
    // place a view is a view: tiles, exports and the card are served above and
    // never count, and neither does the owner's own open or a link-preview
    // crawler. The alert runs after the response, so the reader never waits.
    if (!isBot(req.headers?.["user-agent"]) && !(await authorizeOwner(req))) {
      // The page the visitor opened, not the JSON read behind it.
      const link = `${APP_URL}/?${rows[0].slug ? `name=${encodeURIComponent(rows[0].slug)}` : `id=${rows[0].id}`}`;
      const visit = readVisit(req.headers, { id: rows[0].id, title: rows[0].title, link });
      const run = () => notifyShareView(visit);
      if (req.after) req.after(run); else run();
    }
    // The capture is for the tile route above, not for a JSON reader.
    const { thumbnail: _thumb, ...row } = rows[0];
    return res.status(200).json(row);
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
          ...(n.iconFrame === true ? { iconFrame: true } : {}),
        });
        moved += 1;
      }

      const { rows } = await db.query(
        "UPDATE flows SET nodes = $1, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(await defaultIconColors(merged)), id, ownerId()],
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
        // The format panel's whole payload for a node. cleanStyle is the ONE
        // gate: a style is stored verbatim in jsonb and read straight into a
        // border and a font, so nothing reaches the row that a renderer has not
        // been taught to draw. It returns null for an empty or junk style,
        // which is what clears the key.
        const hasStyle = "style" in n;
        if (!hasNote && !hasInfo && !hasSunset && !hasStyle) continue;
        patches.set(n.id, {
          ...(hasNote ? { note: cleanNote(n.note) } : {}),
          ...(hasInfo ? { info: cleanInfo(n.info) } : {}),
          ...(hasSunset ? { sunset: n.sunset } : {}),
          ...(hasStyle ? { style: cleanStyle(n.style) } : {}),
        });
      }
      if (!patches.size) return res.status(400).json({ error: "notes must be a non-empty array of { id, note?, info?, sunset?, style? }" });
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
        if ("style" in patch) {
          // Sent whole every time, never merged: the panel always knows the
          // node's full look, and merging would make "back to default" - the
          // one thing a reset button has to do - impossible to express.
          if (patch.style) next.style = patch.style;
          else delete next.style;
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

    // A line's look, from the format panel. Deliberately NOT part of the
    // { edges } branch below: that one is a pins patcher, and it wipes every
    // pin it was not sent so a stale client cannot leave a ghost one behind.
    // Folding style in there would mean every badge drag re-sent - or silently
    // dropped - the line's colour. Its own key, merged by edge id, touching
    // nothing else.
    if (Array.isArray(body.edgeStyles)) {
      const styles = new Map();
      for (const e of body.edgeStyles) {
        if (!e || typeof e.id !== "string") continue;
        // The badge text rides this key too: it is the other thing a line
        // carries that is nobody's pin, and the owner edits it in place on the
        // badge. Only the keys present on an entry change.
        const hasStyle = "style" in e;
        const hasLabel = "label" in e;
        if (!hasStyle && !hasLabel) continue;
        styles.set(e.id, {
          ...(hasStyle ? { style: cleanStyle(e.style) } : {}),
          ...(hasLabel ? { label: cleanEdgeLabel(e.label) } : {}),
        });
      }
      if (!styles.size) return res.status(400).json({ error: "edgeStyles must be a non-empty array of { id, style?, label? }" });
      const { rows: cur } = await db.query(
        "SELECT edges FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [id, ownerId()],
      );
      if (cur.length === 0) return res.status(404).json({ error: "Not found" });
      let styled = 0;
      const merged = (cur[0].edges || []).map((e, i) => {
        const key = e.id || `e${i}`;
        if (!styles.has(key)) return e;
        styled += 1;
        const next = { ...e };
        const p = styles.get(key);
        if ("style" in p) { if (p.style) next.style = p.style; else delete next.style; }
        if ("label" in p) { if (p.label) next.label = p.label; else delete next.label; }
        return next;
      });
      const { rows } = await db.query(
        "UPDATE flows SET edges = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(merged), id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, styled });
    }

    // A line the owner deleted on the canvas. Sent as ids so a stale tab cannot
    // take the rest of the edges down with it - the row is filtered, never
    // replaced. Deleting a line is the one edge write that is not a merge.
    if (Array.isArray(body.deleteEdges)) {
      const gone = new Set(body.deleteEdges.filter((x) => typeof x === "string"));
      if (!gone.size) return res.status(400).json({ error: "deleteEdges must be a non-empty array of ids" });
      const { rows: cur } = await db.query(
        "SELECT edges FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
        [id, ownerId()],
      );
      if (cur.length === 0) return res.status(404).json({ error: "Not found" });
      const before = (cur[0].edges || []).length;
      const kept = (cur[0].edges || []).filter((e, i) => !gone.has(e.id || `e${i}`));
      const { rows } = await db.query(
        "UPDATE flows SET edges = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id",
        [JSON.stringify(kept), id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, deleted: before - kept.length });
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
      // The legal panels, badges and the Start rounding all live in
      // src/view-state.js, so this door, the create door and the MCP door
      // cannot drift apart. Why "notes-off" is inverted is documented there.
      const clean = cleanView(v);
      // Swimlanes are configuration, not canvas state: a lanes array here
      // replaces them ([] clears), and a PATCH without one keeps the stored
      // lanes, so the canvas saving a panel or badge can never wipe them.
      const lanes = Array.isArray(v.lanes) ? cleanLanes(v.lanes) : null;
      const { rows } = await db.query(
        "UPDATE flows SET view_state = $1::jsonb || CASE WHEN $4::boolean THEN $5::jsonb ELSE jsonb_strip_nulls(jsonb_build_object('lanes', view_state->'lanes')) END WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id, view_state",
        [JSON.stringify(clean), id, ownerId(), lanes !== null, JSON.stringify(lanes?.length ? { lanes } : {})],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ id: rows[0].id, view_state: rows[0].view_state ?? clean });
    }

    // { thumbnail } - the fit-view capture the app just took of the real canvas,
    // for the gallery tile. A small JPEG data URL; nothing else is accepted.
    if (typeof body.thumbnail === "string") {
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.thumbnail) || body.thumbnail.length > 300000) {
        return res.status(400).json({ error: "thumbnail must be a JPEG data URL under 300 KB" });
      }
      const { rows } = await db.query(
        "UPDATE flows SET thumbnail = $1, thumbnail_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id, thumbnail_at",
        [body.thumbnail, id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    // { locked, edit_locked } - the only way in or out of either lock, and
    // owner session only: an agent can lock through MCP but never unlock.
    // Auth for this branch was already checked above, so this is just the
    // one extra body shape. Either key alone leaves the other lock alone.
    if (typeof body.locked === "boolean" || typeof body.edit_locked === "boolean") {
      const { rows } = await db.query(
        "UPDATE flows SET locked = COALESCE($1, locked), edit_locked = COALESCE($2, edit_locked) WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL RETURNING id, locked, edit_locked",
        [typeof body.locked === "boolean" ? body.locked : null, typeof body.edit_locked === "boolean" ? body.edit_locked : null, id, ownerId()],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(rows[0]);
    }

    const isPublic = typeof body.is_public === "boolean" ? body.is_public : null;
    if (isPublic === null) return res.status(400).json({
        error: "Unrecognised PATCH body",
        shapes: [
          "{ nodes: [{ id, position:{x,y} }] } - MOVES cards only. It never changes an icon, label or colour; those go through the MCP update_flow.",
          "{ notes: [{ id, note?, info?, sunset?, style? }] } - per-card text and look. Only the keys present on an entry change.",
          "{ edgeStyles: [{ id, style?, label? }] } - per-line look and badge text. Only the keys present on an entry change.",
          "{ edges: [{ id, labelT }] } - where the step badge sits along its own line, 0..1.",
          "{ deleteEdges: [id, ...] } - remove lines by id (a line with no id is keyed e0, e1, ... by array position).",
          "{ view_state: { panels?, badge?, start?, lanes? } } - how the diagram opens. This branch REPLACES the object, so send the whole thing; lanes are the exception and are kept when the key is absent.",
          "{ thumbnail: \"data:image/jpeg;base64,...\" } - the gallery tile.",
          "{ locked?: boolean, edit_locked?: boolean } - the owner's 2 locks.",
          "{ is_public: boolean } - visibility.",
        ],
      });
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
        detail: "The owner turned the delete lock on for this flow. Unlock it first, in the app or with PATCH { locked: false } as the owner.",
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
