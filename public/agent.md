# Flows - instructions for agents

You are an agent posting a diagram to Flows. No human is in the loop. Follow this file exactly.

Base URL: `https://flows-bheng.vercel.app`
Auth: header `Authorization: Bearer <FLOWS_API_SECRET>` on every POST. GET is public.

## 1. Post a diagram

```
POST /api/ai/flows
Content-Type: application/json
Authorization: Bearer <FLOWS_API_SECRET>

{
  "title": "URL Shortener",
  "is_public": true,
  "pattern": "Read-heavy redirect path",
  "description": "A short link is looked up in cache first, then in the table.",
  "nodes": [
    { "id": "user" },
    { "id": "apigw" },
    { "id": "lambda", "note": "Resolves the slug." },
    { "id": "dynamo" }
  ],
  "edges": [
    { "source": "user",   "target": "apigw",  "label": "GET /abc" },
    { "source": "apigw",  "target": "lambda" },
    { "source": "lambda", "target": "dynamo", "label": "read" }
  ]
}
```

| Field | Rule |
|-------|------|
| `title` | Required. Max 200 chars. |
| `nodes[]` | Required. 1 to 100. Each `{ id, label?, sub?, note?, info?, sunset?, iconFrame?, icon?, image?, color?, position?, size?, iconSize? }`. `iconFrame: true` draws a 1 px grey frame around a white-edged icon tile (set by itself on MCP create when most of a PNG icon's outer ring is white). `size` is optional `{ w, h }` 130..600 px, the card size on the canvas; icon cards default to 180x180, picture cards to 240x225. `iconSize` is optional `{ w, h }` 16..600 px, the icon or photo drawn inside the card (default 48x48 icon, photo fills the card). |
| `edges[]` | Optional. Max 300. Each `{ source, target, label?, description?, animated? }`. Ids must exist in `nodes`. The tag on the line reads `label`, or `description` (max 300) cut short when there is no label; hovering the tag shows the whole description. |
| `is_public` | Set `true`. A private diagram gives everyone else a 404 and the GIF will not embed. |
| `pattern` | Optional. Max 200 chars. 1 line shown above the diagram. |
| `description` | Optional. Max 600 chars. |
| `nodes[].note` | Optional. Max 400 chars. Shown under the node. Light markdown: `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `` `code` ``, 1 level. A URL becomes a blue link showing its ticket key (SHAR-7977) or its bare address. |
| `nodes[].info` | Optional. Plain text, max 600 chars. What the node is and why it is in this diagram; hidden until the reader hovers or clicks the i badge on the card, 1 open at a time. Shown as `<card name> is <text>`, so write it to read after "is". Not in the SVG. |
| `nodes[].sunset` | Optional. Boolean. `true` marks a node that is today's path and gets decommissioned: drawn light silver and dimmed, icon in greyscale, the red X on the badge of every edge into it, and every edge touching it (in or out) light silver, immune to any line style; no X on the card. Silver is reserved for this; never paint a node grey or silver to mean retired, set `sunset` instead. A node with no colour of its own falls back to black. |
| `position` | Omit it. The layout engine places the nodes. |
| `return` | `"svg"` to get the rendered SVG back in the same response. |

## 1b. A repo audit gets a picture, not a row

Add `"source": "repo-audit"` to the body above. The API renders the SVG and stores NOTHING: the answer is `200 { "stored": false, "source": "repo-audit", "svg": "<svg ..." }`, with no id, url or gif. Embed the svg in your report; the owner's gallery never sees an audit diagram. Put swimlanes in the same body as `"lanes": [...]` (section 4c), there is no row to patch later. `"store": false` does the same for any other caller that only needs the picture.

## 2. Pick the node kind

Every node must render a real logo. There are 3 kinds:

1. **Catalog node.** `id` is a known service key such as `user`, `client`, `apigw`, `lambda`, `dynamo`, `s3`, `sqs`, `sns`, `kafka`, `redis`, `postgres`, `mysql`, `mongodb`, `cloudfront`, `elb`, `nginx`, `ec2`, `kms`, `cloudwatch`. The full list is `GET /api/services` (`{ count, services: [{ id, label, sub }] }`). Any `icon` or `color` you pass on a catalog node is ignored.
2. **Custom icon node.** Any `id` you like, plus `icon` and `label`. `icon` is an `https://` image URL (fetched once, must be `image/*`, at least 96px, max 24KB, no redirects) or a `data:image/...;base64,` URI (max 24KB).
3. **Picture node.** Any `id`, plus `image` and `label`. `image` is a `data:image/(png|jpeg|webp|gif);base64,` URI or an `https://` image URL (max 8MB). It is stored as a 640x480 JPEG and drawn as a 4:3 photo card. File paths and `airclips:` refs work only through the MCP server, not this API.

## 3. Read the response

`201`:

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

Hand people `share_url`. Paste `readme` into a README or Confluence page as is.

| Status | Meaning | What to do |
|--------|---------|------------|
| `400` | Body invalid. `error` says which rule failed and `sample_request` shows a valid body. | Fix the body from `error`. Do not retry the same body. |
| `401` | Bearer missing or wrong. | Stop. Ask for `FLOWS_API_SECRET`. |
| `429` | More than 60 creates in 1 minute. | Wait 60s. |

## 4. Fetch it back

- `GET /api/flows/<id-or-slug>` JSON.
- `GET /api/flows/<id-or-slug>?format=svg` static SVG.
- `GET /api/flows/<id-or-slug>?format=thumb` the gallery tile: the owner's last capture of the real canvas as a JPEG; until they open it, a PNG of the SVG render.
- `GET /api/flows/<id-or-slug>?format=gif&w=1800&frames=20` animated GIF, HD and smooth by default (1800 px, 20 frames, the diagram exactly as the app shows it). `w` 200 to 3200, `frames` 2 to 30; `w=3200` for a full-width wiki page.

## 4b. Undo a change

Every `update_flow` (MCP) or `PATCH /api/flows/:id` is versioned - the state from just before that write is kept.
Pass `reason` on `update_flow` so the history reads well; it lands on the version that write replaced.
Pull a change back with MCP `list_versions` then `restore_version`, or `GET .../versions` then
`POST .../versions/:vid/restore`. A restore is itself a version, so it is always safe to undo too.

## 4c. Swimlanes (configuration only)

Lanes are bands under the cards, 1 per layer of the system, with a title and an optional colour. There is no canvas button: an agent sets them with MCP `update_flow { id, lanes }` or `PATCH /api/flows/:id { "view_state": { "lanes": [...] } }`.

- Rows for a top-down layout: `{ "id": "apps", "title": "Sender apps", "y": 120, "h": 580, "color": "#B464DC" }`.
- Columns for a left-to-right layout: `{ "id": "apps", "title": "Sender apps", "x": 15, "w": 565, "color": "#B464DC" }`.
- `size` (optional, 10 to 40) is the title in px, default 13: `{ "id": "apps", "title": "Sender apps", "y": 120, "h": 580, "size": 18 }`. Canvas, SVG and GIF draw the same number.
- 1 kind per diagram, max 12, thinnest 80, canvas units; lanes pack from the first with equal 40 px gaps and span the whole diagram on their other axis.
- A card is 190 x 180 plus its note: size the lane so every card stands inside it, never move a card to fit a lane.
- `lanes: []` removes them; a `view_state` save without a `lanes` key keeps them. With lanes on, no Start pill is drawn.

## 5. Do not

- Do not send `position`, `type`, `tags` or `difficulty`.
- Do not send a catalog id with a made-up `icon`. The icon is dropped.
- Do not try to update or delete through this API. Those need the owner's session. Every flow starts with both locks on: `locked` (nobody deletes it until the owner unlocks it in the app) and `edit_locked` (agents cannot change it until the owner unlocks it in the app). MCP `lock_flow` can turn a lock on, never off. If you need to change or trash a flow, ask the owner to lift the lock.
- Do not put secrets, tokens or emails in a title, note or description. They are public.
