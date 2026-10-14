<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Flows

A diagram app. One Postgres row per diagram: `{ title, nodes, edges, view_state }`.
The canvas, the HTTP API, the MCP server, the SVG/GIF renderer and 4 interchange
exporters all draw the same row, so a field is only real when every one of them
agrees about it.

## Do not restate the rules. Read them.

Everything about what a diagram may contain already exists in exactly 1 place
each. Point at these rather than copying them, because a 4th copy is a 4th thing
to drift:

| Question | The 1 answer |
|---|---|
| What fields may a node or edge carry, and what are the live rules? | `get_diagram_schema` (MCP tool). Call it first, every time. It returns the rules and a complete worked example. |
| Is this node allowed at all? | `lib/validate-design.js` - the logo gate, plus the caps (100 nodes, 300 edges, 24 KB an inline icon). Shared by the API, the MCP and AI generate. |
| What is a legal `style`? | `src/style.js`. `cleanStyle` is the validator; the panel cannot send anything it does not accept. |
| What is a legal `view_state`? | `src/view-state.js` for `panels` / `badge` / `start` / `current`, `src/lanes.js` for `lanes`. |
| What does the HTTP API take? | `docs/API.md`, and the `400` response itself: it carries `required_fields` and a full `sample_request`. |
| What does the MCP take? | `mcp/README.md`, and each tool's own parameter descriptions. |
| What colour is this card? | `src/iconColor.js` `isNeutralColor`. The colour comes off the icon; do not pick one. |

## The 7 things that bite

1. **An update replaces the whole array.** `update_flow` / the API with `nodes`
   or `edges` swaps that list wholesale. Send every node, not only the one you
   changed: one you leave out is GONE. Hand work you merely omit (node `size`,
   `iconSize`, `style`; edge `style`, `labelT`, `bend`) is carried back over
   from the stored row by `lib/owner-work.js`, but that is a safety net, not a
   licence to send a short list.
2. **Give every edge a stable `id`.** With no id, a line's identity falls back
   to its ARRAY INDEX (`e0`, `e1`, ...), so inserting a line in the middle
   silently re-points the styling, the dragged badge and the step number of
   every line after it. The id also picks which line of a shared trunk carries
   the only badge (lowest wins).
3. **The edges array order IS the diagram.** It numbers the Steps chips 1..N and
   it is the path the single current walks, 1 line at a time. Order it the way a
   reader should read the diagram, not the order you happened to discover things.
4. **Do not set `color`, and usually not `style`.** A card draws in its own logo
   colour, which is almost always right. An explicit colour only wins when it is
   saturated; a grey or near-black is treated as a guess and replaced. Status is a
   flag, never a colour (owner rule 2026-10-13): `sunset: true` draws red and
   cracked with a red dashed line, `new: true` draws green with a NEW pill, so
   never paint a card red, green or grey to mean retired or new. Lines are solid
   with an arrowhead; `style.bs: "dashed"` is an interim path and `style.head`
   (end, start, both, none) sets direction. The legend explains whatever is used.
   HARD GATE (owner rule 2026-10-11): a border never fights its own tile. When
   1 colour plainly is a raster icon, every save repaints the card in it
   (`lib/logo-color.js` `tileColor`), and `npm run check:colors` must print 0.
5. **Turn the Steps chips on when order matters**: `update_flow { id, view: {
   panels: ["steps"] } }`, or `view_state` on create. Shipping a numbered flow
   with the numbers hidden makes the reader hunt for a button.
6. **Spacing is not free-form.** A card is 180 x 180 (a picture card 240 x 225)
   plus its note below. The auto-layout allows 190 a card, 150 between columns
   (a 340 column pitch) and 95 between stacked cards (a 275 row pitch), which is
   what buys a step chip its 100 px of clear line. Omit `x`/`y` and let it lay
   out; if you place cards by hand, match that pitch. Inside swimlanes, a card
   sits fully within 1 band and never straddles a divider.
7. **No 2 lines on 1 track, ever** (owner rule 2026-10-09). The router
   (`src/edgeGeometry.js`, shared by the canvas and the export) reserves every
   drawn leg in edges order and moves a later line off it, but it cannot invent
   room: cards packed so tight that only 1 track fits between them force a
   share. After any create or move, run `npm run check:overlaps`; it renders
   every stored flow and must print 0. A flow it lists needs its cards moved
   apart, never a hand `bend` to paper over it. The same goes for tags: an
   auto-placed tag slides along its own line off any earlier tag (its leader
   grows when the line is too short), and the check fails on 2 tags touching.
   Never drop a hand `labelT` on top of another tag.

## Status, lines and legend payload (2026-10-13)

| Field | Where | Values | Effect |
|---|---|---|---|
| `sunset` | node | `true` | red card, cracked, red dashed lines, red X on badges |
| `cracked` | node | `false` | a sunset card stays whole (no crack), still red; default cracked |
| `new` | node | `true` | green border and wash, NEW pill |
| `tooltip` | node | text, max 200 | shown on hover; not in the SVG |
| `tooltipColor` | node | `#rrggbb` | fill of the tooltip and its callout, default red; text auto white or ink |
| `pinTooltip` | node | `true` | the tooltip stays visible above the card as a red callout (app and SVG); needs `tooltip` |
| `style.head` | edge | `end` (default), `start`, `both`, `none` | arrowhead direction |
| `style.bs` | edge | `solid` (default), `dashed`, `dotted` | dashed = interim or optional path |
| `style.arrow` | edge | `step` (default), `curved`, `straight`, `brace` | line shape. Lines default to straight whenever the 2 cards face each other. 2+ lines leaving 1 side of a card always split as a square, symmetric brace (stem, bar halfway, a straight leg per line), each with its own badge, whatever their labels; a curve only when the brace is blocked. `brace` on lines into 1 card splits them the same way instead of merging into 1 trunk |
| `panels` | `view_state` / MCP `view` | `arrows-off`, `legend-off`, `badge-x-off`, `tags-above` | hide arrowheads / the bottom-left legend / the red X on retiring badges (all on by default); `tags-above` lifts every badge just off its line so the arrowhead shows |
| `fonts` | `view_state` / MCP `view` | `{ title, sub, tag }, each 8-22` px | text size for the whole diagram (default 12 / 10 / 8.5); send only what changes; the panel's 1 Text size slider scales all 3 together at those ratios |
| `passcode` | HTTP `PATCH` only, owner | text, `""` clears | locks the share behind a passcode |

Node fields go through `create_flow` / `update_flow` (whole `nodes` list) or
`PATCH { notes: [{ id, sunset?, cracked?, new?, tooltip?, pinTooltip?, tooltipColor? }] }`. The legend lists only what
the diagram uses. A running MCP server is a snapshot: restart it after a deploy
or these fields are silently stripped. Field detail: `docs/API.md`, `mcp/README.md`.

## Which door to use

- **MCP** (`mcp/server.mjs`) for anything about content: creating a diagram,
  changing icons, labels, notes, lanes or how it opens. It validates with zod
  and carries the field documentation inline.
- **HTTP API** (`docs/API.md`) for the canvas's own saves and for bulk edits
  from a script. Note the asymmetry: `PATCH { nodes }` MOVES cards only and
  answers `200` without touching an icon or a label, so a branding change that
  goes through it is silently a no-op. Use the MCP, then read the row back.
- **AWS icons** come from <https://aws-icons.com/> (the official AWS
  Architecture set) and nowhere else. `node scripts/sync-aws-icons.mjs` reports
  any file that has drifted from what the site serves, `--write` pulls the
  artwork in, and `tests/unit/aws-icons-source.test.js` fails the build when an
  AWS icon has no source. An AWS logo also stands for an AWS SERVICE and
  nothing else: PostgreSQL, MySQL, Cassandra, Elasticsearch and Kafka draw
  their own marks, never RDS / Keyspaces / Amazon OpenSearch Service / MSK.

## Before you claim it works

Read the row back. `get_flow` returns what was actually stored, which is the
only evidence that a field survived both doors. `npm test` is the unit gate;
E2E needs the whole env exported (`set -a; source .env; set +a`) and must never
be pointed at the launchd server on port 5174, whose `LOCAL_DEV=true` keeps the
auth bypass alive and makes every privacy check pass for the wrong reason.
