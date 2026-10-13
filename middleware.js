import { NextResponse } from "next/server";

// Next bootstraps with inline <script> tags, which the app's CSP forbids
// (script-src 'self' - deliberately no 'unsafe-inline', no 'unsafe-eval').
// Rather than weaken that to get the port working, each response gets a fresh
// nonce: Next stamps it onto its own scripts, and nothing else can execute.
// The owner opening their own shared link in a browser signed into Google but
// not into Flows should land in the editor. So a shared link asks Google once
// per browser session, silently (see auth-login ?silent). Asked HERE, before
// any page is sent: asked from the page, the reader saw a spinner, a bounce
// and a 2nd spinner. Only a real browser opening the page is asked: a link
// preview bot carries no cookie and would lose the share card to Google.
function silentSignIn(request) {
  if (process.env.NODE_ENV !== "production" || process.env.LOCAL_DEV === "true") return null;
  const url = request.nextUrl;
  if (url.pathname !== "/" || !(url.searchParams.get("id") || url.searchParams.get("name")) || url.searchParams.get("auth")) return null;
  if (/^([a-z0-9-]+\.)*(localhost|127\.0\.0\.1)(:\d+)?$/i.test(request.headers.get("host") || "")) return null;
  const h = request.headers;
  if (h.get("sec-fetch-dest") !== "document" || h.get("sec-fetch-mode") !== "navigate") return null;
  if (/bot|crawl|spider|preview|facebookexternalhit|slack|whatsapp|telegram/i.test(h.get("user-agent") || "")) return null;
  if (request.cookies.get("sd_silent_tried") || request.cookies.get("sd_session")) return null;
  const login = new URL("/api/auth/login", url);
  login.searchParams.set("silent", "1");
  login.searchParams.set("next", url.pathname + url.search);
  return NextResponse.redirect(login, 307);
}

export function middleware(request) {
  const silent = silentSignIn(request);
  if (silent) return silent;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "style-src 'self' 'unsafe-inline'",
    // strict-dynamic lets the nonced bootstrap load the chunks it needs without
    // whitelisting anything by URL. Dev additionally needs eval for HMR.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: http://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Static assets need no nonce and would only pay the cost.
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|json|webmanifest)$).*)" }],
};
