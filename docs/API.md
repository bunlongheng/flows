# Flows - reference

The detail behind the [README](../README.md): every route, every environment
variable, the full feature list, and how the test suites are wired.

## Public API

All routes run on the Node runtime, `force-dynamic`. HEAD is accepted wherever GET is. Rate limits are per warm instance, fixed window, and answer `429` with `Retry-After`.

### Animated GIF

`GET /api/flows/:idOrSlug?format=gif` renders the diagram with its dots flowing and returns an `image/gif`. It needs no auth for a public diagram and no browser, so an agent or a README can link one directly:

```markdown
![Architecture](https://flows-bheng.vercel.app/api/flows/my-diagram?format=gif)
```

20 frames over one 2.6s loop at 1800px by default, the diagram exactly as the app draws it: the same cards, routing, badges, notes, fonts and dot grid, with the dashes and dots moving along the real path. `?frames=` (2-30) and `?w=` (200-3200) override that; `?w=3200` fills a full-width wiki page. It is the URL `gif_url` and `readme` in the create response carry. Frames after the first are stored as a diff over the one before, so a 16-node design with 3 screenshots is about 460KB at the default. The page and the cards are rasterised once and only the moving lines per frame, about 1s locally and a few seconds on Vercel cold; a finished render is kept in Postgres by the flow's last change and the size, and the app warms it after the owner saves, so a README fetch is a lookup. The response is cached for a CDN (`s-maxage=3600`, an `ETag` from the last update) because the render is 20 rasterises and a diagram changes rarely.

This is the server-side twin of the in-app GIF button. The in-app one captures the live canvas through `html-to-image`; this one rasterises the same SVG the `?format=svg` export uses, so it works headless.

The app was previously called System Design and these routes lived under `/api/system-designs` and `/api/ai/system-designs`. Both still work: they answer `308` to the `/api/flows` equivalent, which preserves the method and body, so an existing `POST` client keeps working without a change.

| Route | Auth | Notes |
|-------|------|-------|
| `POST /api/ai/flows` | Bearer | Render-only create. 60/min. |
| `GET /api/flows/:idOrSlug` | Public | JSON, or SVG with `?format=svg`, or an animated GIF with `?format=gif`, or the gallery tile with `?format=thumb` (the app's last capture of the real canvas as a JPEG; until the owner has opened the flow, a PNG of the SVG render, made once and kept). Private rows 404 for non-owners. 180/min. |
| `GET /api/flows/public` | Public | The curated `DEMO_SLUGS` roster (12), public + not deleted, by difficulty. 120/min. |
| `GET /api/flows` | Owner (session, Bearer, or local dev) | Owner's diagrams minus the demo roster, newest first, max 60. 120/min. |
| `PATCH /api/flows/:id` | Owner session only (Bearer rejected) | 1 of 7 body shapes, uuid only. |
| `DELETE /api/flows/:id` | Owner session only (Bearer rejected) | Soft delete; `?purge=1` destroys a trashed row. uuid only. |
| `GET /api/og?name=<slug>` or `?id=<uuid>` | Public | 1200x630 PNG for a public design, else `302 /og.png` with `no-store`. 120/min. |
| `POST /api/ai/generate` | Owner session or local dev only | Prompt (max 2000 chars) to Claude, saved private, tags `["AI"]`. `422` if the model's output fails the logo gate. 10/min. |
| `GET /api/auth/login` | Public | Redirects to Google (20/min). `GET /api/auth/callback` verifies `OWNER_EMAIL` and sets `sd_session`. |
| `GET /api/auth/me` | Public | `{ authenticated, email? }`. `POST /api/auth/logout` clears the cookie. |
| `GET /api/health` | Public | `200 { ok:true, checks }` or `503`. Checks secret, owner id, Google creds, auth secret, owner email, DB. |

### Create

```bash
curl -X POST https://flows-bheng.vercel.app/api/ai/flows \
  -H "Authorization: Bearer $FLOWS_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Netflix Video Streaming",
    "is_public": true,
    "nodes": [
      { "id": "user",       "position": { "x": 40,  "y": 200 } },
      { "id": "cloudfront", "position": { "x": 260, "y": 200 }, "note": "Edge cache. A hit never reaches the API." },
      { "id": "apigw",      "position": { "x": 480, "y": 200 } },
      { "id": "lambda",     "position": { "x": 700, "y": 200 } },
      { "id": "dynamo",     "position": { "x": 920, "y": 200 } }
    ],
    "edges": [
      { "id": "e1", "source": "user",       "target": "cloudfront", "label": "HTTPS", "animated": true },
      { "id": "e2", "source": "cloudfront", "target": "apigw",      "label": "origin" },
      { "id": "e3", "source": "apigw",      "target": "lambda",     "label": "invoke" },
      { "id": "e4", "source": "lambda",     "target": "dynamo",     "label": "read/write" }
    ]
  }'
```

Body fields:

| Field | Notes |
|-------|-------|
| `title` | Required string, max 200 chars. |
| `type` | Optional, only `"flows"` is accepted. |
| `nodes[]` | Required, 1 to 100. Each `{ id, position?, size?, iconSize?, icon?, image?, label?, sub?, color?, note?, info?, sunset? }`. `id` is a catalog service key unless `icon` or `image` is given. `image` is a `data:image/...;base64` URI or an https image URL, stored as a 640x480 JPEG and drawn as a 4:3 photo card (file paths and `airclips:` refs are MCP only). `color` is a 6-digit hex or it is dropped. `note` is text, max 400 chars, always visible under the card. Light markdown works: `**bold**`, `*italic*`, `__underline__`, `~~strike~~` and `` `code` ``, 1 level, no nesting. Any http(s) URL becomes a blue link that shows its ticket key when the URL has one (SHAR-7977), else the address without scheme and www, cut at 32 chars; the full URL is the href. `info` is plain text, max 600 chars, hidden until the reader hovers or clicks the i badge on the card; not in the SVG. Only 1 info popover is open at a time. It is always shown as `<card name> is <text>` in the app, the name in bold, so write the text to read after "is" ("the embedded iPaaS behind every rebuilt integration"); text that already starts with the name is left as is. `iconFrame` is a boolean; `true` draws a 1 px grey frame at the iOS corner around the icon tile, and the MCP create sets it by itself when most of a PNG icon's outer ring is white (a white tile on a white card has no edge). `sunset` is a boolean; `true` marks a node that is today's path and gets decommissioned: drawn light silver and dimmed, icon in greyscale, the red X and a silver badge on every edge touching it (in or out), and those edges light silver at 0.75 opacity, immune to any line style. No X on the card itself. Silver is reserved for this; never paint a node grey or silver to mean retired, set `sunset` instead. A node with no colour of its own falls back to black. Positions are optional; missing ones are laid out. `size` is optional `{ w, h }` 130..600 px, the card size on the canvas; icon cards default to 180x180, picture cards to 240x225. `iconSize` is optional `{ w, h }` 16..600 px, the icon or photo drawn inside the card (default 48x48 icon, photo fills the card). `style` is optional and is the same look object the format panel writes, validated by `src/style.js` `cleanStyle`: `stroke` #hex, `bg` #hex or `"transparent"`, `bw` 1\|2\|4, `bs` solid\|dashed\|dotted, `radius` 0\|12, `font` sans\|serif\|mono, `fs` 12\|14\|18\|24, `align` left\|center\|right, `opacity` 0..100. An illegal key or value is dropped. Leave it off unless you need to say something the card's own logo colour cannot. |
| `edges[]` | Optional, max 300. Each `{ id?, source, target, label?, description?, style?, async?, animated? }`. `source` or `target` (1 of them, never both) may be `lane:<id>` naming a swimlane: the line ends on the lane border straight under its card, lane colour at that end, 1 badge for every card in the band. Create and MCP reject a lane id the diagram does not have. **The array order is the diagram**: it numbers the Steps chips 1..N and it is the path the single current walks, so order it the way a reader should read it. **Always send `id`** (`"e1"`, `"e2"`, ...): per-line styling, the dragged badge position and hand bends are matched to a line by id, and with no id they fall back to the array index, so inserting a line in the middle silently moves all of that onto the wrong lines. `id` also picks which line of a shared trunk carries the badge (lowest wins). `style` is the look object above; a line reads only `stroke`, `bw`, `bs`, `arrow` (step\|curved\|straight) and `opacity`. `animated` is accepted and stored but inert - every line animates. The tag on the line reads `label`, or `description` cut short at a word (about 28 chars) when there is no label. `description` is plain text, max 300; hovering the tag shows the whole of it in the app. The SVG draws the same tag text and has no hover. `async: true` fires the line on the same beat as the line before it, so a fan-out of independent lines leaves its card together and their targets light together; chain it on consecutive lines to fire 3 or more at once. The Steps chips keep their own numbers. |
| `pattern` | Optional string, max 200. The one-line "what it tests" shown above the diagram and on the share card. |
| `description` | Optional string, max 600. The goal paragraph under it. |
| `is_public` | Optional boolean, default `false`. `true` makes the link open for anyone and gives it a real card. |
| `linked` | Optional boolean. `true` lists the diagram under the gallery's Linked tab (README, PR, repo audit) instead of My Diagrams. A title that starts with `owner/repo` is Linked on its own; `false` keeps it out. The row carries a `linked` tag. |
| `return` / `format` | `"svg"` (or `?format=svg` on the URL) adds the rendered `svg` to the response. |
| `source` | Optional string, max 40. `"repo-audit"` means a repo audit or recon asked: the diagram is rendered and NEVER stored. The response is `200 { stored: false, source, svg }` with no id or url. Every `/repo-audit` call passes it. |
| `store` | Optional boolean. `false` renders without storing for any caller (`source` becomes `"render-only"`). |
| `lanes[]` | Optional. Swimlanes for the picture (`{ id, title, x, w, color?, size? }` columns or `{ id, title, y, h, color?, size? }` rows, max 12; `size` is the title in px, 10 to 40, default 13), stored in `view_state.lanes` on a normal create and honoured on a render-only one. |
| `view_state` | Optional `{ panels?, badge?, start?, current? }` - how the diagram opens. `panels` is any of `steps`, `share`, `code`, `notes-off`; `badge` is `dark\|silver\|color\|plain` (default dark); `start` is `{ x, y }` for the "Start here" pill. Turn `steps` on for anything a reader has to follow in order rather than leaving them to find the button. `notes-off` is inverted on purpose: notes show by default. `current` is the flowing current - `{ speed: 0.5|1|1.5|2, amount: 20|50|100|200|500|1000|2000|5000 }`, the multiplier on the clock and the TOTAL number of small dots across the whole diagram (default `{ speed: 1, amount: 20 }`, stored only when it differs). |

Rules:

- **Logo gate** (`lib/validate-design.js`, shared with MCP and AI generate) - every node must resolve to a real logo: a known service key, or a custom `icon` that is an `https://` URL, a `data:image/(png|jpeg|svg+xml|webp|gif)` URI with a real `;base64,` or `,` boundary, or a same-origin image path (`/brand/foo.svg`, never protocol-relative `//host`). Otherwise `400` with `unresolved: [ids]`.
- Remote `https` icons are fetched once (https only, no redirects, `image/*`, max 24KB, 5s, private hosts blocked, raster icons must be at least 96px) and inlined as `data:` URIs. A fetch that fails is `400` with `icon_fetch_failed`.
- Inline `data:` icons are capped at 24KB.
- Any `400` carries `error`, `required_fields` (including `nodes[].note`, `nodes[].info`, `nodes[].sunset` and `is_public`), and a full `sample_request`.
- A bad or missing Bearer is `401`. `FLOWS_API_SECRET_PARTNER`, when set, is accepted as well.
- Rows are tagged `["API"]`.

Response `201`:

```json
{
  "id": "<uuid>",
  "url": "https://flows-bheng.vercel.app/?id=<uuid>",
  "share_url": "https://flows-bheng.vercel.app/demo?name=<slug>",
  "visibility": "public",
  "svg_url": "https://flows-bheng.vercel.app/api/flows/<uuid>?format=svg",
  "gif_url": "https://flows-bheng.vercel.app/api/flows/<slug>?format=gif&w=1800&frames=20",
  "readme": "![<title>](https://flows-bheng.vercel.app/api/flows/<slug>?format=gif&w=1800&frames=20)"
}
```

A private create adds `share_note` explaining that recipients get a 404 until it is published.

### Read

`GET /api/flows/:idOrSlug` accepts the uuid or the slug. It returns `id, title, slug, nodes, edges, type, tags, is_public, description, pattern, difficulty, view_state, created_at`. A row with `is_public === false` returns `404` unless the request is the owner, so private ids cannot be probed. `?format=svg`, `?svg=1`, or an `Accept: image/svg+xml` header returns a self-contained SVG (`Cache-Control: public, max-age=60`).

### Update (owner session only)

`PATCH /api/flows/:id` takes exactly 1 of these 9 bodies, checked in this order:

| Body | Effect |
|------|--------|
| `{ "nodes": [{ id, position, size, iconSize }] }` | Merges positions and sizes by id into the stored nodes; branding is never taken from the request. `size` is `{ w, h }`, 130..600 px, clamped. `iconSize` is `{ w, h }`, 16..600 px, clamped - the icon or photo drawn inside the card; `iconSize: null` clears it back to the default. A node not yet stored is added whole. Returns `{ id, saved }`. |
| `{ "notes": [{ id, note?, info?, sunset?, style? }] }` | Sets or clears (empty string / `false` / a junk style) `note`, `info`, `sunset` and/or `style` per node; a key left off an entry leaves the stored value for that key alone. `style` is the format panel's whole payload for a card and goes through `cleanStyle`. Returns `{ id, noted }`. |
| `{ "edgeStyles": [{ id, style?, label? }] }` | Per-line look and badge text, matched by edge id (a line with no id is keyed `e0`, `e1`, ... by array position). Only the keys present on an entry change; a falsy `style` or `label` removes that key. A line reads `stroke`, `bw`, `bs`, `arrow` and `opacity` from `style`. Returns `{ id, styled }`. |
| `{ "deleteEdges": ["e2", "e5"] }` | Removes those lines by id. A non-empty array of strings or `400`. Returns `{ id, deleted }`, the count removed. |
| `{ "edges": [{ id, labelT, ends, bend }] }` | Moves a step badge along its edge (`labelT`, clamped 0.12..0.88) and pins where the edge meets each box (`ends: { s, t }`, each `{ side: top\|right\|bottom\|left, at: 0.05..0.95 }`; omit a key to go back to automatic). `bend: { t, d }` bends the line through a point `t` (0.1..0.9) along its straight run and `d` (-600..600) off it; omit it for a straight/automatic line. Returns `{ id, moved }`. |
| `{ "view_state": { panels, badge, start, current } }` | Panels from `steps`, `share`, `code`, `notes-off` (**inverted on purpose**: notes show by default, so the flag's job is to hide them, and an absent flag has to keep meaning "shown" for every row written before the toggle existed); badge from `dark, silver, color, plain`; `start: { x, y }` is the owner's hand-placed spot for the "Start here" pill (omit or send `view_state` without it to go back to automatic placement); `current: { speed, amount }` is how the current runs, per diagram - `speed` is 0.5, 1, 1.5 or 2 and multiplies the clock, `amount` is the TOTAL small dots over the whole diagram from 20, 50, 100, 200, 500, 1000, 2000, 5000 (the owner sets both by clicking the Start pill; omitted from the row while it is the default 1x / 20). Returns `{ id, view_state }`. `lanes` is the swimlane configuration: rows `[{ id, title, y, h, color?, size? }]` or columns `[{ id, title, x, w, color?, size? }]`, 1 kind per diagram, max 12, thinnest 80, packed with 40 px gaps, each band drawn to end 36 px past the last card (and note) inside it so notes on or off always pad nicely, `size` the title in px (10 to 40, default 13); a lane may carry `sections` (2 or 3 of `{ id, title, at, color? }`) to split its 1 band into titled bands across its other axis, 40 px apart for the same visual separation 2 lanes get: `at` is where a section starts (the x in a row lane) and the one before it ends 40 px short of that, so set `at` 140 px past the last card of the section before it; a split lane draws no band of its own and shows its sections' titles instead of its own; `[]` clears them and a body without the key keeps the stored lanes. With lanes on, no Start pill is drawn. **This branch REPLACES the canvas half of `view_state`**, which is right for the canvas (it sends the whole thing every save) and a trap for anything else: send `panels` alone and the stored `badge` and `start` are gone. `lanes` is the exception and is kept when the key is absent. The MCP `update_flow { view }` merges key by key instead. |
| `{ "is_public": true|false }` | Publishes or hides. Returns `{ id, is_public }`. |
| `{ "thumbnail": "data:image/jpeg;base64,..." }` | The app's fit-view capture of the canvas for the gallery tile, under 300 KB. Returns `{ id, thumbnail_at }`. An agent rewrite of nodes or edges drops it until the owner opens the flow again. |
| `{ "locked": true|false, "edit_locked": true|false }` | Flips either lock (a key left off leaves that lock alone). Returns `{ id, locked, edit_locked }`. A new flow starts with both locks off; the owner turns one on for a flow that must not change. `locked` is the delete lock: while on, delete is `409` for everyone, the owner included. `edit_locked` is the edit lock: while on, agents (MCP `update_flow`, `restore_version`) cannot change the flow; the owner's own edits through this session-gated PATCH never answer to it. Only the owner session flips a lock off; MCP `lock_flow` can only turn one on. |

Anything else is `400`. Trashed rows are `404`.

### Delete (owner session only)

A delete-locked diagram is `409` until the owner unlocks it. A new flow is not locked, so an agent can clean up what it just created.

`DELETE /api/flows/:id` stamps `deleted_at` and returns `{ deleted, recoverable: true }`. The row leaves every list and every shared link but stays in the table. `DELETE /api/flows/:id?purge=1` permanently removes a row that is already in trash and returns `{ purged }`. There is no HTTP restore; use the MCP `restore_flow` tool.

### History (owner session only)

Every content change writes a version of the diagram from just before that write, and layout-only saves (a drag, an Arrange) are coalesced to at most one per 10 minutes so nudging a node repeatedly does not spam the history, unless the write gave a reason (a restore always does); a real content change (nodes, edges, title, pattern, description) is always kept. A `kind` of `layout` means only position/size/iconSize/edge geometry changed; anything else is `content`. 50 versions are kept per flow, oldest dropped.

```bash
curl https://flows-bheng.vercel.app/api/flows/<id>/versions \
  -H "Cookie: sd_session=<session>"
```

Returns `{ versions: [{ id, kind, reason, saved_at, title, node_count, edge_count }] }`, newest first, max 50. `reason` is whatever was passed to the write that this version predates (`update_flow`'s `reason`, for example), so it reads as a trail of what each version undoes.

```bash
curl https://flows-bheng.vercel.app/api/flows/<id>/versions/<vid> \
  -H "Cookie: sd_session=<session>"
```

Returns one version in full: the summary fields above plus `nodes`, `edges`, `pattern`, `description`, `view_state`.

```bash
curl -X POST https://flows-bheng.vercel.app/api/flows/<id>/versions/<vid>/restore \
  -H "Cookie: sd_session=<session>"
```

Puts that version back as the live diagram and returns `{ restored, saved_at, title }`. The write goes through the same versioning as any other, so the state it replaces is kept and a restore can itself be undone. A delete-locked diagram is `409`, same as delete (the owner's restore answers to the delete lock; an agent's restore through MCP answers to the edit lock).

All 3 routes `404` on an id that is not the owner's, is in trash, or (for the last 2) a version id that does not belong to the diagram.

## Environment variables

`lib/env.js` runs on import from `next.config.mjs`. On a production build (`VERCEL_ENV=production`) it throws if any required variable is missing or if `LOCAL_DEV=true`, so a misconfigured deploy fails instead of shipping a dead API. Preview deploys, CI and local dev are not checked.

| Variable | Required in prod | Used by |
|----------|------------------|---------|
| `FLOWS_API_SECRET` | Yes | Bearer for `POST /api/ai/flows` and `GET /api/flows`. Server-only. |
| `FLOWS_API_SECRET_PARTNER` | No | Second, revocable Bearer accepted everywhere the main one is. |
| `DATABASE_URL` | Yes | `pg` Pool, migrations, MCP server. |
| `DATABASE_SSL` | No | `"true"` enables TLS with `rejectUnauthorized: false` (self-signed remote). |
| `OWNER_USER_ID` | Yes | `user_id` on every row; all reads/writes are scoped to it. |
| `FLOWS_APP_URL` | No | Base for returned `url` / `share_url` / `svg_url` / `gif_url` and `metadataBase`. Defaults to the prod URL. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth for owner sign-in. Redirect URI: `<APP_URL>/api/auth/callback`. |
| `AUTH_SECRET` | Yes | HMAC key for the `sd_session` cookie (`openssl rand -hex 32`). 7-day sessions. |
| `AUTH_HOST` | No | Hostname Google has as the redirect URI (`flows-bheng.vercel.app`). A sign in started on another production alias is sent here first, so Google never sees an unregistered `redirect_uri`. |
| `OWNER_EMAIL` | Yes | The only Google account that gets a session. |
| `SESSION_MIN_IAT` | No | Unix timestamp; any session issued before it is rejected. Revokes all sessions without a store. |
| `ANTHROPIC_API_KEY` | No | Only `POST /api/ai/generate` (owner only). Unset means generate fails, nothing else does. |
| `LOCAL_DEV` | No, must be unset | Lets `isLocal()` treat loopback/LAN as the owner under `NODE_ENV=production`. Build fails if `true` in prod. |

`VERCEL_ENV` is set by Vercel and gates both the env check and the build-time migration. `PORT` overrides the Playwright server port (default 4399).

## Sharing

- `share_url` is `/demo?name=<slug>`. Both `/` and `/demo` run `generateMetadata` (`app/share-metadata.js`): given `?name=<slug>` or `?id=<uuid>` it looks up a public, non-deleted row and emits that design's title, description (pattern or description column) and an `og:image` of `/api/og?name=<slug>`. Slack, iMessage and similar unfurl with the diagram itself.
- `/api/og` renders the card server-side: `lib/render-og.js` builds an SVG (brand mark, title, pattern line, chips, diagram preview with notes), and `@resvg/resvg-js` rasterises it with the bundled Roboto fonts. Cached 1 hour.
- A private design gets no card and no title: `generateMetadata` returns the generic site tags and `/api/og` redirects to the static `/og.png` with `no-store`, so the instant it is published the next crawl gets the real card.
- Opening a private design's link as a visitor is a `404` from the API, and the page shows its not-found state.
- In the app, opening the Share panel on a private diagram publishes it first (`PATCH { is_public: true }`), then previews the card and copies the link. The Public / Private pill toggles it back at any time.
- `/demo` with no query is the public landing: the 12 curated `DEMO_SLUGS`, only while each is still public.

## Tests + CI

| Suite | Tool | What it covers |
|-------|------|----------------|
| `tests/unit` (38 files) | Vitest, node env, React Testing Library for views | Every handler, auth (Bearer, session, `SESSION_MIN_IAT`, is-local), env guard, rate limit, slugs, the shared design validator and the AI generate gate, layout and start-left rule, snap-align, Mermaid parser, SVG/OG renderers, share metadata, gallery and detail views. Coverage thresholds: lines 60, statements 60, branches 65, functions 35. |
| `tests/e2e` (7 specs) | Playwright | Project `api` (`api`, `share`): health, 401 on bad token, 400 with sample, generate rejects Bearer, create/read/delete round trip, OG tags and PNG for public vs private, soft delete. Project `browser` (`render`, `snap`, `arrange-undo`, `share-ui`, `panel-memory`): `/?id=` and `/?name=` render, phone opens at a readable zoom, Cmd+drag snap, undo/redo, Share publishes and yields a working link, badge slides along its edge, panel memory survives back-and-reopen. |

Playwright builds and starts a production `next start` on port 4399 (strict CSP, dev bypass off), so the specs exercise what ships.

`.github/workflows/ci.yml` runs on every PR and push to `main`: Postgres 16 service, Node 22, `npm ci`, throwaway secrets, `npm run lint`, `npm run test:coverage`, `npm run migrate`, Playwright Chromium install, `npm run test:e2e`.

`.github/workflows/prod-monitor.yml` runs every 15 minutes, on every push to `main`, and on demand: asserts `GET /api/health` is `200` with `ok:true`, then POSTs to `/api/ai/flows` with a bad token and requires `401` (proves the route is up and gated, never creates a row).

## Features

- **Canvas editing** - React Flow canvas with Fit, Arrange (dagre, left-to-right, step-ordered), Undo/Redo (Cmd+Z / Cmd+Shift+Z) covering drags and Arrange, and snap-align: hold Cmd, Ctrl or Shift while dragging to snap a node onto a neighbour's line with a yellow guide. Owner drags are saved through `PATCH { nodes }`. The canvas auto-fits the whole diagram on every device and re-fits when a phone is rotated; pinch-zoom covers the detail.
- **Steps** - every edge becomes a numbered step badge; badge style cycles Silver / Color / Dark / Plain; a badge slides along its own edge (`labelT`, 0.12..0.88), persists, and double-click resets it.
- **Per-node notes** - a note (max 400 chars) under any node, with light markdown (`**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `` `code` ``) and URLs drawn as blue links that show their ticket key. Owner edits inline (`PATCH { notes }`), and the note renders in the app, on shared links, in the SVG export and on the OG card; the export draws the note as typed, marks included. A line from a card's bottom face runs to the card's border under the note.
- **Per-node info** - a plain-text info (max 600 chars) for what a node is and why it is in this diagram, shown as `<card name> is <text>` with the name in bold, 1 popover open at a time. Owner edits inline (`PATCH { notes }`, same body as note), hidden until the reader hovers or clicks the i badge on the card; not in the SVG export.
- **Per-node sunset** - a boolean marking a node as today's path being decommissioned. Drawn light silver and dimmed, icon in greyscale, the red X on the badge of every edge into it, and every edge touching it (in or out) light silver, immune to any line style; no X on the card. Silver is reserved for this state; never paint a node grey or silver to mean retired, set `sunset` instead. A node with no colour of its own falls back to black. Owner edits inline (`PATCH { notes }`, same body as note and info).
- **Swimlanes** - optional bands under the cards, configuration only (no canvas control): `view_state.lanes` as rows `{ id, title, y, h, color?, size? }` for a top-down layout or columns `{ id, title, x, w, color?, size? }` for a left-to-right one (`size` is the title in px, default 13), set through `PATCH { view_state: { lanes } }` or MCP `update_flow { lanes }`; each spans the whole diagram on its other axis and is drawn the same on canvas, SVG and GIF.
- **Panel memory** - which panels (Steps, Share, Code) and badge style were open is stored per diagram in `view_state` and restored on reopen. Visitors on a shared link never get panels.
- **The current** - clicking the "Start here" pill opens the Current panel: speed 0.5x, 1x, 1.5x or 2x and the TOTAL number of small dots (20, 50, 100, 200, 500, 1000, 2000, 5000) spread over the diagram's lines, under the 1 big dot that says which step is live. Both live in `view_state.current`, 1 column on that 1 row, so the setting is per diagram - a busy map can run 5000 dots while a 6 line flow runs 20 - and they travel into the SVG and GIF exports, so a picture plays the current that diagram was left running at.
- **Summary card** - the "what it tests" and goal lines sit over the canvas. Tap to fold them into a badge; on a phone it starts folded so the diagram gets the screen. Set the text with `pattern` and `description` on create.
- **Sharing + cards** - the Share panel previews the real 1200x630 card, copies the `/demo?name=<slug>` link, and offers PNG (html-to-image), JSON, and code exports plus the Web Share API. Opening Share publishes the diagram.
- **Public / Private** - a pill on every owned diagram toggles `is_public`. Private diagrams 404 for anyone else and preview as the generic site card.
- **Gallery** - My Diagrams / Demos tabs, title search, and an All / Work / Personal scope over your own diagrams (matches a `work` or `personal` entry in the row's `tags[]` - nothing in the app writes those tags, they are set on the row). Private cards carry a badge. `/demo` is a curated 12-slug public roster ordered by difficulty.
- **Trash** - Delete in the app or `DELETE /api/flows/:id` is a soft delete (`deleted_at`). Restore and list-trash exist only through MCP; permanent purge is `?purge=1` or the MCP `purge_flow` tool, and only for a row already in trash.
- **Paste Mermaid** - paste a `graph LR` / `graph TD` block anywhere on the page and it renders as a diagram. An Import Formats modal copies ready-to-use templates.
- **Bring your own logo** - a node is either a catalog service key or carries an `icon` (https URL, `data:image/...` URI, or a same-origin image path like `/brand/foo.svg`). Remote icons are fetched once and inlined. 1 validation policy (`lib/validate-design.js`) is shared by the API, the MCP server and AI generate: nodes with no resolvable logo are rejected, `color` must be a 6-digit hex, and the size caps hold everywhere.
- **AI generate (owner only)** - prompt to diagram via `POST /api/ai/generate`. Gated to the signed-in owner; the public Bearer key is rejected so nobody else can spend Anthropic credits. The model's output passes the same logo gate and is arranged like an API create.
- **MCP server** - 14 tools for any MCP agent (create, read, update, lock, soft delete, restore, purge, list trash, list services, schema, list/get/restore version history). See [mcp/README.md](./mcp/README.md).
- **Public API** - `POST /api/ai/flows` renders a finished `{ nodes, edges }` structure into a saved diagram and returns its URLs. No model call.
- **Security** - per-request CSP nonce in `middleware.js` (no `unsafe-inline`, no `unsafe-eval` in prod), HSTS / X-Frame-Options / nosniff headers in `next.config.mjs`, constant-time Bearer compare, HMAC-signed owner session cookie, per-instance rate limits on every route.
