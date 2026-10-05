import { describe, it, expect, beforeEach, afterEach } from "vitest";
import authMe from "../../lib/handlers/auth-me.js";
import { signSession } from "../../lib/auth-session.js";

const OWNER_EMAIL = "owner@example.com";

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
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
  };
}

function req(cookie) {
  return { method: "GET", headers: { host: "flows-bheng.vercel.app", cookie } };
}

describe("GET /api/auth/me", () => {
  const orig = { a: process.env.AUTH_SECRET, o: process.env.OWNER_EMAIL };
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret-0123456789";
    process.env.OWNER_EMAIL = OWNER_EMAIL;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = orig.a;
    process.env.OWNER_EMAIL = orig.o;
  });

  it("with no cookie returns 200 { authenticated: false }", async () => {
    const res = mockRes();
    await authMe(req(undefined), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("with a valid owner session cookie returns 200 { authenticated: true, email }", async () => {
    const cookie = `sd_session=${signSession({ email: OWNER_EMAIL })}`;
    const res = mockRes();
    await authMe(req(cookie), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ authenticated: true, email: OWNER_EMAIL });
  });

  // The local bypass. The owner serves this app from their own Mac with
  // `next start`, so NODE_ENV says production on a build nobody else can reach:
  // without LOCAL_DEV the peer never counts as local, which is what made the
  // local app show a sign-in form for an API that was already open to it.
  it("a local request with no cookie is the owner", async () => {
    const res = mockRes();
    await authMe({ ...req(undefined), socket: { remoteAddress: "127.0.0.1" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ authenticated: true, email: OWNER_EMAIL, local: true });
  });

  it("a loopback peer in production without LOCAL_DEV is NOT the owner", async () => {
    const node = process.env.NODE_ENV, local = process.env.LOCAL_DEV;
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_DEV;
    try {
      const res = mockRes();
      await authMe({ ...req(undefined), socket: { remoteAddress: "127.0.0.1" } }, res);
      expect(res.body).toEqual({ authenticated: false });
    } finally {
      // Restored in finally: a failed assertion here used to leave NODE_ENV on
      // production for every test after it in this file.
      process.env.NODE_ENV = node;
      if (local !== undefined) process.env.LOCAL_DEV = local;
    }
  });

  it("with a cookie for a non-owner email returns { authenticated: false }", async () => {
    const cookie = `sd_session=${signSession({ email: "someone@else.com" })}`;
    const res = mockRes();
    await authMe(req(cookie), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ authenticated: false });
  });
});
