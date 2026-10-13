import db from "../../../../../lib/db.js";
import { rateLimit } from "../../../../../lib/rate-limit.js";
import { verifyPasscode, unlockToken, unlockCookieName } from "../../../../../lib/passcode.js";
import { gatePage } from "../../../../../lib/passcode-pages.js";
import { renderDiagramSvg } from "../../../../../lib/render-svg.js";
import { Resvg } from "@resvg/resvg-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/flows/:id/unlock -> the lock screen (the app sends a visitor here
//                               when the flow answers 401 passcode_required).
// POST /api/flows/:id/unlock -> check the passcode; right sets a 30-day unlock
//                               cookie and goes back to /?id=...&reveal=1,
//                               wrong redraws the safe.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const html = (body, status = 200) => new Response(body, {
  status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
});

async function load(id) {
  if (!UUID.test(id || "")) return null;
  const { rows } = await db.query(
    "SELECT id, title, is_public, passcode_hash, nodes, edges, view_state FROM flows WHERE id = $1 AND deleted_at IS NULL", [id],
  ).catch(() => ({ rows: [] }));
  return rows[0] || null;
}

const back = (id) => `/?id=${id}`;

// The diagram behind the safe, as an 80 px wide PNG: a card is a few pixels,
// so nothing in it can be read, and the page blurs it further. Only this
// thumbnail ever leaves the server; null (a black room) if it cannot render.
function backdrop(row) {
  try {
    const view = { ...(row.view_state || {}), panels: ["notes-off", "legend-off"] };
    const svg = renderDiagramSvg(row.nodes || [], row.edges || [], { view });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 80 } }).render().asPng();
    return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request, ctx) {
  const { id } = await ctx.params;
  const row = await load(id);
  if (!row || row.is_public === false) return new Response("Not found", { status: 404 });
  if (!row.passcode_hash) return new Response(null, { status: 302, headers: { Location: back(id) } });
  return html(gatePage({ action: `/api/flows/${id}/unlock`, title: row.title || "Locked flow", backdrop: backdrop(row) }));
}

export async function POST(request, ctx) {
  const { id } = await ctx.params;
  // Before the DB hit and the deliberately slow scrypt: 10 guesses / 5 min.
  const limited = rateLimit({ headers: Object.fromEntries(request.headers) }, { key: "unlock", limit: 10, windowMs: 300000 });
  if (!limited.ok) {
    return new Response("Too many attempts. Wait a few minutes and try again.", {
      status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(limited.retryAfter) },
    });
  }
  const row = await load(id);
  if (!row || row.is_public === false) return new Response("Not found", { status: 404 });
  if (!row.passcode_hash) return new Response(null, { status: 303, headers: { Location: back(id) } });

  const form = await request.formData().catch(() => null);
  const passcode = String(form?.get("passcode") ?? "").trim().toLowerCase();
  if (!(await verifyPasscode(passcode, row.passcode_hash))) {
    return html(gatePage({ action: `/api/flows/${id}/unlock`, title: row.title || "Locked flow", bad: true, backdrop: backdrop(row) }), 401);
  }
  // Straight on to the flow, which plays the reveal (src/components/UnlockReveal.jsx).
  const res = new Response(null, { status: 303, headers: { Location: `${back(id)}&reveal=1`, "Cache-Control": "no-store" } });
  const secure = request.url.startsWith("https://") ? "; Secure" : "";
  res.headers.append("Set-Cookie",
    `${unlockCookieName(id)}=${unlockToken(id, row.passcode_hash)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`);
  return res;
}
