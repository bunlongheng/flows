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
| `nodes[]` | Required. 1 to 100. Each `{ id, label?, sub?, note?, icon?, image?, color?, position? }`. |
| `edges[]` | Optional. Max 300. Each `{ source, target, label?, animated? }`. Ids must exist in `nodes`. |
| `is_public` | Set `true`. A private diagram gives everyone else a 404 and the GIF will not embed. |
| `pattern` | Optional. Max 200 chars. 1 line shown above the diagram. |
| `description` | Optional. Max 600 chars. |
| `nodes[].note` | Optional. Plain text, max 400 chars. Shown under the node. |
| `position` | Omit it. The layout engine places the nodes. |
| `return` | `"svg"` to get the rendered SVG back in the same response. |

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
  "gif_url": "https://flows-bheng.vercel.app/api/flows/<slug>?format=gif&w=3200",
  "readme": "![<title>](https://flows-bheng.vercel.app/api/flows/<slug>?format=gif&w=3200)"
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
- `GET /api/flows/<id-or-slug>?format=gif&w=3200` animated GIF. `w` 200 to 3200, `frames` 2 to 30.

## 5. Do not

- Do not send `position`, `type`, `tags` or `difficulty`.
- Do not send a catalog id with a made-up `icon`. The icon is dropped.
- Do not try to update or delete through this API. Those need the owner's session. A diagram with `locked: true` is embedded somewhere and refuses changes anyway.
- Do not put secrets, tokens or emails in a title, note or description. They are public.
