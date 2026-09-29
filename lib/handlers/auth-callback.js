import { signSession, cookie, readCookie, appOrigin, MAX_AGE } from "../auth-session.js";
import { rateLimit } from "../rate-limit.js";

function redirect(res, location, setCookies) {
  const headers = { Location: location };
  if (setCookies) headers["Set-Cookie"] = setCookies;
  res.writeHead(302, headers);
  res.end();
}

// GET /api/auth/callback -> exchange the code, verify the OWNER email, mint the
// session cookie. Only OWNER_EMAIL passes; anyone else is bounced to ?auth=denied.
export default async function authCallback(req, res) {
  const limited = rateLimit(req, { key: "callback", limit: 20, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const OWNER = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!clientId || !clientSecret || !OWNER) {
    return redirect(res, "/?auth=error");
  }

  const code = req.query && req.query.code;
  const state = req.query && req.query.state;
  const stateCookie = readCookie(req, "sd_oauth_state");
  const clearState = cookie("sd_oauth_state", "", { maxAge: 0 });
  // Set by the login route from the Referer. Re-checked here rather than
  // trusted: a cookie is still something a browser can be told to send.
  const wanted = decodeURIComponent(readCookie(req, "sd_oauth_next") || "");
  const back = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/";
  const clearNext = cookie("sd_oauth_next", "", { maxAge: 0 });
  // A silent check (see auth-login) that Google answered "not signed in" is not
  // a failed sign in: the reader never asked for one, so they go straight back
  // to the diagram with no toast. The state check below still applies to a
  // silent answer that carries a code.
  const silent = readCookie(req, "sd_oauth_silent") === "1";
  const clearSilent = cookie("sd_oauth_silent", "", { maxAge: 0 });
  if (silent && !code) {
    return redirect(res, back, [clearState, clearNext, clearSilent]);
  }

  // CSRF: the state in the callback must match the one we set before redirecting.
  if (!code || !state || !stateCookie || stateCookie !== state) {
    return redirect(res, "/?auth=error", clearState);
  }

  const { origin, secure } = appOrigin(req);
  const redirectUri = `${origin}/api/auth/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) return redirect(res, "/?auth=error", clearState);

    const uiRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const ui = await uiRes.json();
    const email = (ui.email || "").toLowerCase();

    // Owner-only gate.
    if (!ui.email_verified || email !== OWNER) {
      return silent ? redirect(res, back, [clearState, clearNext, clearSilent]) : redirect(res, "/?auth=denied", clearState);
    }

    const token = signSession({ email });
    return redirect(res, back, [clearState, clearNext, clearSilent, cookie("sd_session", token, { maxAge: MAX_AGE, secure })]);
  } catch {
    return redirect(res, "/?auth=error", clearState);
  }
}
