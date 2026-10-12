import db from "../../../../../lib/db.js";
import { rateLimit } from "../../../../../lib/rate-limit.js";
import { verifyPasscode, unlockToken, unlockCookieName } from "../../../../../lib/passcode.js";
import { gatePage, unlockedPage } from "../../../../../lib/passcode-pages.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/flows/:id/unlock -> the lock screen (the app sends a visitor here
//                               when the flow answers 401 passcode_required).
// POST /api/flows/:id/unlock -> check the passcode; right sets a 30-day unlock
//                               cookie and plays the access-granted beat on the
//                               way back to /?id=, wrong redraws the safe.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const html = (body, status = 200) => new Response(body, {
  status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
});

async function load(id) {
  if (!UUID.test(id || "")) return null;
  const { rows } = await db.query(
    "SELECT id, title, is_public, passcode_hash FROM flows WHERE id = $1 AND deleted_at IS NULL", [id],
  ).catch(() => ({ rows: [] }));
  return rows[0] || null;
}

const back = (id) => `/?id=${id}`;

export async function GET(request, ctx) {
  const { id } = await ctx.params;
  const row = await load(id);
  if (!row || row.is_public === false) return new Response("Not found", { status: 404 });
  if (!row.passcode_hash) return new Response(null, { status: 302, headers: { Location: back(id) } });
  return html(gatePage({ action: `/api/flows/${id}/unlock`, title: row.title || "Locked flow" }));
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
  const passcode = String(form?.get("passcode") ?? "").trim();
  if (!(await verifyPasscode(passcode, row.passcode_hash))) {
    return html(gatePage({ action: `/api/flows/${id}/unlock`, title: row.title || "Locked flow", bad: true }), 401);
  }
  const res = html(unlockedPage({ target: back(id), nonce: request.headers.get("x-nonce") }));
  const secure = request.url.startsWith("https://") ? "; Secure" : "";
  res.headers.append("Set-Cookie",
    `${unlockCookieName(id)}=${unlockToken(id, row.passcode_hash)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`);
  return res;
}
