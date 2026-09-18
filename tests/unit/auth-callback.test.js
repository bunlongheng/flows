import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import authCallback from "../../lib/handlers/auth-callback.js";

const OWNER_EMAIL = "owner@example.com";

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

function req(query, cookie) {
  return {
    method: "GET",
    query,
    headers: { host: "flows-bheng.vercel.app", cookie },
  };
}

// Set-Cookie may be a single string (only clearState) or an array
// ([clearState, sessionCookie]) - normalize to one string for assertions.
function setCookieText(res) {
  const sc = res.headers["Set-Cookie"];
  return Array.isArray(sc) ? sc.join("; ") : sc || "";
}

describe("GET /api/auth/callback (OAuth security boundary)", () => {
  const originalFetch = global.fetch;
  const orig = {
    ci: process.env.GOOGLE_CLIENT_ID,
    cs: process.env.GOOGLE_CLIENT_SECRET,
    a: process.env.AUTH_SECRET,
    oe: process.env.OWNER_EMAIL,
  };
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.AUTH_SECRET = "test-auth-secret-0123456789";
    process.env.OWNER_EMAIL = OWNER_EMAIL;
    global.fetch = vi.fn();
  });
  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = orig.ci;
    process.env.GOOGLE_CLIENT_SECRET = orig.cs;
    process.env.AUTH_SECRET = orig.a;
    process.env.OWNER_EMAIL = orig.oe;
    global.fetch = originalFetch;
  });

  it("missing code or state redirects to /?auth=error", async () => {
    const res = mockRes();
    await authCallback(req({}, undefined), res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe("/?auth=error");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("state param mismatched with the sd_oauth_state cookie redirects to /?auth=error", async () => {
    const res = mockRes();
    await authCallback(req({ code: "c1", state: "state-from-google" }, "sd_oauth_state=different-state"), res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe("/?auth=error");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("valid state but non-owner email redirects to /?auth=denied and never sets sd_session", async () => {
    global.fetch
      .mockResolvedValueOnce({ json: async () => ({ access_token: "AT" }) })
      .mockResolvedValueOnce({ json: async () => ({ email: "notowner@x.com", email_verified: true }) });

    const res = mockRes();
    await authCallback(req({ code: "c1", state: "matching-state" }, "sd_oauth_state=matching-state"), res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe("/?auth=denied");
    expect(setCookieText(res)).not.toMatch(/sd_session=/);
  });

  it("valid state and owner email redirects to / and sets sd_session", async () => {
    global.fetch
      .mockResolvedValueOnce({ json: async () => ({ access_token: "AT" }) })
      .mockResolvedValueOnce({ json: async () => ({ email: OWNER_EMAIL, email_verified: true }) });

    const res = mockRes();
    await authCallback(req({ code: "c1", state: "matching-state" }, "sd_oauth_state=matching-state"), res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe("/");
    expect(setCookieText(res)).toMatch(/sd_session=/);
  });
});
