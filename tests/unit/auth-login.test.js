import { describe, it, expect, beforeEach, afterEach } from "vitest";
import authLogin from "../../lib/handlers/auth-login.js";

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    ended: false,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
    writeHead(c, headers) {
      this.statusCode = c;
      if (headers) Object.assign(this.headers, headers);
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}

function req() {
  return { method: "GET", headers: { host: "flows-bheng.vercel.app" } };
}

describe("GET /api/auth/login", () => {
  const orig = { c: process.env.GOOGLE_CLIENT_ID };
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  });
  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = orig.c;
  });

  // An expired session drops the owner on the visitor bar of whatever flow they
  // were reading. Signing in has to bring them back to that flow.
  it("remembers the page the Sign in link was clicked on", async () => {
    const r = req();
    r.headers.referer = "https://flows-bheng.vercel.app/?id=abc-123";
    const res = mockRes();
    await authLogin(r, res);
    const set = [].concat(res.headers["Set-Cookie"]);
    expect(set.find((c) => c.startsWith("sd_oauth_next="))).toContain(encodeURIComponent("/?id=abc-123"));
  });

  // The Referer is whatever a browser says it is, so anything pointing off-site
  // is dropped rather than turned into an open redirect.
  it("ignores a Referer from another origin", async () => {
    const r = req();
    r.headers.referer = "https://evil.example.com/steal";
    const res = mockRes();
    await authLogin(r, res);
    expect([].concat(res.headers["Set-Cookie"]).some((c) => c.startsWith("sd_oauth_next="))).toBe(false);
  });

  // A shared link asks Google quietly whether the browser is already the owner.
  // prompt=none means Google answers instead of asking, login_hint picks the
  // owner's account in a browser signed into several, and the silent cookie
  // tells the callback to come back without a word when the answer is no.
  it("?silent=1 asks Google with prompt=none, hints the owner account and marks the round trip", async () => {
    const oe = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = "owner@example.com";
    const r = req();
    r.query = { silent: "1" };
    r.headers.referer = "https://flows-bheng.vercel.app/?id=abc-123";
    const res = mockRes();
    await authLogin(r, res);
    process.env.OWNER_EMAIL = oe;
    const u = new URL(res.headers.Location);
    expect(u.searchParams.get("prompt")).toBe("none");
    expect(u.searchParams.get("login_hint")).toBe("owner@example.com");
    const set = [].concat(res.headers["Set-Cookie"]);
    expect(set.some((c) => c.startsWith("sd_oauth_silent=1"))).toBe(true);
    expect(set.find((c) => c.startsWith("sd_oauth_next="))).toContain(encodeURIComponent("/?id=abc-123"));
  });

  it("a plain sign in still asks Google to pick an account and sets no silent cookie", async () => {
    const res = mockRes();
    await authLogin(req(), res);
    const u = new URL(res.headers.Location);
    expect(u.searchParams.get("prompt")).toBe("select_account");
    expect(u.searchParams.has("login_hint")).toBe(false);
    expect([].concat(res.headers["Set-Cookie"]).some((c) => c.startsWith("sd_oauth_silent="))).toBe(false);
  });

  it("redirects (302) to Google's consent screen with the expected params and sets the state cookie", async () => {
    const res = mockRes();
    await authLogin(req(), res);

    expect(res.statusCode).toBe(302);
    expect(res.ended).toBe(true);

    const location = res.headers.Location;
    expect(location).toBeTruthy();
    expect(location.startsWith("https://accounts.google.com")).toBe(true);

    const url = new URL(location);
    expect(url.searchParams.get("client_id")).toBe(process.env.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/callback$/);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBeTruthy();

    expect([].concat(res.headers["Set-Cookie"])[0]).toMatch(/^sd_oauth_state=/);
  });
});
