import crypto from "crypto";

// Stateless owner session: a compact HMAC-signed token stored in an httpOnly
// cookie. No DB session store - this app has exactly one owner, so a signed
// { email, exp } is enough. Signed/verified with AUTH_SECRET (constant-time).
const COOKIE = "sd_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  return process.env.AUTH_SECRET || "";
}

export function signSession(payload, maxAgeSec = MAX_AGE) {
  if (!secret()) throw new Error("AUTH_SECRET not configured");
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + maxAgeSec };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(token) {
  if (!token || !secret()) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const body = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    // Session-revocation lever: with no server-side session store, the owner
    // can invalidate every token issued before a point in time by setting
    // SESSION_MIN_IAT to a unix timestamp (e.g. after a suspected leak).
    // Any token whose `iat` predates it is rejected even though its
    // signature and exp are still valid.
    if (process.env.SESSION_MIN_IAT && body.iat < Number(process.env.SESSION_MIN_IAT)) return null;
    return body;
  } catch {
    return null;
  }
}

// Read a named cookie from a Node request's Cookie header.
export function readCookie(req, name) {
  const header = (req && req.headers && req.headers.cookie) || "";
  const m = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function sessionCookieName() {
  return COOKIE;
}

// Build a Set-Cookie string. `secure` should be true off localhost.
export function cookie(name, value, { maxAge, secure } = {}) {
  let c = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`;
  if (typeof maxAge === "number") c += `; Max-Age=${maxAge}`;
  if (secure) c += "; Secure";
  return c;
}

// True origin of this request, used to build the OAuth redirect_uri so it
// matches whichever host the browser used (prod / localhost:5174 /
// flows.localhost). The Caddy hostnames are http and end in .localhost, so
// they count as local too: marking that cookie Secure over http means the
// browser drops it and the sign-in silently does nothing.
export function appOrigin(req) {
  const host = (req && req.headers && req.headers.host) || "";
  const isLocal = /^([a-z0-9-]+\.)*(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const proto = (req && req.headers && req.headers["x-forwarded-proto"]) || (isLocal ? "http" : "https");
  return { origin: `${proto}://${host}`, secure: !isLocal };
}

export { MAX_AGE };
