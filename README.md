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
- **3 ways in** - the canvas, an HTTP API with a token, or 11 MCP tools. Delete is soft, so you can undo it.

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
![Architecture]($APP/api/flows/url-shortener-like-bitly?format=gif&w=3200)
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
| `POST /api/ai/flows` | Bearer | A new diagram, with `url`, `share_url`, `gif_url` and a paste-ready `readme` line |
| `GET /api/flows/:id` | Public | JSON, `?format=svg` or `?format=gif` |
| `GET /api/flows/public` | Public | The curated demo roster |
| `GET /api/og?name=slug` | Public | 1200x630 share card |

`:id` takes a uuid or a slug. The GIF takes `?frames=` (2-30) and `?w=` (200-3200); `w=3200` is the README width, sharp on retina at any zoom.

**MCP.** `mcp/server.mjs` exposes 10 tools over stdio. Register it with your agent and point `FLOWS_API_SECRET` at your deployment. Full reference in [docs/API.md](docs/API.md) and [mcp/README.md](mcp/README.md).

## Contributing

Issues and pull requests are welcome. Run `npm run lint`, `npm test` and `npm run test:e2e` before opening one.

## License

[MIT](LICENSE) (c) Bunlong Heng

---

<div align="center">

<a href="https://bunlongheng.com"><img src="https://img.shields.io/badge/-bunlongheng.com-3A3A3C?style=for-the-badge&amp;labelColor=2A2A2C&amp;logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y%2BmAAADAFBMVEXx8vLq6v%2F19fX09PT8%2Ff309PT5%2BfnAwMBMaXHx8vL19fX5%2Bfny8vL09PT39%2Ff6%2Bfn6%2Bvr09PTx8fH4%2BPn%2F8vLy8%2FP09PTz8%2FPy8vL%2F%2F%2F%2Fz9PTz9PP19fby8vP19PXz8%2FT19%2Fb08%2FTx8vLy8vL09vby8%2FL29vf19fTv8PDz9vb7%2Bvn%2F%2Ff%2F9%2Ff3w8vH29fb%2F%2FP339%2Ff5%2Bfn59%2Ff19PT09PR7rao3VF3%2F%2Fv8AKDR6sqsBV1vv8fL4%2BPiux8b8%2Bvq90NDy8%2FR%2BlpppnZyZqrACLTxclZJSkI9en5ssZ2luqaUAeWgqbW4BX1gCfG0%2Fa3QaVG0MN0UKNUKUpKsGpYMAKjoRQ1UDf3AQRloJqIgEm32d0cUBg3ElbnQIln8eVWgrmIdP0KzF5d5s2acdfHwppJCP5MMXl4Tz8%2FLv8%2FP39%2FiewL5%2BqahYf4IrTFZkk5KlxsREiIYAHiqDnKFmnJowc3IdVllvpKK7zc3D2tnk5%2BmuycdwpKKuub2yv8Ly%2B%2FkAMT7z%2Bvjq7e09gH93q6kGdWpGgoJZmJSlw8M7c3WwyceTw76w1M8mYmpFfX8lW2AFOEpGiYhxqqRrqaRb2rdIsZ8AVE91jpU7d3t3saqBoKhako4AWVEcUlg3aWwDupAHb2YwmIkPP1ERSVA7WmZ8tq8HT14oZW%2BYuLsMl3wQT10ROksENUc8Z3MJSGVLh4dqpJ%2BXr7U51awUgHM4v6ad1MkPuJZAiowVd3IEhnZH0aoYrI05p5sDtYwkzZ8EPViYxsRel5USbHAIgmwIM0gQamzU4uF2malQi4oWQFQ1zaYrp4UXlYwfiHoyxqFE1q4qeX4yn5JIxKkdrX1b1rAbWGvd5Oh91sRijpomsJEVc3Ukc34dqIcwuJVKwZIXkoQZcXlNv5g%2BqZUZvpNl2rPG9N0WkIoNqouW4sVPwp%2BM0b6h0ssfq4d%2F1r8hpo%2Fh9e4AamUjnI9avaBixqgklYWSwL4xtItUxplYl5qZ58mq78wMgnYXfnlOmJaR1L%2Bj78ny9fS%2FrXQPAAAAFXRSTlP7Brvx%2FsJhAgD87r4U72C4uGH8vhRDodYHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAC6UlEQVQokS2Sd3BUVRSHb0KS3QRCiZw5t%2By9j33zXjZkyUs2uekhEAi9dwRCL4JUEQRFAQUs9A4WOopKU0GpFoqCBZUivaqoFKkWLIS5GX7%2FfnPO78yZj%2Fj8UTViK6HggvNgSGuluEZRKbZqlN9H%2FFWiWUzIFQK5fhjOIRTDoqv4ia86S4q3KSByHdSqIhxofBKr5iNxLMm2bQqWVkorJ%2BAkO46nkQJhceSRmCTDvKJIJBLJzMxMLU6POJ4eBPF1KpNEbdt2Cms4LCcnZ%2FX6D3d%2BsKJJ7VSlNLoqgbjUtmkKKxlVmpf3bsFXW3d1b77gueJAQIPQBCilkMKemNi23Ts9T35%2FaMe2rsvmTypylGUFCSIYWJLXrm2nUwOPfNO5w%2B73Okxnjqe0JigQEL3JizoeONr%2F2u99vju4fd1rdZnyspQmnGvAUBprWNqz348%2FhXN%2F6P1%2By4Uvs%2FJkpRQRwpJBRVn7vf16Dfitz5XevQqWt3yalXtKaRIUQmglWfsu5y7%2BMrDs0TMftWo1ZVy64xioOVpcIdt8%2Fvqvf9%2F859KJsrLmrzA%2BOKC0IkFEtJza7JOfr%2FYd0P9G98tdOxe0Hp9qJrOIBgDuOeEtp%2F%2B4d%2FvWX%2F%2F9u%2B%2FtlaUTmOWZg7SQEEyuFe52%2BML9O3cZO%2F5xl06zn2VcadOJUqJTzt7a82XfP7sx9vmGNm1m1MstV4IHCVAAoTLqL1372ddn%2Fz%2B2v%2FWq12c1fSpsaeQWAZAANntxzuI3e3zbo8XGpm%2FMnNqiXrh%2BljaPd6UUabkjps19tdGnX2zKb9b4pTFDCzOMLmYtpW5h%2BpCRTeYtyV%2BT36zx808OL4xYGoFrkqDTbJpSXLdRgwbPZL%2BQnT129OOPFVEEsAMJpHKdeKMJgJSAiALdjJANQKnRJI4R6boAKEwLCiGoBBegQjBftQo1KQWOlplFKSV9qGaF1NpAE7QQESTlMSy6pp%2F4%2FFFVYxMNRBTaiM0tkImxNaL8vgfDR8gvoYRaxgAAAABJRU5ErkJggg%3D%3D" alt="bunlongheng.com"></a>
<a href="https://www.linkedin.com/in/bunlongheng/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
<a href="https://www.instagram.com/ibunlong/"><img src="https://img.shields.io/badge/Instagram-C13584?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"></a>
<a href="mailto:bheng.code@gmail.com"><img src="https://img.shields.io/badge/Email-2E7D32?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"></a>

<br>

Built by **[Bunlong](https://bunlongheng.com)** &nbsp;&middot;&nbsp; [more apps](https://bunlongheng.com/projects)

</div>
