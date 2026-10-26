# Flows MCP server

Lets any MCP-capable agent (Claude Code, Claude Desktop, etc.) work with the
Flows app: discover how many diagrams exist, learn the exact structure
to build one, and create / read / update / trash / restore diagrams. It talks
straight to the same Postgres the web app uses through the app's own `lib/`
layer, so anything an agent creates shows up in the app (and on prod)
immediately. Speaks MCP over stdio; logs go to stderr only.

## Tools

| Tool | Params | Returns |
|------|--------|---------|
| `list_flows` | none | `{ count, designs: [{ id, title, slug, nodes, edges, created_at, url }] }` - node/edge counts, newest first, max 200, trash excluded |
| `get_flow` | `id` | `{ id, title, slug, nodes, edges, created_at, url, share_url, gif_url, readme }` - the full structure the app renders. Error if the id is unknown or trashed |
| `create_flow` | `title`, `nodes[]`, `edges[]` (default `[]`), `public?` (default `true`), `pattern?`, `description?`, `source?` (`"repo-audit"` = render only, nothing stored), `store?`, `lanes?` | `{ id, url, share_url, gif_url, readme, visibility, share_note?, layout?, warning?, probably_update? }` |
| `update_flow` | `id`, `reason?`, `title?`, `nodes?`, `edges?`, `public?`, `lanes?`, `view?` | `{ id, url, share_url, gif_url, readme, visibility, updated: { title, nodes, edges, public, lanes, view }, layout?, reason? }` |
| `lock_flow` | `id`, `locked?`, `edit_locked?` (true only) | `{ id, title, locked, edit_locked }` |
| `delete_flow` | `id`, `reason?` | `{ trashed, title, recoverable: true, restore_with: "restore_flow" }` |
| `restore_flow` | `id` | `{ restored, title, url }` |
| `purge_flow` | `id` (must already be trashed) | `{ purged, permanent: true }` |
| `list_trash` | none | `{ count, trashed: [{ id, title, slug, deleted_at, update_reason, nodes, edges }] }` - newest first, max 200 |
| `list_services` | none | `{ count, services: [{ key, label, sub }] }` - every valid catalog id |
| `get_diagram_schema` | none | `{ rules, example }` - field shapes, rules and a complete example with notes |
| `list_versions` | `id` | `{ id, url, versions: [{ id, kind, reason, saved_at, title, node_count, edge_count }] }` - newest first, max 50 |
| `get_version` | `id`, `version_id` | the summary fields plus `nodes`, `edges`, `pattern`, `description`, `view_state` |
| `restore_version` | `id`, `version_id` | `{ id, url, restored, saved_at, title }` |

`url` is `<APP_URL>/?id=<uuid>`. `share_url` is `<APP_URL>/?id=<uuid>`,
the link to hand to people. `gif_url` is the animated diagram as an image,
`<APP_URL>/api/flows/<slug>?format=gif&w=1800&frames=20`, and `readme` is that URL
wrapped as a Markdown image, ready to paste into a README. Both need the
diagram to be public. `visibility` is `"public"` or `"private"`.

Alter an existing diagram with `update_flow` instead of creating a v2. Both
locks are off on a new flow, so you can trash one you just created: the owner
turns a lock on in the app for a flow that must not change. While the delete
lock (`locked`) is on, `delete_flow` refuses it; while the edit lock
(`edit_locked`) is on, `update_flow` and `restore_version` refuse it.
`lock_flow` can only turn a lock on. Only the owner turns one off, in the app:
if you need to change or trash a locked flow, stop and ask.

A diagram made for a repo (a README, a PR, a repo audit) belongs under the
gallery's Linked tab, not My Diagrams: pass `linked: true` to `create_flow`, or
title it `owner/repo - ...` and it is Linked on its own. The row carries a
`linked` tag.

Every `update_flow` (and `restore_version`) keeps the diagram state from
before that write as a version. `list_versions` shows the history for one
flow, newest first, with the `reason` that write was given; `get_version`
pulls one in full; `restore_version` puts it back live and is itself
versioned, so a restore is always safe to undo. Refused on an edit-locked
diagram, same as `update_flow`.

### Node and edge shapes

```json
{
  "title": "URL Shortener - Tier 1",
  "nodes": [
    { "id": "user" },
    { "id": "cloudfront", "note": "Edge cache. A hit answers here and never reaches the API." },
    { "id": "apigw" },
    { "id": "lambda", "note": "Looks the short code up and 302s to the long URL." },
    { "id": "dynamo" }
  ],
  "edges": [
    { "source": "user", "target": "cloudfront", "label": "GET /abc" },
    { "source": "cloudfront", "target": "apigw", "label": "miss" },
    { "source": "apigw", "target": "lambda", "label": "invoke" },
    { "source": "lambda", "target": "dynamo", "label": "read/write" }
  ],
  "public": true
}
```

A node is `{ id, x?, y?, icon?, image?, label?, sub?, color?, note?, info?, sunset?, cracked?, new?, tooltip?, iconFrame?, level?, drill?, size?, iconSize?, style? }`:

- `id` - a service key from `list_services` (e.g. `user`, `apigw`, `lambda`, `dynamo`, `kafka`, `redis`, `s3`), or any unique id when bringing your own icon or image. A key appears at most once per diagram.
- `icon` - bring-your-own logo: a remote `https` image URL, a `data:image/(png|jpeg|svg+xml|webp|gif)` URI with a real `;base64,` or `,` boundary, or a same-origin image path such as `/brand/foo.svg` (never protocol-relative `//host`). A remote URL is fetched once (https only, no redirects, `image/*`, max 24KB, 5s, private hosts refused, raster logos at least 96px) and inlined so the diagram stays self-contained. If it cannot be fetched the call fails and names the node. An inline `data:` icon is capped at 24KB.
- `image` - makes the node a picture card: a screenshot or photo shown at 4:3 inside the card and in every export. Accepts an absolute file path on this machine, an `https` image URL, a `data:image/(png|jpeg|webp|gif);base64` URI, or `airclips:<id>` / `airclips:latest` (the newest image on the AirClips board). Resolved once, resized to 640x480 cover-cropped, and stored as a JPEG data URI inside the diagram. File paths and `airclips:` refs only work through the MCP server (they need this machine); the HTTP API only takes `https` and `data:` sources. Needs `AIRCLIPS_URL` and `AIRCLIPS_TOKEN` in `.env` for `airclips:` refs.
- `label` - display name, required with a custom icon. `sub` - small subtitle. `color` - 6-digit brand hex (`#FF7A59`) for the border and tint; anything else is dropped because it lands in SVG attributes.
- `note` - max 400 chars, 1-2 sentences on what that step does. Light markdown works: `**bold**`, `*italic*`, `__underline__`, `~~strike~~` and `` `code` ``, 1 level, no nesting. Any http(s) URL becomes a blue link that shows its ticket key when the URL has one (SHAR-7977), else the address without scheme and www. It renders under the card, bottom-left, in the app, on every shared link, in the SVG (as typed, marks included) and on the share card. Set it on create, or later with `update_flow` by sending the full `nodes` list with `note` on the ones that need it.
- `info` - plain text, max 600 chars, 1-3 sentences on what this thing is and why it is in this diagram. Hidden until the reader hovers or clicks the i badge on the card, 1 popover open at a time; not in the SVG. Shown as `<card name> is <text>` with the name in bold, so write it to read after "is" ("the embedded iPaaS behind every rebuilt integration"). Different from `note`, which is always visible.
- `sunset` - a boolean; `true` marks a node that is today's path and gets decommissioned: a light red card in a red border, cracked open, and every edge touching it a red dash with the red X on its badge, except a line styled dashed or dotted, which keeps its own look.
- `cracked` - only with `sunset`. Default true (cracked open); `false` keeps the red card whole, for a more formal diagram.
- `new` - a boolean; `true` marks a component being added: green border and wash, NEW pill inside the top-left corner. Status is a flag, never a colour: never paint a card red, green or grey to mean retired or new.
- `tooltipColor` - `#rrggbb` fill for the tooltip and its pinned callout (default red); the text turns white or ink to stay readable.
- `pinTooltip` - `true` keeps the tooltip always visible above the card as a red callout (needs `tooltip`).
- `drill` - `{ title?, nodes, edges?, view?: { panels? } }`, a read-only sub-diagram opened by Drill in on the card panel, e.g. the tables behind a database card (1 card per table, note = columns, lines = foreign keys labelled with the column). Drill cards take the card fields (id, icon or catalog id, label, sub, note, info, x, y); no nested drill and no level. Max 100 cards and 300 lines. An update that omits it keeps the stored one.
- `tooltip` - plain text, max 200 chars, shown when the reader hovers the card. Optional; not in the SVG. A node with no colour of its own falls back to black.
- `size` - optional `{ w, h }`, clamped 130..600, the card on the canvas. Default 180 x 180, or 240 x 225 for a picture card. A note hangs BELOW the card and is not part of `h`.
- `iconSize` - optional `{ w, h }`, clamped 16..600, the logo tile inside the card (default 48 x 48). Only for a wide wordmark that is unreadable at the stock tile.
- `level` - integer 1-4, the C4 level the card first appears at (1 Context, 2 Container, 3 Component, 4 Code). Cumulative; no level = in every view. 2+ levels in a diagram = a C1..C4 picker above the canvas.
- `iconFrame` - a boolean; `true` draws a 1 px grey frame at the iOS corner around the icon tile, for a PNG whose outer ring is white (a white tile on a white card has no edge). The create sets it by itself when it detects that.
- `style` - optional, the look object, validated by `src/style.js` `cleanStyle`: `stroke` #hex, `bg` #hex or `"transparent"`, `bw` 1/2/4, `bs` solid/dashed/dotted, `radius` 0/12, `font` sans/serif/mono, `fs` 12/14/18/24, `align` left/center/right, `opacity` 0..100. An illegal key or value is dropped, exactly as on a save from the canvas. **Leave it off by default**: a card with no style draws in its own logo colour, which is almost always what you want, so set it only to say something that colour cannot.
- `color` - leave it off too. The border colour is taken from the icon itself (`src/iconColor.js`), so a Chrome card draws Chrome blue without being told. An explicit colour only wins when it is saturated: a grey or near-black is a guess and is replaced by the logo colour.
- `x` / `y` - optional. Omit them and the canvas lays the design out left-to-right, which is the wanted look. If you do place cards yourself, match the auto-layout pitch: 190 per card, 150 between columns (a 340 column pitch) and 95 between stacked cards (a 275 row pitch), which is what buys a step chip its 100 px of clear line.

Edges are directed `{ source, target, label?, description?, id?, style? }` using node ids. The tag on the line reads the label, or the description (max 300) cut short when there is no label; hovering the tag shows the whole description.

- **The array order IS the diagram.** It numbers the Steps chips 1..N and it is the path the single current walks, 1 line at a time, so order the array the way a reader should read the diagram.
- **A line may carry `async: true`** to fire on the same beat as the line before it: the current leaves the card on both lines at once and both targets light together. For a fan-out whose lines do not depend on each other; chain it on consecutive lines to fire 3 or more together. The Steps chips keep their own numbers.
- **Give every edge a stable `id`** (`"e1"`, `"e2"`, ...). The owner's per-line styling, the step chip they dragged along a line and any hand bend are matched back to a line BY ID. With no id they are matched by array position instead, so inserting a line in the middle silently moves all of that onto the wrong lines. The id also decides which line of a shared trunk is the leader that carries the only badge (lowest id wins).
- `style` - the look object above. A line reads only `stroke`, `bw`, `bs`, `arrow` (step/curved/straight/brace) and `opacity` from it.
- Lines INTO the same face of 1 card with the **identical label** merge into 1 trunk with 1 badge. Lines OUT of 1 face always split as a brace: a smooth curve per branch from 1 shared point, 1 badge each, whatever their labels. Put the per-line detail in `description`. `arrow: "brace"` on lines into 1 card gives them the brace split too. A bent, pinned or otherwise arrow-styled line never joins.

- `pattern` (max 200) and `description` (max 600) are top-level fields on `create_flow`: the one-line "what it tests" and the goal paragraph the detail view and the share card show above the diagram.

### How a diagram opens

`update_flow { id, view: { panels, badge, start, current, sizing, fonts, layout, level } }` saves how the diagram opens, and
`create_flow` takes the same thing as `view` (alias `view_state`).

- `panels` - any of `steps` (a numbered chip on every line), `share` (opens that panel), `notes-off`, `arrows-off`,
  `legend-off`, `badge-x-off` and `tags-above` (badges sit just off their line, no leader). The 4 `-off` flags hide notes, arrowheads, the bottom-left
  legend or the red X on retiring badges, which all show by default. **Turn `steps` on for
  anything a reader has to follow in order** instead of leaving them to find the
  button. `notes-off` is inverted on purpose: notes show by default, so the
  flag's job is to hide them.
- Edge `style` - a line uses only `stroke`, `bw`, `bs`, `arrow` (`step`, `curved`, `straight`, `brace`), `head` and `opacity`. `head` is `end` (default), `start`, `both` or `none`, the arrowhead
  direction; `bs: "dashed"` is an interim or optional path. Lines are solid.
- `start` - `{ x, y }`, where the Start pill sits. `layout` - `{ box, gap, vgap }`: `box` scales every card (0.6-2), `gap` and `vgap` spread the cards across and down (0.6-3); default 1.
- `level` - integer 1-4, the C4 level the diagram opens at (only when the nodes define it)
- `fonts` - `{ title, sub, tag }` text sizes in px for the whole diagram
  (each 8-22; title default 12, sub 10, tag 8.5). Send
  only what changes; `{}` resets. A big diagram that reads too small wants
  `{ title: 16, sub: 12, tag: 12 }` or so.
- `badge` - `dark` (default), `silver`, `color` or `plain`, how a step chip is
  painted.
- Only the keys you send change. The owner's lanes and hand-placed Start pill
  are kept. The HTTP `PATCH view_state` behaves differently and replaces the
  object, because the canvas sends the whole thing on every save.

### Swimlanes

Bands the cards sit in, 1 per layer of the system. Configuration only: there is
no Lane button on the canvas, so they are set with `update_flow { id, lanes }`
(or `lanes` on create) and nothing else writes them.

- A lane is a row `{ id, title, y, h, color?, size?, sections? }` for a
  top-down layout or a column `{ id, title, x, w, ... }` for a left-to-right
  one. A diagram has 1 kind, the kind of its first lane. Max 12, thinnest 80,
  packed with equal 40 px gaps, each band ending 36 px past the last card (and
  its note) inside it.
- `color` is a hex ink for the band and its title, `size` the title in px
  (10..40, default 13).
- `sections` (2 to 8 of `{ id, title, at, color? }`) splits 1 band into titled
  bands across its other axis instead of stacking 2 lanes. `at` is where a
  section starts and the one before it ends 40 px short of that, so put `at`
  140 px past the last card of the section before it. A split lane draws no
  band of its own: the sections are the bands and carry the titles. Never leave
  a card straddling a divider.
- `[]` clears every lane; omitting the key leaves them alone. With lanes on, no
  Start pill is drawn. An edge to `lane:<id>` collapses a fan into 1 line.

### Rules the server enforces

- **An update REPLACES the whole array.** `update_flow` with `nodes` or `edges`
  swaps that list wholesale, so send every node, not only the changed one: one
  you leave out is GONE. What the owner set by hand and you simply omit (node
  `size`, `iconSize`, `style`; edge `style`, `labelT`, `bend`) is carried over
  from the stored row rather than wiped - `lib/owner-work.js`.

- **Logo gate** - every node must render a real logo. A node that is neither a catalog service nor carries a valid `icon` is rejected on create and update, and the error lists the unresolved ids and points at `list_services`. No bare-letter placeholders. The gate is `lib/validate-design.js`, the same policy the HTTP API and AI generate use, so it also enforces the caps: max 100 nodes, max 300 edges, max 24KB per inline icon.
- **Start-left rule** - a diagram starts on the LEFT and reads left-to-right, never from the bottom, never backward. It is only judged when every node has coordinates: if the start node (the first edge's source, else the first node with no incoming edge) is not in the leftmost column, or sits at the bottom of a layout with vertical spread, all positions are dropped and the canvas auto-lays it out. The response carries a `layout` warning saying why.
- **Born arranged** - a new diagram is stored with the same layout the app's Arrange button produces, so it never opens crammed.
- **Version-spam guard** - if another diagram created in the last 7 days shares this title's base (ignoring a v2 / v2.1 suffix), the row is still created but the response adds `warning` and `probably_update: <id>` pointing at the one you probably meant to edit.
- Rows created here are tagged `["MCP"]` and owned by `OWNER_USER_ID`.

### Visibility

`public` on `create_flow` defaults to `true`: anyone with `share_url`
can open it and the link unfurls with the diagram itself in Slack and iMessage.
`public: false` keeps it private - recipients get a 404 and the generic site
card, and the response includes `share_note` saying so. Flip it later with
`update_flow { id, public: true }`; omit `public` on update to leave
visibility alone.

Note the HTTP API (`POST /api/ai/flows`) defaults the other way
(`is_public: false`).

### Update and reason

`update_flow` works on a diagram of any age - backfilling and
correcting old work is what it is for, so always prefer it over creating a
"v2". Any of `title`, `nodes`, `edges`, `public` you send replaces that field;
omitted fields are unchanged. Sending `nodes` replaces the whole node list
(the logo gate and start-left rule run again), so include every node.

`reason` is optional on both `update_flow` and
`delete_flow`. When given it is trimmed and stored in the row's
`update_reason` column as a trail, and echoed back in the update response.
It is never required.

### Trash

`delete_flow` is a soft delete: the row is stamped `deleted_at` and
disappears from the gallery, the demo list and every shared link, but it is
kept. `list_trash` shows what is there, `restore_flow` brings one
back, and `purge_flow` destroys one permanently - and only one that
is already in trash, so destroying anything always takes 2 deliberate steps.
`update_flow` and `get_flow` do not see trashed rows.

## Requirements

`mcp/load-env.mjs` loads the repo `.env` by absolute path before anything
else, so the working directory the agent launches from does not matter.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `OWNER_USER_ID` | Yes | Owner uuid; every tool reads and writes only this owner's rows. Missing means every call fails |
| `FLOWS_APP_URL` | No | Base for `url` / `share_url`. Defaults to `https://flows-bheng.vercel.app` |
| `DATABASE_SSL` | No | `"true"` for a remote Postgres with a self-signed cert |
| `AIRCLIPS_URL` | No | Base URL of the AirClips board, for `image: "airclips:<id>"`. Defaults to `http://M4.local:7474` |
| `AIRCLIPS_TOKEN` | No | AirClips auth token (`x-airclips-token`). Required for any `airclips:` image ref |

Run `npm install` once so `@modelcontextprotocol/sdk` is present.

## Connect it

**Claude Code (this repo):** already wired via `.mcp.json` at the repo root,
discovered automatically when you run Claude Code here:

```json
{
  "mcpServers": {
    "flows": {
      "command": "node",
      "args": ["mcp/server.mjs"]
    }
  }
}
```

Or add it from anywhere:

```bash
claude mcp add flows -- node /absolute/path/to/flows/mcp/server.mjs
```

**Claude Desktop:** add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flows": {
      "command": "node",
      "args": ["/absolute/path/to/flows/mcp/server.mjs"]
    }
  }
}
```

**Run it standalone:** `npm run mcp`.

Once connected you can just say: *"create a flow for a URL shortener"*
and the agent will call `list_services` / `get_diagram_schema` to learn the
shape, then `create_flow`, and hand you back the `share_url`.
