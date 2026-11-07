import { NextResponse } from "next/server";

// The CSP is a static header in next.config.mjs. A per-request nonce would
// force every page to render in a function (Next docs: nonces need dynamic
// rendering), and on the free plan that is the whole bill; the home page is
// prerendered instead. This middleware only runs on a shared link.
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
  return silentSignIn(request) || NextResponse.next();
}

export const config = {
  // Only a shared link (/?id= or /?name=) is asked to sign in silently. The
  // bare home page and every asset skip middleware, so a probe costs 0 functions.
  matcher: [
    { source: "/", has: [{ type: "query", key: "id" }] },
    { source: "/", has: [{ type: "query", key: "name" }] },
  ],
};
