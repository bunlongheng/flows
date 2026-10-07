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
| What is a legal `view_state`? | `src/view-state.js` for `panels` / `badge` / `start`, `src/lanes.js` for `lanes`. |
| What does the HTTP API take? | `docs/API.md`, and the `400` response itself: it carries `required_fields` and a full `sample_request`. |
| What does the MCP take? | `mcp/README.md`, and each tool's own parameter descriptions. |
| What colour is this card? | `src/iconColor.js` `isNeutralColor`. The colour comes off the icon; do not pick one. |

## The 6 things that bite

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
   saturated; a grey or near-black is treated as a guess and replaced. Silver is
   reserved for `sunset: true`, so never paint a card grey to mean retired.
5. **Turn the Steps chips on when order matters**: `update_flow { id, view: {
   panels: ["steps"] } }`, or `view_state` on create. Shipping a numbered flow
   with the numbers hidden makes the reader hunt for a button.
6. **Spacing is not free-form.** A card is 180 x 180 (a picture card 240 x 225)
   plus its note below. The auto-layout allows 190 a card, 150 between columns
   (a 340 column pitch) and 95 between stacked cards (a 275 row pitch), which is
   what buys a step chip its 100 px of clear line. Omit `x`/`y` and let it lay
   out; if you place cards by hand, match that pitch. Inside swimlanes, a card
   sits fully within 1 band and never straddles a divider.

## Which door to use

- **MCP** (`mcp/server.mjs`) for anything about content: creating a diagram,
  changing icons, labels, notes, lanes or how it opens. It validates with zod
  and carries the field documentation inline.
- **HTTP API** (`docs/API.md`) for the canvas's own saves and for bulk edits
  from a script. Note the asymmetry: `PATCH { nodes }` MOVES cards only and
  answers `200` without touching an icon or a label, so a branding change that
  goes through it is silently a no-op. Use the MCP, then read the row back.
- **AWS icons** come from <https://aws-icons.com/> (the official AWS
  Architecture set) and nowhere else.

## Before you claim it works

Read the row back. `get_flow` returns what was actually stored, which is the
only evidence that a field survived both doors. `npm test` is the unit gate;
E2E needs the whole env exported (`set -a; source .env; set +a`) and must never
be pointed at the launchd server on port 5174, whose `LOCAL_DEV=true` keeps the
auth bypass alive and makes every privacy check pass for the wrong reason.
