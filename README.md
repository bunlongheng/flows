# <img src="docs/icon.png" width="36" height="36" align="top" alt=""> Flows

AWS and GCP architecture diagrams an agent can draw and a README can embed.

Describe a system, get a React Flow canvas back: 118 real services with real logos, laid out for you, with per-node notes and numbered steps you can walk a room through. Every diagram is a row in Postgres, and the same row renders back out as JSON, a self-contained SVG or an animated GIF from a plain URL - so the picture in your docs is the diagram, not a screenshot of one that drifted 3 commits ago. An id that resolves to no logo is rejected at create time, which is why a diagram a model made looks like one a person made.

![The Flows canvas: a Twitter fan-out design with numbered steps, per-edge labels and the Steps panel open](docs/screenshots/hero.webp)

[![CI](https://github.com/bunlongheng/flows/actions/workflows/ci.yml/badge.svg)](https://github.com/bunlongheng/flows/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![React Flow](https://img.shields.io/badge/React%20Flow-12-FF0072?logo=reactflow&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-232%20unit%20%2B%2027%20e2e-34C759)

**Live:** [flows-bheng.vercel.app](https://flows-bheng.vercel.app) &middot; **Demo wall:** [/demo](https://flows-bheng.vercel.app/demo)

## Features

- **118 real logos** - a node whose id has no logo is refused, so a diagram never shows a lettered box.
- **Or bring your own** - an `https` or `data:` icon is fetched once and stored inside the diagram.
- **It places itself** - leave `x`/`y` out and the server lays the nodes out before it saves them.
- **A diagram is a URL** - the same row as JSON, SVG or animated GIF. New ones are private until you publish.
- **It reads like a story** - notes, numbered steps, a Details panel, flowing dots, 4 badge styles.
- **3 ways in** - the canvas, an HTTP API with a token, or 10 MCP tools. Delete is soft, so you can undo it.

## Read this before you clone

This is a working app, not a library. It needs 3 things from you, and 1 more if you want the AI part.

| You provide | Why | Free option |
|---|---|---|
| **Postgres** | Every diagram is a row here, no SQLite fallback | Neon, Supabase, Railway |
| **Google OAuth** | The only sign-in, 1 owner email | Google Cloud Console |
| **A host** | A Next.js server, not a static site | Vercel, or localhost |
| **Anthropic key** | Plain-English generation only | optional |

## For agents

1 Bearer-authed POST returns a URL. Omit the positions and the layout engine places the nodes for you; pass `is_public: true` if the link has to work for anybody but you.

```bash
curl -X POST "$APP/api/ai/flows" \
  -H "Authorization: Bearer $FLOWS_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"title":"URL Shortener","is_public":true,
       "nodes":[{"id":"user"},{"id":"apigw"},{"id":"lambda"},{"id":"dynamo"}],
       "edges":[{"source":"user","target":"apigw"},
                {"source":"apigw","target":"lambda"},
                {"source":"lambda","target":"dynamo"}]}'
```

Once it is public, the URL is the image - no auth, no browser, animated:

```markdown
![Architecture]($APP/api/flows/url-shortener-like-bitly?format=gif)
```

<a href="https://sequences-bheng.vercel.app/s/6b8d7e1e-2028-4941-8f7d-2c75eaa747ea">
  <img src="docs/diagrams/create-flow.svg" alt="Create Flow Diagram: an agent posts a diagram, Flows stores it, and the same URL renders it back" width="880">
</a>

<sub>Made with [Sequences](https://sequences-bheng.vercel.app).</sub>

## Quick start

```bash
git clone https://github.com/bunlongheng/flows.git
cd flows
cp .env.example .env               # DATABASE_URL, AUTH_SECRET, OWNER_EMAIL, FLOWS_API_SECRET
npm install
npm run migrate                    # applies db/migrations to a fresh database
npm run dev                        # http://localhost:5174
```

`npm test` runs 232 unit tests, `npm run test:e2e` runs 27 Playwright tests.

## Configuration

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_SSL` | `true` for a remote database |
| `AUTH_SECRET` | Session-cookie secret. `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | Its secret. Callback `/api/auth/callback` |
| `OWNER_EMAIL` | The 1 account allowed to sign in |
| `OWNER_USER_ID` | The id its diagrams are stored under |
| `FLOWS_API_SECRET` | Bearer for the API and MCP. Server-only |
| `ANTHROPIC_API_KEY` | Plain-English generation. Unset disables it |
| `FLOWS_APP_URL` | Absolute links in responses and share pages |

`lib/env.js` fails the build when a required variable is missing, so a misconfigured deploy never ships a dead API.

## API

| Route | Auth | Returns |
|---|---|---|
| `POST /api/ai/flows` | Bearer | A new diagram, with `url` + `share_url` |
| `GET /api/flows/:id` | Public | JSON, `?format=svg` or `?format=gif` |
| `GET /api/flows/public` | Public | The curated demo roster |
| `GET /api/og?name=slug` | Public | 1200x630 share card |

`:id` takes a uuid or a slug. The GIF takes `?frames=` (2-30) and `?w=` (200-1600).

**MCP.** `mcp/server.mjs` exposes 10 tools over stdio. Register it with your agent and point `FLOWS_API_SECRET` at your deployment. Full reference in [docs/API.md](docs/API.md) and [mcp/README.md](mcp/README.md).

## Contributing

Issues and pull requests are welcome. Run `npm run lint`, `npm test` and `npm run test:e2e` before opening one.

## License

[MIT](LICENSE) (c) Bunlong Heng

---

<div align="center">

<a href="https://bunlongheng.com"><img src="https://img.shields.io/badge/bunlongheng.com-3A3A3C?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWAQMAAAD+ev54AAAABlBMVEVMaXH///+a4ocPAAAAAXRSTlMAQObYZgAAAAlwSFlzAAAD6AAAA+gBtXtSawAAAC1JREFUCNdjYEADzP+A+D8INzAwvwfi4w0QNlCMcX8DAyOQzfgcKgcVB+lBAwANvRHlhhcQugAAAABJRU5ErkJggg==" alt="bunlongheng.com"></a>
<a href="https://www.linkedin.com/in/bunlongheng/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
<a href="https://www.instagram.com/ibunlong/"><img src="https://img.shields.io/badge/Instagram-C13584?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"></a>
<a href="mailto:bheng.code@gmail.com"><img src="https://img.shields.io/badge/Email-2E7D32?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"></a>

<br>

Built by **[Bunlong](https://bunlongheng.com)** &nbsp;&middot;&nbsp; [more apps](https://bunlongheng.com/projects)

</div>
