#!/usr/bin/env node
// ─── flows MCP server ────────────────────────────────────────────────
// Exposes the Flows app to any MCP-capable agent (Claude Code, Claude
// Desktop, etc.) so it can discover, read, create, update, and delete the same
// diagrams the web app renders. Talks straight to the shared Postgres via the
// app's own lib/ layer, so anything created here shows up in the app instantly.
//
// Env (from the repo .env): DATABASE_URL, OWNER_USER_ID. Optional:
// FLOWS_APP_URL (default prod) for the shareable links it returns.
import './load-env.mjs' // MUST be first - loads .env before lib/db.js opens the pool
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import db from '../lib/db.js'
import { uniqueFlowSlug } from '../lib/slugs.js'
import { titleBase, MIN_BASE_LEN } from '../lib/title-base.js'
import { arrangeNew } from '../lib/arrange.js'
import { ownerId } from '../lib/auth-owner.js'
import { SERVICES } from '../src/services.js'
import { resolveNodeIcons } from '../lib/resolve-icon.js'
import { cleanNote } from '../src/note.js'
import { validateDesign, okColor } from '../lib/validate-design.js'

const APP_URL = process.env.FLOWS_APP_URL || 'https://flows-bheng.vercel.app'
const urlFor = id => `${APP_URL}/?id=${id}`
// The link to hand to people. It opens for anyone and unfurls with the diagram
// itself (Slack, iMessage) - as long as the design is public.
const shareUrlFor = slug => `${APP_URL}/demo?name=${encodeURIComponent(slug)}`
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
  }))
}
// HARD GATE, shared with the API and AI generate (lib/validate-design.js): every
// node renders a real logo, icons are well-formed, and the size caps hold.
// Returns an error result, or null if OK.
const logoGate = (nodes, edges = []) => {
  const invalid = validateDesign({ nodes, edges })
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
        'SELECT id, title, slug, nodes, edges, created_at FROM flows WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200',
        [owner()],
      )
      return ok({
        count: rows.length,
        designs: rows.map(r => ({
          id: r.id, title: r.title, slug: r.slug,
          nodes: r.nodes?.length ?? 0, edges: r.edges?.length ?? 0,
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
      const { rows } = await db.query('SELECT id, title, slug, nodes, edges, created_at FROM flows WHERE id = $1 AND deleted_at IS NULL', [id])
      if (!rows.length) return fail(`No diagram with id ${id}`)
      return ok({ ...rows[0], url: urlFor(id) })
    } catch (e) { return fail(`get failed: ${e.message}`) }
  },
)

// ── Create ──────────────────────────────────────────────────────────────────
server.registerTool(
  'create_flow',
  {
    title: 'Create flow',
    description: "Create a new diagram. Provide a title, nodes, and edges connecting node ids. Each node is EITHER a known catalog service (call list_services), OR a bring-your-own node with a custom `icon` (a remote https logo URL, a data:image URI, or a /path) plus a `label`. Remote https icons are fetched and inlined once so the diagram stays self-contained. Positions are optional (the app auto-layouts). Returns the new id and URL.",
    inputSchema: {
      title: z.string().describe('Descriptive title, e.g. "URL Shortener - Tier 1"'),
      nodes: z.array(z.object({
        id: z.string().describe('A known service key (e.g. "lambda","dynamo","cyclr","hubspot"), or any unique id when bringing your own icon'),
        x: z.number().optional().describe('Optional. OMIT x/y and the canvas lays the design out left-to-right for you - that is the wanted look.'),
        y: z.number().optional(),
        icon: z.string().optional().describe('Bring-your-own logo: a remote https image URL, a data:image URI, or a same-origin /path. Omit for catalog services.'),
        label: z.string().optional().describe('Display name (required with a custom icon), e.g. "HubSpot"'),
        sub: z.string().optional().describe('Small subtitle under the label, e.g. "CRM"'),
        color: z.string().optional().describe('Brand hex color for the node border/tint, e.g. "#FF7A59"'),
        note: z.string().max(400).optional().describe('Plain-text note shown under this node (bottom-left, black text in a black frame) in the app, on every shared link and in the SVG. 1-2 sentences on what this step does or why it is there, e.g. "Reads the account\'s Recurly subscriptions, looks the user up in MBD, branches per app."'),
      })).min(1).describe('The services in the diagram'),
      edges: z.array(z.object({
        source: z.string().describe('source node id'),
        target: z.string().describe('target node id'),
        label: z.string().optional().describe('short edge label, e.g. "read/write"'),
      })).default([]).describe('Directed connections between node ids, in flow order'),
      pattern: z.string().max(200).optional().describe('The one-line "what it tests" shown above the diagram and on the share card, e.g. "Read-heavy KV lookup: cache-first redirects"'),
      description: z.string().max(600).optional().describe('The goal paragraph shown under the pattern, 1-3 sentences on what the design is for.'),
      public: z.boolean().optional().describe('Default true: anyone with the link can open it and the link unfurls with the diagram. false keeps it private (owner only; recipients get a 404 and a generic preview card).'),
    },
  },
  async ({ title, nodes, edges, pattern, description, public: isPublic = true }) => {
    try {
      const gate = logoGate(nodes, edges)
      if (gate) return gate
      const { nodes: iconNodes, failed } = await resolveNodeIcons(nodes)
      if (failed.length) return fail(`Could not fetch the remote icon for node(s): ${failed.join(', ')}. Use an https image URL that returns image/* under 24KB (no redirects), or inline a data:image URI.`)
      const o = owner()
      const slug = await uniqueFlowSlug(o, title)
      const storedEdges = toStoredEdges(edges)
      const enforced = enforceStartLeft(toStoredNodes(iconNodes), storedEdges)
      // Born arranged: a new diagram gets the same layout the Arrange button
      // produces, so it never lands on the canvas crammed.
      const storedNodes = arrangeNew(enforced.nodes, storedEdges)
      const { rows } = await db.query(
        'INSERT INTO flows (user_id, title, slug, nodes, edges, type, tags, is_public, pattern, description) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::text[],$8,$9,$10) RETURNING id',
        [o, title.trim(), slug, JSON.stringify(storedNodes), JSON.stringify(storedEdges), 'flow', ['MCP'], isPublic, pattern?.trim() || null, description?.trim() || null],
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
      'call list_flows to find the id. Backfilling or correcting old diagrams is exactly what this is for.',
    inputSchema: {
      id: z.string().describe('The diagram id to update'),
      reason: z.string().optional().describe('Optional note on why, e.g. "backfill: correct the Integry decommission date". Recorded on the row as a trail; never required.'),
      title: z.string().optional(),
      nodes: z.array(z.object({
        id: z.string(), x: z.number().optional(), y: z.number().optional(),
        icon: z.string().optional().describe('Bring-your-own logo: https URL, data:image URI, or /path'),
        label: z.string().optional(), sub: z.string().optional(), color: z.string().optional(),
        note: z.string().max(400).optional().describe('Plain-text note under the node; see create_flow. Omit to leave a node without one.'),
      })).optional(),
      edges: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })).optional(),
      public: z.boolean().optional().describe('true publishes (anyone with the link can open it, real preview card); false makes it private again. Omit to leave visibility alone.'),
    },
  },
  async ({ id, reason, title, nodes, edges, public: isPublic }) => {
    try {
      let iconNodes = nodes
      if (nodes) {
        const gate = logoGate(nodes, edges || []); if (gate) return gate
        const r = await resolveNodeIcons(nodes)
        if (r.failed.length) return fail(`Could not fetch the remote icon for node(s): ${r.failed.join(', ')}.`)
        iconNodes = r.nodes
      }

      // No age gate. Any diagram is editable at any time - backfilling and
      // correcting old work is the point of this tool, and a time limit only
      // pushed agents into making a "v2" instead. `reason` stays optional and is
      // recorded when given, as a trail rather than a toll.
      const nextEdges = edges ? JSON.stringify(toStoredEdges(edges)) : null
      let layoutWarning = null
      let nextNodes = null
      if (iconNodes) {
        const e = enforceStartLeft(toStoredNodes(iconNodes), edges ? toStoredEdges(edges) : [])
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
           updated_at = now()
         WHERE id = $1 AND user_id = $6 AND deleted_at IS NULL RETURNING id, slug, is_public`,
        [id, title?.trim() ?? null, nextNodes, nextEdges, reason?.trim() ?? null, owner(), isPublic ?? null],
      )
      if (!rows.length) return fail(`No owned diagram with id ${id} (it may be in trash - call list_trash)`)
      return ok({
        id,
        url: urlFor(id),
        share_url: shareUrlFor(rows[0].slug),
        visibility: rows[0].is_public ? 'public' : 'private',
        updated: { title: title != null, nodes: nodes != null, edges: edges != null, public: isPublic != null },
        ...(layoutWarning ? { layout: layoutWarning } : {}),
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      })
    } catch (e) { return fail(`update failed: ${e.message}`) }
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
      'shared link, but the row is kept and restore_flow can bring it back. Safe for cleaning up duplicates.',
    inputSchema: {
      id: z.string().describe('The diagram id to move to trash'),
      reason: z.string().optional().describe('Why it is being removed, e.g. "duplicate of v2.2". Recorded on the row.'),
    },
  },
  async ({ id, reason }) => {
    try {
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
      'Edges are directed { source, target, label? } using node ids; order them in execution/flow order.',
      'Node positions (x,y) are optional - the app auto-layouts on open.',
      'A node may carry a plain-text `note` (max 400 chars): 1-2 sentences on what that step does. It renders under the card, bottom-left, in the app, on every shared link and in the SVG - so put the per-step explanation THERE, not only in the title or edge labels.',
    ],
    example: {
      title: 'URL Shortener - Tier 1',
      nodes: [{ id: 'user' }, { id: 'cloudfront', note: 'Edge cache. A hit answers here and never reaches the API.' }, { id: 'apigw' }, { id: 'lambda', note: 'Looks the short code up and 302s to the long URL.' }, { id: 'dynamo' }],
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
