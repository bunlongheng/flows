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

    expect(res.headers["Set-Cookie"]).toMatch(/^sd_oauth_state=/);
  });
});
