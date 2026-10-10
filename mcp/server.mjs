#!/usr/bin/env node
// ─── flows MCP server ────────────────────────────────────────────────
// Exposes the Flows app to any MCP-capable agent (Claude Code, Claude
// Desktop, etc.) so it can discover, read, create, update, and delete the same
// diagrams the web app renders. Talks straight to the shared Postgres via the
// app's own lib/ layer, so anything created here shows up in the app instantly.
//
// Env (from the repo .env): DATABASE_URL, OWNER_USER_ID. Optional:
// FLOWS_APP_URL (default prod) for the shareable links it returns.
import { creationTags } from '../lib/linked.js'
import { renderDiagramSvg } from '../lib/render-svg.js'
import { cleanLanes } from '../src/lanes.js'
import './load-env.mjs' // MUST be first - loads .env before lib/db.js opens the pool
import { readFile } from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import db from '../lib/db.js'
import { listVersions, getVersion, restoreVersion } from '../lib/versions.js'
import { uniqueFlowSlug } from '../lib/slugs.js'
import { titleBase, MIN_BASE_LEN } from '../lib/title-base.js'
import { arrangeNew } from '../lib/arrange.js'
import { ownerId } from '../lib/auth-owner.js'
import { SERVICES } from '../src/services.js'
import { resolveNodeIcons } from '../lib/resolve-icon.js'
import { resolveNodeImages } from '../lib/resolve-image.js'
import { cleanNote, cleanInfo } from '../src/note.js'
import { cleanStyle } from '../src/style.js'
import { PANELS, BADGES, SPEEDS, AMOUNTS, CURRENT_DEFAULT } from '../src/view-state.js'
import { SIZINGS } from '../src/card-size.js'
import { NODE_KEEP, EDGE_KEEP, okBox, roundBox, edgeKey, keepOwnerWork } from '../lib/owner-work.js'
import { validateDesign, okColor } from '../lib/validate-design.js'

// Picture-node loaders available only here: a file path or an AirClips ref can
// only be resolved on THIS machine, so the HTTP API refuses them and points
// callers at the MCP server instead.
const imageLoaders = {
  file: (p) => readFile(p),
  airclips: async (ref) => {
    const base = (process.env.AIRCLIPS_URL || 'http://M4.local:7474').replace(/\/+$/, '')
    const token = process.env.AIRCLIPS_TOKEN
    if (!token) throw new Error('AIRCLIPS_TOKEN not set in .env')
    const headers = { 'x-airclips-token': token }
    let id = ref
    if (ref === 'latest') {
      const r = await fetch(`${base}/api/board`, { headers })
      if (!r.ok) throw new Error(`airclips ${r.status}`)
      const board = await r.json()
      const images = (board.items || []).filter((i) => i.kind === 'image')
      if (!images.length) throw new Error('no image on the AirClips board')
      id = images.reduce((a, b) => (b.created > a.created ? b : a)).id
    }
    const r = await fetch(`${base}/api/item/${id}`, { headers })
    if (!r.ok) throw new Error(`airclips ${r.status}`)
    return Buffer.from(await r.arrayBuffer())
  },
}

const APP_URL = process.env.FLOWS_APP_URL || 'https://flows-bheng.vercel.app'
const urlFor = id => `${APP_URL}/?id=${id}`
// The link to hand to people. It opens for anyone and unfurls with the diagram
// itself (Slack, iMessage) - as long as the design is public.
const shareUrlFor = slug => `${APP_URL}/demo?name=${encodeURIComponent(slug)}`
// The animated embed for a README. w=3200 is the widest render, so it stays
// sharp on a retina screen at any zoom. Public diagrams only.
const gifUrlFor = slug => `${APP_URL}/api/flows/${encodeURIComponent(slug)}?format=gif&w=1800&frames=20`
const readmeFor = (title, slug) => `![${title}](${gifUrlFor(slug)})`
const owner = () => {
  const o = ownerId()
  if (!o) throw new Error('OWNER_USER_ID not configured in .env')
  return o
}
const ok = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })
const fail = msg => ({ isError: true, content: [{ type: 'text', text: msg }] })

// Agents pass nodes as { id, x?, y? }; the app stores { id, position:{x,y} } and
// auto-layouts on open, so positions are a starting hint, not load-bearing.
// HARD RULE: a diagram starts on the LEFT and reads left-to-right. Never from the
// bottom, never right-to-left.
//
// This used to be broken here rather than in the canvas. Omitting x/y did not mean
// "lay it out for me" - it fabricated a 6-column grid BY ARRAY INDEX. Every node
// then had a position, so the app treated the layout as hand-placed and never ran
// its own; a start node late in the array simply landed bottom-right.
//
// Now: no coordinates means no coordinates, and the canvas applies its canonical
// left-to-right layout. Coordinates that would break the rule are dropped whole,
// for the same outcome.
// The look of a card or a line, exactly as the format panel writes it. The legal
// values live in ONE place (src/style.js) and `cleanStyle` is what the API
// validates with, so this takes the object loosely and runs it through the same
// function rather than restating those lists here and drifting from them.
const STYLE_KEYS =
  'stroke #hex, bg #hex or "transparent", bw 1|2|4, bs solid|dashed|dotted, radius 0|12, ' +
  'font sans|serif|mono, fs 12|14|18|24, align left|center|right, arrow step|curved|straight, ' +
  'opacity 0-100 (a line uses only stroke, bw, bs, arrow, opacity). ' +
  'An illegal key or value is dropped, exactly as it is on a save from the canvas.'
// z.record needs BOTH a key and a value type in zod 4. With 1 argument it still
// parses, so nothing fails at runtime - but z.toJSONSchema throws on it, which
// makes tools/list return an error and the whole server look like it has no
// tools. tests/unit/mcp-schema.test.js guards that.
const zStyle = z.record(z.string(), z.unknown()).optional()
const zBox = (lo, hi) => z.object({ w: z.number().min(lo).max(hi), h: z.number().min(lo).max(hi) }).optional()

// Shared by create_flow and update_flow, which carried 2 copies of this and drifted.
const zNodeFields = {
  size: zBox(130, 600).describe('Card size in canvas units, { w, h }, clamped 130-600. Omit for the default 180 x 180 (240 x 225 for a picture node). A note hangs BELOW the card and is not part of this height.'),
  iconSize: zBox(16, 600).describe('Logo tile size inside the card, { w, h }, clamped 16-600. Omit unless a wide wordmark is unreadable at the stock tile.'),
  style: zStyle.describe(`Per-card look: ${STYLE_KEYS} A card with no style draws in its own brand colour, which is almost always what you want - set this only to say something the colour cannot.`),
}
const zEdgeFields = {
  id: z.string().max(60).optional().describe('STABLE id for this line, e.g. "e1". GIVE EVERY EDGE ONE. With no id the identity falls back to the ARRAY INDEX, so inserting a line in the middle silently moves the styling, badge position and step number of every line after it onto the wrong line. It also decides which line of a trunk is the leader that carries the badge (lowest id wins).'),
  style: zStyle.describe(`Per-line look: ${STYLE_KEYS}`),
  async: z.boolean().optional().describe('true fires this line on the same beat as the line numbered before it: the current leaves the card on both lines at once and both targets light together. For a fan-out whose lines do not depend on each other (stream the answer, persist it, emit the usage event). Chain it on consecutive lines to fire 3 or more together. The Steps chips keep their own numbers.'),
}

function toStoredNodes(nodes) {
  const placed = nodes.map((n) => ({
    id: n.id,
    ...(Number.isFinite(n.x) && Number.isFinite(n.y) ? { position: { x: n.x, y: n.y } } : {}),
    // Optional bring-your-own-icon: caller supplies the logo, we just render it.
    ...(n.icon ? { icon: n.icon } : {}),
    ...(n.label ? { label: n.label } : {}),
    ...(okColor(n.color) ? { color: n.color } : {}),
    ...(n.sub ? { sub: n.sub } : {}),
    ...(cleanNote(n.note) ? { note: cleanNote(n.note) } : {}),
    ...(cleanInfo(n.info) ? { info: cleanInfo(n.info) } : {}),
    ...(n.sunset === true ? { sunset: true } : {}),
    ...(n.iconFrame === true ? { iconFrame: true } : {}),
    ...(n.image ? { image: n.image } : {}),
    // The 3 the canvas writes and this used to drop on the floor: a resized
    // card, a stretched logo tile, and the format panel's look.
    ...(okBox(n.size, 130, 600) ? { size: roundBox(n.size) } : {}),
    ...(okBox(n.iconSize, 16, 600) ? { iconSize: roundBox(n.iconSize) } : {}),
    ...(cleanStyle(n.style) ? { style: cleanStyle(n.style) } : {}),
  }))
  return placed
}

// Returns null when the layout is fine, or a reason when it breaks the rule.
// Only a FULLY hand-placed layout is judged - a partial one is auto-laid anyway.
function startLeftViolation(storedNodes, edges) {
  const pos = storedNodes.filter((n) => n.position)
  if (!pos.length || pos.length !== storedNodes.length) return null
  const ids = new Set(storedNodes.map((n) => n.id))
  const incoming = new Set(edges.map((e) => e.target))
  const startId = (edges[0]?.source && ids.has(edges[0].source))
    ? edges[0].source
    : (storedNodes.find((n) => !incoming.has(n.id)) || storedNodes[0]).id
  const start = pos.find((n) => n.id === startId)
  if (!start) return null
  const xs = pos.map((n) => n.position.x)
  const ys = pos.map((n) => n.position.y)
  const minX = Math.min(...xs)
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  // A little slack: leftmost COLUMN, not exactly the smallest x.
  if (start.position.x > minX + 40) return `the start node "${startId}" is not in the leftmost column`
  // Bottom of the leftmost column still reads as "starts at the bottom". Only
  // meaningful when the layout HAS vertical spread - in a single row every node
  // shares one y, which would make the start trivially "lowest".
  if (maxY > minY + 40 && start.position.y >= maxY - 40) return `the start node "${startId}" sits at the bottom`
  return null
}

// Applies the rule: bad coordinates are dropped so the canvas lays the design out
// left-to-right itself.
function enforceStartLeft(storedNodes, edges) {
  const why = startLeftViolation(storedNodes, edges)
  if (!why) return { nodes: storedNodes, warning: null }
  return {
    nodes: storedNodes.map(({ position, ...rest }) => rest),
    warning:
      `Positions were dropped and the diagram was auto-laid out left-to-right, because ${why}. ` +
      `A diagram always starts on the LEFT and reads left-to-right - never from the bottom, never backward. ` +
      `Omit x/y to get that layout for free.`,
  }
}
function toStoredEdges(edges) {
  return edges.map((e, i) => ({
    id: e.id || `e${i + 1}`,
    source: e.source,
    target: e.target,
    ...(e.label ? { label: e.label } : {}),
    ...(e.description ? { description: String(e.description).trim().slice(0, 300) } : {}),
    ...(cleanStyle(e.style) ? { style: cleanStyle(e.style) } : {}),
    ...(e.async === true ? { async: true } : {}),
  }))
}

// HARD GATE, shared with the API and AI generate (lib/validate-design.js): every
// node renders a real logo, icons are well-formed, and the size caps hold.
// Returns an error result, or null if OK.
const logoGate = (nodes, edges = [], lanes = null) => {
  const invalid = validateDesign({ nodes, edges, lanes: Array.isArray(lanes) ? lanes : null })
  return invalid
    ? fail(`Rejected: ${invalid.error}${invalid.unresolved ? ' Call list_services for valid ids.' : ''}`)
    : null
}

// The most recent OTHER diagram (last 7 days) whose title shares this one's base.
async function similarRecent(userId, title, excludeId) {
  const base = titleBase(title)
  if (base.length < MIN_BASE_LEN) return null // too generic to accuse anything
  const { rows } = await db.query(
    `SELECT id, title, created_at FROM flows
     WHERE user_id = $1 AND id <> $2 AND deleted_at IS NULL
       AND created_at > now() - interval '7 days'
     ORDER BY created_at DESC LIMIT 40`,
    [userId, excludeId],
  )
  const hit = rows.find(r => titleBase(r.title) === base)
  if (!hit) return null
  const mins = Math.round((Date.now() - new Date(hit.created_at).getTime()) / 60000)
  const age = mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`
  return { id: hit.id, title: hit.title, age }
}

const server = new McpServer({ name: 'flows', version: '1.0.0' })

// ── Discover: how many diagrams, and their shape ────────────────────────────
server.registerTool(
  'list_flows',
  {
    title: 'List flows',
    description: "List all of the owner's saved flows diagrams (newest first) with their id, title, node/edge counts, and shareable URL.",
    inputSchema: {},
  },
  async () => {
    try {
      const { rows } = await db.query(
        'SELECT id, title, slug, nodes, edges, locked, edit_locked, created_at FROM flows WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200',
        [owner()],
      )
      return ok({
        count: rows.length,
        designs: rows.map(r => ({
          id: r.id, title: r.title, slug: r.slug,
          nodes: r.nodes?.length ?? 0, edges: r.edges?.length ?? 0,
          locked: !!r.locked, edit_locked: !!r.edit_locked,
          created_at: r.created_at, url: urlFor(r.id),
        })),
      })
    } catch (e) { return fail(`list failed: ${e.message}`) }
  },
)

// ── Read one diagram in full ────────────────────────────────────────────────
server.registerTool(
  'get_flow',
  {
    title: 'Get flow',
    description: 'Fetch one diagram by id, returning its full title, nodes, and edges (the exact structure the app renders).',
    inputSchema: { id: z.string().describe('The diagram id (uuid) from list_flows') },
  },
  async ({ id }) => {
    try {
      const { rows } = await db.query('SELECT id, title, slug, nodes, edges, locked, edit_locked, created_at FROM flows WHERE id = $1 AND deleted_at IS NULL', [id])
      if (!rows.length) return fail(`No diagram with id ${id}`)
      return ok({ ...rows[0], url: urlFor(id), share_url: shareUrlFor(rows[0].slug), gif_url: gifUrlFor(rows[0].slug), readme: readmeFor(rows[0].title, rows[0].slug) })
    } catch (e) { return fail(`get failed: ${e.message}`) }
  },
)

// ── Create ──────────────────────────────────────────────────────────────────
server.registerTool(
  'create_flow',
  {
    title: 'Create flow',
    description: "Create a new diagram. Provide a title, nodes, and edges connecting node ids. Each node is EITHER a known catalog service (call list_services), OR a bring-your-own node with a custom `icon` (a remote https logo URL, a data:image URI, or a /path) plus a `label`, or a picture node (`image`). Remote https icons are fetched and inlined once so the diagram stays self-contained. Positions are optional (the app auto-layouts). Returns the new id and URL.",
    inputSchema: {
      title: z.string().describe('Descriptive title, e.g. "URL Shortener - Tier 1"'),
      nodes: z.array(z.object({
        id: z.string().describe('A known service key (e.g. "lambda","dynamo","cyclr","hubspot"), or any unique id when bringing your own icon'),
        x: z.number().optional().describe('Optional. OMIT x/y and the canvas lays the design out left-to-right for you - that is the wanted look.'),
        y: z.number().optional(),
        icon: z.string().optional().describe('Bring-your-own logo: a remote https image URL, a data:image URI, or a same-origin /path, at least 96px on each side (never a favicon). IGNORED when id is a catalog service - the catalog logo always wins, so omit it there.'),
        image: z.string().optional().describe('Make this a picture node: a screenshot or photo shown at 4:3 inside the card and in every export. Accepts an absolute file path on this machine (/Users/you/shot.png), an https image URL, a data:image/...;base64 URI, or airclips:<id> / airclips:latest (newest image on the AirClips board; needs AIRCLIPS_URL and AIRCLIPS_TOKEN in .env). Resized to 640x480 cover and stored in the diagram. Give the node a label; its id can be anything unique.'),
        label: z.string().optional().describe('Display name (required with a custom icon), e.g. "HubSpot"'),
        sub: z.string().optional().describe('Small subtitle under the label, e.g. "CRM"'),
        color: z.string().optional().describe('Brand hex color for the node border/tint, e.g. "#FF7A59"'),
        note: z.string().max(400).optional().describe('Note shown under this node (bottom-left, black text in a black frame) in the app, on every shared link and in the SVG. Light markdown: **bold**, *italic*, __underline__, ~~strike~~, `code`, 1 level. A URL becomes a blue link showing its ticket key (SHAR-7977) or its bare address. 1-2 sentences on what this step does or why it is there, e.g. "Reads the account\'s Recurly subscriptions, looks the user up in MBD, branches per app."'),
        info: z.string().max(600).optional().describe('What this thing is and why it is in this diagram, 1-3 sentences. Hidden in the app until the reader hovers or clicks the i badge on the card (1 open at a time), so it never crowds the diagram; not in the SVG. Shown as "<card name> is <text>", so write it to read after "is". Different from note, which is always visible under the card.'),
        sunset: z.boolean().optional().describe('true marks a node that is today\'s path and gets decommissioned. Drawn light silver and dimmed, icon in greyscale, the red X on the badge of every edge into it, and every edge touching it (in or out) light silver, immune to any line style; no X on the card. Silver is reserved for this state: never paint a node grey or silver, set sunset instead.'),
        iconFrame: z.boolean().optional().describe('true draws a 1 px grey frame around the icon tile. Set by itself when most of a PNG icon\'s outer ring is white (a white tile on a white card has no edge); pass it to force or, with false, to skip.'),
        ...zNodeFields,
      })).min(1).describe('The services in the diagram'),
      edges: z.array(z.object({
        source: z.string().describe('source node id'),
        target: z.string().describe('target node id, or "lane:<id>" to end the line on a swimlane border (1 end per edge, never both)'),
        label: z.string().optional().describe('short edge label, e.g. "read/write"'),
        description: z.string().max(300).optional().describe('Longer text for this line, max 300. The tag on the line reads the label, or this cut short when there is no label; hovering the tag shows the whole of it. Not in the SVG.'),
        ...zEdgeFields,
      })).default([]).describe('Directed connections between node ids, IN FLOW ORDER. This order is the diagram: it numbers the Steps badges 1..N and it is the path the single current walks, 1 line at a time. Order the array the way a reader should read the diagram.'),
      pattern: z.string().max(200).optional().describe('The one-line "what it tests" shown above the diagram and on the share card, e.g. "Read-heavy KV lookup: cache-first redirects"'),
      description: z.string().max(600).optional().describe('The goal paragraph shown under the pattern, 1-3 sentences on what the design is for.'),
      public: z.boolean().optional().describe('Default true: anyone with the link can open it and the link unfurls with the diagram. false keeps it private (owner only; recipients get a 404 and a generic preview card).'),
      source: z.string().max(40).optional().describe('Who is asking. "repo-audit" means a repo audit or recon: the diagram is RENDERED, NEVER STORED - the response carries the svg to embed in the report and no row is created. Always pass it from /repo-audit.'),
      store: z.boolean().optional().describe('false renders the svg and stores nothing, for any caller that only needs the picture.'),
      lanes: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,32}$/), title: z.string().max(40), x: z.number().optional(), w: z.number().min(80).optional(), y: z.number().optional(), h: z.number().min(80).optional(), color: z.string().optional(), size: z.number().int().min(10).max(40).optional() })).max(12).optional().describe('Swimlanes for a render-only call (columns x/w or rows y/h), since there is no row to update_flow afterwards.'),
      linked: z.boolean().optional().describe('true lists the diagram under the gallery\'s Linked tab (README, PR, repo audit) instead of My Diagrams, so the owner\'s daily list stays their own work. A title that starts with owner/repo is Linked on its own; false keeps it out.'),
    },
  },
  async ({ title, nodes, edges, pattern, description, public: isPublic = true, linked, source, store, lanes }) => {
    try {
      const gate = logoGate(nodes, edges, lanes)
      if (gate) return gate
      const { nodes: iconNodes, failed } = await resolveNodeIcons(nodes)
      if (failed.length) return fail(`Could not fetch the remote icon for node(s): ${failed.join(', ')}. Use an https image URL that returns image/* under 24KB (no redirects), or inline a data:image URI.`)
      const im = await resolveNodeImages(iconNodes, imageLoaders)
      if (im.failed.length) return fail(`Could not load the image for node(s): ${im.failed.map(f => `${f.id} (${f.reason})`).join(', ')}.`)
      const o = owner()
      const slug = await uniqueFlowSlug(o, title)
      const storedEdges = toStoredEdges(edges)
      const enforced = enforceStartLeft(toStoredNodes(im.nodes), storedEdges)
      // Born arranged: a new diagram gets the same layout the Arrange button
      // produces, so it never lands on the canvas crammed.
      const storedNodes = arrangeNew(enforced.nodes, storedEdges)
      // A repo audit gets a picture, never a row (owner rule 2026-10-04).
      if (source === 'repo-audit' || store === false) {
        const clean = cleanLanes(lanes || [])
        const svg = renderDiagramSvg(storedNodes, storedEdges, { view: clean.length ? { lanes: clean } : {} })
        return ok({ stored: false, source: source || 'render-only', svg, note: 'Nothing was stored. Embed the svg where the report lives; there is no id, url or gif.' })
      }
      const { rows } = await db.query(
        'INSERT INTO flows (user_id, title, slug, nodes, edges, type, tags, is_public, pattern, description) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::text[],$8,$9,$10) RETURNING id',
        [o, title.trim(), slug, JSON.stringify(storedNodes), JSON.stringify(storedEdges), 'flow', creationTags('MCP', title, linked), isPublic, pattern?.trim() || null, description?.trim() || null],
      )
      const id = rows[0].id

      // Version-spam guard. An agent that has lost the id of a diagram it just
      // made tends to create "... v2", then "v2.1", then "v2.2" instead of
      // editing. The row is still created (never block the caller), but the
      // response points at the diagram it almost certainly meant to update.
      const near = await similarRecent(o, title, id)
      return ok({
        id,
        url: urlFor(id),
        share_url: shareUrlFor(slug),
        gif_url: gifUrlFor(slug),
        readme: readmeFor(title.trim(), slug),
        visibility: isPublic ? 'public' : 'private',
        ...(isPublic ? {} : { share_note: 'Private: recipients get a 404 and Slack shows the generic site card. Call update_flow with public: true before sending the link.' }),
        ...(enforced.warning ? { layout: enforced.warning } : {}),
        ...(near ? {
          warning:
            `A diagram named "${near.title}" (id ${near.id}) was created ${near.age} and looks like the same thing ` +
            `under a different version suffix. If this was meant to be a revision, call update_flow on ` +
            `${near.id} and then delete_flow on ${id} - do not keep making v2, v2.1, v2.2.`,
          probably_update: near.id,
        } : {}),
      })
    } catch (e) { return fail(`create failed: ${e.message}`) }
  },
)

// ── Update (modify title / nodes / edges) ───────────────────────────────────
server.registerTool(
  'update_flow',
  {
    title: 'Update flow',
    description:
      'Modify an existing diagram by id, at any age. Any of title, nodes, or edges you provide replaces that field; ' +
      'omitted fields are left unchanged. ALWAYS prefer this over creating a "v2" of a diagram that already exists - ' +
      'call list_flows to find the id. Backfilling or correcting old diagrams is exactly what this is for. ' +
      'Every update is kept in history (list_versions / restore_version), so a mistaken rewrite can be pulled back. ' +
      'Prefer this over create_flow whenever the diagram already exists: alter it in place, do not make a v2. ' +
      'Refused only while the owner has turned the edit lock on for this flow, in the app - see lock_flow.',
    inputSchema: {
      id: z.string().describe('The diagram id to update'),
      reason: z.string().optional().describe('Optional note on why, e.g. "backfill: correct the Integry decommission date". Recorded on the row as a trail; never required.'),
      title: z.string().optional(),
      nodes: z.array(z.object({
        id: z.string(), x: z.number().optional(), y: z.number().optional(),
        icon: z.string().optional().describe('Bring-your-own logo: https URL, data:image URI, or /path, at least 96px on each side. IGNORED when id is a catalog service.'),
        image: z.string().optional().describe('Make this a picture node: a screenshot or photo shown at 4:3 inside the card and in every export. Accepts an absolute file path on this machine (/Users/you/shot.png), an https image URL, a data:image/...;base64 URI, or airclips:<id> / airclips:latest (newest image on the AirClips board; needs AIRCLIPS_URL and AIRCLIPS_TOKEN in .env). Resized to 640x480 cover and stored in the diagram. Give the node a label; its id can be anything unique.'),
        label: z.string().optional(), sub: z.string().optional(), color: z.string().optional(),
        note: z.string().max(400).optional().describe('Note under the node, light markdown and links as in create_flow. Omit to leave a node without one.'),
        info: z.string().max(600).optional().describe('What this thing is and why it is in this diagram, 1-3 sentences. Hidden in the app until the reader hovers or clicks the i badge on the card (1 open at a time), so it never crowds the diagram; not in the SVG. Shown as "<card name> is <text>", so write it to read after "is". Different from note, which is always visible under the card.'),
        sunset: z.boolean().optional().describe('true marks a node that is today\'s path and gets decommissioned. Drawn light silver and dimmed, icon in greyscale, the red X on the badge of every edge into it, and every edge touching it (in or out) light silver, immune to any line style; no X on the card. Silver is reserved for this state: never paint a node grey or silver, set sunset instead.'),
        iconFrame: z.boolean().optional().describe('true draws a 1 px grey frame around the icon tile. Set by itself when most of a PNG icon\'s outer ring is white (a white tile on a white card has no edge); pass it to force or, with false, to skip.'),
        ...zNodeFields,
      })).optional().describe('Replaces the whole list. A card you leave out is GONE, so send every node, not only the changed one. Anything the owner set by hand that you omit (size, iconSize, style) is carried over from the stored card rather than wiped.'),
      edges: z.array(z.object({
        source: z.string(), target: z.string().describe('target node id, or "lane:<id>" to end the line on a swimlane border (1 end per edge, never both)'), label: z.string().optional(),
        description: z.string().max(300).optional(),
        ...zEdgeFields,
      })).optional().describe('Replaces the whole list, in flow order - that order numbers the Steps badges and is the path the single current walks. Give every line a stable id: the owner\'s styling, dragged badge position and hand bends are matched back to it by id, and without one they are matched by array index instead.'),
      public: z.boolean().optional().describe('true publishes (anyone with the link can open it, real preview card); false makes it private again. Omit to leave visibility alone.'),
      view: z.object({
        panels: z.array(z.enum(PANELS)).optional()
          .describe('Which reading aids the diagram OPENS with. "steps" prints a numbered chip on every line, 1..N in edges order - turn it on for anything a reader has to follow in order. "notes-off" HIDES the notes, which show by default, so the key is inverted on purpose. Replaces the whole list; [] is the plain canvas.'),
        badge: z.enum(BADGES).optional().describe('How a step chip is painted. Omit for dark.'),
        current: z.object({
          speed: z.union(SPEEDS.map((n) => z.literal(n))).optional().describe(`How fast the current runs: ${SPEEDS.join(', ')}. 1x crosses 1 line in 1.4 s, 2x is the cap (faster is a blur) and 0.5x is for watching a dense map. Omit for ${CURRENT_DEFAULT.speed}x.`),
          amount: z.union(AMOUNTS.map((n) => z.literal(n))).optional().describe(`How many small dots the WHOLE diagram carries: ${AMOUNTS.join(', ')}. A total, not a count per line, so it reads the same on a 6 line flow and a 50 line map. Omit for ${CURRENT_DEFAULT.amount}.`),
        }).optional().describe('The flowing current: its speed and how many small dots it carries. PER DIAGRAM - the owner sets it by clicking the Start here pill, and it travels with this diagram into its SVG and GIF exports. Both keys are presets; anything else is refused.'),
        sizing: z.enum(SIZINGS).optional().describe('How big the cards draw, for the WHOLE diagram (canvas and exports): "match" every card the default square, "auto" 10% bigger per line in or out past the first (up to 1.5x), "custom" the hand sizes in each node `size`. Omit to leave it; a row without it reads as custom when any node has a size, else match.'),
      }).optional().describe('How the diagram opens, saved with it. Only the keys you send change; the owner\'s lanes and hand-placed Start pill are kept. Use it to ship a diagram already readable instead of leaving the reader to find the Steps button.'),
      lanes: z.array(z.object({
        id: z.string().regex(/^[\w-]{1,40}$/), title: z.string().max(40),
        y: z.number().optional(), h: z.number().min(80).optional(), x: z.number().optional(), w: z.number().min(80).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex ink for the band and its title, e.g. #B464DC. Omit for the default slate.'),
        size: z.number().int().min(10).max(40).optional().describe('Title size in px, 10 to 40. Omit for 13.'),
        len: z.number().min(80).optional().describe('A plain lane\'s length along its band, dragged by the owner. Send back what get_flow returned.'),
        lead: z.number().optional().describe('Room the owner dragged in before a lane\'s first card (its left edge in a row lane; negative pulls it in). Send back what get_flow returned.'),
        depth: z.number().min(80).optional().describe('A plain lane\'s thickness, dragged by the owner (its bottom edge in a row lane). Send back what get_flow returned.'),
        sections: z.array(z.object({
          id: z.string().regex(/^[\w-]{1,40}$/), title: z.string().max(40),
          at: z.number().describe('Where this section STARTS on the lane\'s OTHER axis: x in a row lane, y in a column one. The section before it ends 40 px short of this, the same gap that separates 2 lanes, so leave room: put this 140 px past the last card of the section before (100 px of padding plus the 40 px gap). The first section always starts at the band edge whatever this says.'),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex ink for this section only. Omit to take the lane colour.'),
          w: z.number().min(80).optional(), h: z.number().min(80).optional(), lead: z.number().min(-24).optional(),
        }).describe('w / h / lead: a size or leading-edge room the owner dragged on the canvas; it wins over the auto fit. Send back what get_flow returned, never invent one.')).min(2).max(8).optional().describe('Split this 1 band into 2 to 8 sections side by side, each drawn as a band of its own with its own title and tint and a 40 px gap between them, instead of stacking 2 lanes. A split lane draws no band of its own: the sections are the bands and they carry the titles.'),
      })).max(12).optional().describe('Swimlanes: bands under the cards, 1 per layer. Rows { id, title, y, h, color? } for a top-down layout, columns { id, title, x, w, color? } for a left-to-right one; 1 kind per diagram, in canvas units (a card is 180 x 180, a picture card 240 x 225, plus its note below). A lane may carry sections to split its band into 2 to 8 titled bands across its other axis, 40 px apart. Replaces the whole list; [] removes every lane; omit to leave lanes alone. Lanes pack from the first one with equal 40 px gaps. With lanes on, the Start pill is not drawn.'),
    },
  },
  async ({ id, reason, title, nodes, edges, public: isPublic, lanes, view }) => {
    try {
      // A flow is open to agents unless the owner has edit-locked it, in the app.
      const { rows: gate } = await db.query('SELECT edit_locked FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, owner()])
      if (!gate.length) return fail(`No owned diagram with id ${id} (it may be in trash - call list_trash)`)
      if (gate[0].edit_locked) return fail(`Diagram ${id} is edit-locked: the owner turned the edit lock on for it in the app. Ask the owner to lift it; you cannot unlock it from here.`)
      let iconNodes = nodes
      if (nodes) {
        const gate = logoGate(nodes, edges || [], lanes); if (gate) return gate
        const r = await resolveNodeIcons(nodes)
        if (r.failed.length) return fail(`Could not fetch the remote icon for node(s): ${r.failed.join(', ')}.`)
        const im = await resolveNodeImages(r.nodes, imageLoaders)
        if (im.failed.length) return fail(`Could not load the image for node(s): ${im.failed.map(f => `${f.id} (${f.reason})`).join(', ')}.`)
        iconNodes = im.nodes
      }

      // No age gate. Any diagram is editable at any time - backfilling and
      // correcting old work is the point of this tool, and a time limit only
      // pushed agents into making a "v2" instead. `reason` stays optional and is
      // recorded when given, as a trail rather than a toll.
      // Read the row BEFORE replacing it, so the owner's hand work survives a
      // caller that only meant to fix a label (see keepOwnerWork).
      const { rows: before } = await db.query(
        'SELECT nodes, edges FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [id, owner()],
      )
      const wasNodes = before[0]?.nodes || []
      const wasEdges = before[0]?.edges || []
      const keptEdges = edges ? keepOwnerWork(toStoredEdges(edges), wasEdges, EDGE_KEEP, edgeKey) : null
      const nextEdges = keptEdges ? JSON.stringify(keptEdges) : null
      let layoutWarning = null
      let nextNodes = null
      if (iconNodes) {
        const kept = keepOwnerWork(toStoredNodes(iconNodes), wasNodes, NODE_KEEP, n => n.id)
        const e = enforceStartLeft(kept, keptEdges || [])
        layoutWarning = e.warning
        nextNodes = JSON.stringify(e.nodes)
      }

      const { rows } = await db.query(
        `UPDATE flows SET
           title = COALESCE($2, title),
           nodes = COALESCE($3::jsonb, nodes),
           edges = COALESCE($4::jsonb, edges),
           update_reason = COALESCE($5, update_reason),
           is_public = COALESCE($7, is_public),
           thumbnail = CASE WHEN $3::jsonb IS NULL AND $4::jsonb IS NULL THEN thumbnail END,
           updated_at = now()
         WHERE id = $1 AND user_id = $6 AND deleted_at IS NULL RETURNING id, slug, title, is_public`,
        [id, title?.trim() ?? null, nextNodes, nextEdges, reason?.trim() ?? null, owner(), isPublic ?? null],
      )
      if (!rows.length) return fail(`No owned diagram with id ${id} (it may be in trash - call list_trash)`)
      // lanes and view both live in view_state, so they merge key by key: what
      // the caller states is written, everything else on the row stands. The
      // API's own PATCH (lib/handlers/flow-by-id.js) replaces the object, which
      // is right for the canvas (it sends the whole thing) and wrong here.
      const patch = {}
      if (lanes) Object.assign(patch, cleanLanes(lanes).length ? { lanes: cleanLanes(lanes) } : {})
      if (view?.panels) patch.panels = view.panels
      if (view?.badge) patch.badge = view.badge
      if (view?.current) patch.current = { ...CURRENT_DEFAULT, ...view.current }
      if (view?.sizing) patch.sizing = view.sizing
      if (lanes || view) {
        await db.query(
          `UPDATE flows SET view_state =
             (COALESCE(view_state, '{}'::jsonb) - ($4::text[])) || $2::jsonb
           WHERE id = $1 AND user_id = $3 AND deleted_at IS NULL`,
          [id, JSON.stringify(patch), owner(), [...(lanes ? ['lanes'] : []), ...(view?.panels ? ['panels'] : []), ...(view?.badge ? ['badge'] : []), ...(view?.current ? ['current'] : []), ...(view?.sizing ? ['sizing'] : [])]],
        )
      }
      return ok({
        id,
        url: urlFor(id),
        share_url: shareUrlFor(rows[0].slug),
        gif_url: gifUrlFor(rows[0].slug),
        readme: readmeFor(rows[0].title, rows[0].slug),
        visibility: rows[0].is_public ? 'public' : 'private',
        updated: { title: title != null, nodes: nodes != null, edges: edges != null, public: isPublic != null, lanes: lanes != null, view: view != null },
        ...(layoutWarning ? { layout: layoutWarning } : {}),
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      })
    } catch (e) { return fail(`update failed: ${e.message}`) }
  },
)

// ── Lock: refuse content changes on a diagram a README or Confluence page ──
// embeds, so an agent (or the app) cannot break that link by editing or
// deleting it out from under the page that points at it.
server.registerTool(
  'lock_flow',
  {
    title: 'Lock flow',
    description:
      'Both locks are off on a new flow, and the owner turns one on for a flow that must not change. The delete lock (locked) makes delete_flow refuse it; the edit lock ' +
      '(edit_locked) makes update_flow and restore_version refuse it. This tool can only turn a lock ON; only the ' +
      'owner turns one off, in the app. If you need to edit or trash a locked flow, stop and ask the owner to unlock it.',
    inputSchema: { id: z.string(), locked: z.boolean().optional(), edit_locked: z.boolean().optional() },
  },
  async ({ id, locked, edit_locked }) => {
    if (locked === false || edit_locked === false) return fail('Only the owner unlocks a flow, in the app. Ask them to lift the lock, then try again.')
    if (locked !== true && edit_locked !== true) return fail('Pass locked: true and/or edit_locked: true.')
    try {
      const { rows } = await db.query(
        'UPDATE flows SET locked = locked OR $1, edit_locked = edit_locked OR $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL RETURNING id, title, locked, edit_locked',
        [locked === true, edit_locked === true, id, owner()],
      )
      if (!rows.length) return fail(`No owned diagram with id ${id}`)
      return ok({ id, title: rows[0].title, locked: rows[0].locked, edit_locked: rows[0].edit_locked })
    } catch (e) { return fail(`lock failed: ${e.message}`) }
  },
)

// ── Delete / restore ────────────────────────────────────────────────────────
// Delete is SOFT: the row is stamped deleted_at and drops out of every list,
// gallery and shared link, but it is kept. Cleaning up a batch of duplicates is
// therefore always reversible, which is the whole point of doing it in bulk.
server.registerTool(
  'delete_flow',
  {
    title: 'Delete flow',
    description:
      'Move a diagram to trash by id. This is a soft delete - it disappears from the gallery, the demo list and any ' +
      'shared link, but the row is kept and restore_flow can bring it back. Safe for cleaning up duplicates. ' +
      'Refused only on a delete-locked diagram, which is the handful the owner locked in the app - see lock_flow.',
    inputSchema: {
      id: z.string().describe('The diagram id to move to trash'),
      reason: z.string().optional().describe('Why it is being removed, e.g. "duplicate of v2.2". Recorded on the row.'),
    },
  },
  async ({ id, reason }) => {
    try {
      const { rows: lockRows } = await db.query(
        'SELECT locked FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [id, owner()],
      )
      if (lockRows[0]?.locked) {
        return fail(`Diagram ${id} is locked against delete: the owner turned the delete lock on for it in the app. Ask the owner; you cannot unlock it from here.`)
      }

      const { rows } = await db.query(
        `UPDATE flows SET deleted_at = now(), update_reason = COALESCE($3, update_reason)
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id, title`,
        [id, owner(), reason?.trim() ?? null],
      )
      if (!rows.length) return fail(`No owned, un-trashed diagram with id ${id}`)
      return ok({ trashed: id, title: rows[0].title, recoverable: true, restore_with: 'restore_flow' })
    } catch (e) { return fail(`delete failed: ${e.message}`) }
  },
)

server.registerTool(
  'restore_flow',
  {
    title: 'Restore flow',
    description: 'Bring a trashed diagram back by id. Call list_trash to see what is in there.',
    inputSchema: { id: z.string().describe('The diagram id to restore from trash') },
  },
  async ({ id }) => {
    try {
      const { rows } = await db.query(
        'UPDATE flows SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL RETURNING id, title',
        [id, owner()],
      )
      if (!rows.length) return fail(`No trashed diagram with id ${id}`)
      return ok({ restored: id, title: rows[0].title, url: urlFor(id) })
    } catch (e) { return fail(`restore failed: ${e.message}`) }
  },
)

// ── Version history ─────────────────────────────────────────────────────────
// A version holds the diagram state from BEFORE the write named by that
// write's `reason`, so restoring it undoes that write. Restores are versioned
// too. Layout-only saves are coalesced to once per 10 minutes; content
// changes are always kept. 50 versions per flow.
server.registerTool(
  'list_versions',
  {
    title: 'List versions',
    description:
      'History for one diagram, newest first: every content change and each burst of layout saves is kept. Use it ' +
      'after an update_flow you regret, then restore_version with the version id you want back. The reason you ' +
      'passed to update_flow shows up on the version it replaced.',
    inputSchema: { id: z.string().describe('The diagram id') },
  },
  async ({ id }) => {
    try {
      const versions = await listVersions(id, owner())
      if (versions === null) return fail(`No owned diagram with id ${id}`)
      return ok({
        id,
        url: urlFor(id),
        versions: versions.map(v => ({ ...v, saved_at: new Date(v.saved_at).toISOString() })),
      })
    } catch (e) { return fail(`list_versions failed: ${e.message}`) }
  },
)

server.registerTool(
  'get_version',
  {
    title: 'Get version',
    description: 'The full state of one version from list_versions: nodes, edges, pattern, description, view_state, plus the summary fields.',
    inputSchema: {
      id: z.string().describe('The diagram id'),
      version_id: z.string().describe('The version id from list_versions'),
    },
  },
  async ({ id, version_id }) => {
    try {
      const version = await getVersion(id, owner(), version_id)
      if (version === null) return fail(`No version ${version_id} on diagram ${id} (or you don't own it)`)
      return ok({ ...version, saved_at: new Date(version.saved_at).toISOString() })
    } catch (e) { return fail(`get_version failed: ${e.message}`) }
  },
)

server.registerTool(
  'restore_version',
  {
    title: 'Restore version',
    description:
      'Puts that version back as the live diagram. The current one is kept in history so this is always safe to ' +
      'undo - restore_version again with the id list_versions shows for right before this call.',
    inputSchema: {
      id: z.string().describe('The diagram id'),
      version_id: z.string().describe('The version id from list_versions'),
    },
  },
  async ({ id, version_id }) => {
    try {
      const result = await restoreVersion(id, owner(), version_id, { agent: true })
      if (result === null) return fail(`No version ${version_id} on diagram ${id} (or you don't own it)`)
      if (result.locked) {
        return fail(`Diagram ${id} is edit-locked: the owner turned the edit lock on for it in the app. A restore is an edit. Ask the owner; you cannot unlock it from here.`)
      }
      return ok({ id, url: urlFor(id), ...result })
    } catch (e) { return fail(`restore_version failed: ${e.message}`) }
  },
)

server.registerTool(
  'purge_flow',
  {
    title: 'Purge flow (permanent)',
    description:
      'PERMANENTLY delete a diagram that is already in trash. This cannot be undone. A live diagram must be moved to ' +
      'trash with delete_flow first, so destroying anything always takes two deliberate steps.',
    inputSchema: { id: z.string().describe('The id of a TRASHED diagram to destroy permanently') },
  },
  async ({ id }) => {
    try {
      const { rowCount } = await db.query(
        'DELETE FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
        [id, owner()],
      )
      if (!rowCount) return fail(`No TRASHED diagram with id ${id} - call delete_flow first, or list_trash to check`)
      return ok({ purged: id, permanent: true })
    } catch (e) { return fail(`purge failed: ${e.message}`) }
  },
)

server.registerTool(
  'list_trash',
  {
    title: 'List trashed flows',
    description: "Everything the owner has moved to trash, newest first, with the id restore_flow needs.",
    inputSchema: {},
  },
  async () => {
    try {
      const { rows } = await db.query(
        `SELECT id, title, slug, deleted_at, update_reason,
                jsonb_array_length(nodes) AS nodes, jsonb_array_length(edges) AS edges
         FROM flows WHERE user_id = $1 AND deleted_at IS NOT NULL
         ORDER BY deleted_at DESC LIMIT 200`,
        [owner()],
      )
      return ok({ count: rows.length, trashed: rows })
    } catch (e) { return fail(`list_trash failed: ${e.message}`) }
  },
)

// ── Catalog of valid node service keys ──────────────────────────────────────
server.registerTool(
  'list_services',
  {
    title: 'List services',
    description: 'List every valid node service key (the id a node must use) with its label. Use these ids when building nodes.',
    inputSchema: {},
  },
  async () => ok({
    count: Object.keys(SERVICES).length,
    services: Object.entries(SERVICES).map(([key, s]) => ({ key, label: s.label, sub: s.sub })),
  }),
)

// ── Machine-readable schema + example ───────────────────────────────────────
server.registerTool(
  'get_diagram_schema',
  {
    title: 'Get diagram schema',
    description: 'Explain the exact structure to create/update a diagram: field shapes, rules, and a complete example.',
    inputSchema: {},
  },
  async () => ok({
    rules: [
      'A diagram is { title, nodes, edges }.',
      'HARD REQUIREMENT: every node id MUST be a known service key from list_services (each has a logo). Unknown ids are REJECTED - no bare-letter nodes allowed.',
      'A service key can appear at most once per diagram (node ids are unique).',
      'Edges are directed { source, target, label?, id? } using node ids. THE ARRAY ORDER IS THE DIAGRAM: it numbers the Steps chips 1..N and it is the path the single current walks, 1 line at a time. Order the array the way a reader should read it.',
      'A line may carry `async: true` to fire on the same beat as the line before it: the current leaves the card on both lines at once and both targets light together. Use it for a fan-out whose lines do not depend on each other (stream the answer, persist it, emit the usage event); chain it on consecutive lines to fire 3 or more together. The Steps chips keep their own numbers.',
      'GIVE EVERY EDGE A STABLE id ("e1", "e2", ...). The owner\'s per-line styling, dragged chip position and hand bends are matched back by id; with no id they are matched by ARRAY INDEX, so inserting a line in the middle silently moves all of that onto the wrong lines. The id also picks the leader that carries the badge when several lines share a card face (lowest id wins).',
      'Node positions (x,y) are optional - the app auto-layouts on open. If you do place cards by hand, match the auto-layout pitch so nothing crowds: a card is 180 x 180 (a picture card 240 x 225), the layout allows 190 per card, leaves 150 between columns (so a column pitch of 340) and 95 between stacked cards (a row pitch of 275). A step chip needs about 100 px of clear line, which is what those gaps buy.',
      'A node may carry `size` { w, h } (clamped 130-600) to resize its card, and `iconSize` { w, h } (clamped 16-600) to stretch the logo tile inside it. Omit both unless a wide wordmark is unreadable at the stock tile; a note hangs BELOW the card and is not part of `size`.',
      'A node or an edge may carry `style`, the same object the format panel writes: stroke #hex, bg #hex or "transparent", bw 1|2|4, bs solid|dashed|dotted, radius 0|12, font sans|serif|mono, fs 12|14|18|24, align left|center|right, arrow step|curved|straight, opacity 0-100. A line uses only stroke, bw, bs, arrow and opacity. An illegal key or value is dropped. Leave `style` off a card unless you need to say something its brand colour cannot: a card with no style draws in its own logo colour, which is almost always right.',
      'update_flow REPLACES the whole nodes and edges arrays, so send every one, not only the changed one. Anything the owner set by hand that you omit (node size, iconSize, style; edge style, labelT, bend) is carried over from the stored row rather than wiped - but a node or edge you leave out of the array entirely is GONE.',
      'update_flow { id, view: { panels, badge } } sets how the diagram OPENS. panels is any of ["steps","share","code","notes-off"]: "steps" prints the numbered chip on every line, "notes-off" HIDES the notes (they show by default, so the key is inverted). badge is dark|silver|color|plain, default dark. Turn "steps" on for anything a reader has to follow in order - do not leave them to find the button.',
      'A node may carry a `note` (max 400 chars, light markdown: **bold**, *italic*, __underline__, ~~strike~~, `code`; a URL becomes a link showing its ticket key): 1-2 sentences on what that step does. It renders under the card, bottom-left, in the app, on every shared link and in the SVG - so put the per-step explanation THERE, not only in the title or edge labels.',
      'A node may also carry a plain-text `info` (max 600 chars): what this thing is and why it is in this diagram, shown only on hover/click of the i badge on the card, and never in the SVG.',
      'A node may carry `sunset: true` to mark it as today\'s path being decommissioned - drawn light silver and dimmed, icon in greyscale, the red X on the badge of every edge into it, and every edge touching it (in or out) light silver, immune to any line style; no X on the card. Silver is reserved for this state; never paint a node grey or silver to mean retired, set sunset instead.',
      'NO 2 LINES ON 1 TRACK, EVER: the app routes every line and moves a later one off any track an earlier line already holds, but only where there is room. Keep the card pitch (340 a column, 275 a row) so 2 lines can pass between any 2 cards; never pack cards tighter to save space. After a create or a move, the owner checks with npm run check:overlaps, which must print 0.',
      'NO TAG ON A TAG, EVER: the app slides an auto-placed tag along its own line clear of every earlier tag, and npm run check:overlaps fails on 2 touching tags. Leave labelT unset unless the owner asked; a hand labelT must never park a tag on another one.',
      'Swimlanes are set with update_flow { id, lanes } (the owner can also drag a band by its title and size it by its left or right edge on the canvas, saved as section w / lead and lane len / lead: send those back untouched): rows [{ id, title, y, h, color? }] for a top-down layout or columns [{ id, title, x, w, color? }] for a left-to-right one, 1 kind per diagram, max 12, thinnest 80, packed with 40 px gaps, each spanning the whole diagram on its other axis. A card is 180 x 180 (a picture card 240 x 225) plus its note below, so size every lane around the cards it holds. A lane may carry sections [{ id, title, at, color? }], 2 to 8, to split its 1 band into titled bands across its other axis instead of stacking 2 lanes: at is where a section starts (the x in a row lane) and the one before it ends 40 px short of that, the same gap that separates 2 lanes, so set at 140 px past the last card of the section before it. A split lane draws no band of its own and shows its sections titles, not its own. [] clears them. With lanes on, no Start pill is drawn.',
    ],
    example: {
      title: 'URL Shortener - Tier 1',
      nodes: [{ id: 'user' }, { id: 'cloudfront', note: 'Edge cache. A hit answers here and never reaches the API.', info: 'CloudFront is the CDN in front of the API, caching hot short-code lookups at the edge.', sunset: true }, { id: 'apigw' }, { id: 'lambda', note: 'Looks the short code up and 302s to the long URL.' }, { id: 'dynamo' }],
      edges: [
        { source: 'user', target: 'cloudfront', label: 'GET /abc' },
        { source: 'cloudfront', target: 'apigw', label: 'miss' },
        { source: 'apigw', target: 'lambda', label: 'invoke' },
        { source: 'lambda', target: 'dynamo', label: 'read/write' },
      ],
    },
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
// stderr only - stdout is the MCP transport channel.
console.error('flows MCP server running on stdio')
