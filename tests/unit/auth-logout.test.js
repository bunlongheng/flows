import { describe, it, expect } from "vitest";
import authLogout from "../../lib/handlers/auth-logout.js";

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

function req() {
  return { method: "POST", headers: { host: "flows-bheng.vercel.app" } };
}

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the sd_session cookie", async () => {
    const res = mockRes();
    await authLogout(req(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const setCookie = res.headers["Set-Cookie"];
    expect(setCookie).toMatch(/^sd_session=/);
    expect(setCookie).toMatch(/Max-Age=0/);
  });
});
