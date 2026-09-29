import crypto from "crypto";
import { cookie, appOrigin } from "../auth-session.js";
import { rateLimit } from "../rate-limit.js";

// GET /api/auth/login -> redirect to Google's consent screen.
export default async function authLogin(req, res) {
  const limited = rateLimit(req, { key: "login", limit: 20, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured" });

  const { origin, secure } = appOrigin(req);
  const redirectUri = `${origin}/api/auth/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  // Where to land afterwards: the page the Sign in link was clicked on, when it
  // is one of ours. A session that expires while someone is looking at a flow
  // should come back to that flow, not dump them on the index to find it again.
  const ref = String(req.headers.referer || "");
  const next = ref.startsWith(`${origin}/`) ? ref.slice(origin.length) : "";
  // Sent with writeHead, not setHeader: the Next adapter's setHeader stringifies
  // what it is given, which would comma-join 2 cookies into 1 broken header.
  const cookies = [cookie("sd_oauth_state", state, { maxAge: 600, secure })];
  if (next.startsWith("/") && !next.startsWith("//")) {
    cookies.push(cookie("sd_oauth_next", encodeURIComponent(next), { maxAge: 600, secure }));
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, "Set-Cookie": cookies });
  res.end();
}
