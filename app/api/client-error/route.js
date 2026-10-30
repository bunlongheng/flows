import { rateLimit } from "../../../lib/rate-limit.js";

export const runtime = "nodejs";

// POST /api/client-error -> a browser crash caught by CrashGuard, written to the
// server log so a visitor's white screen leaves a trace (#614). No auth: it only
// logs, it is size-capped, and it is rate-limited per IP.
export async function POST(request) {
  const limited = rateLimit({ headers: Object.fromEntries(request.headers) }, { key: "client-error", limit: 20, windowMs: 300000 });
  if (!limited.ok) return new Response(null, { status: 429 });
  const text = (await request.text().catch(() => "")).slice(0, 4000);
  let report = {};
  try { report = JSON.parse(text); } catch { /* keep it empty */ }
  console.error("[client-error]", JSON.stringify({
    message: String(report.message || "").slice(0, 500),
    stack: String(report.stack || "").slice(0, 2000),
    url: String(report.url || "").slice(0, 300),
    ua: (request.headers.get("user-agent") || "").slice(0, 200),
  }));
  return new Response(null, { status: 204 });
}
