import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { toRoute } from "../../lib/next-adapter.js";
import authLogin from "../../lib/handlers/auth-login.js";
import authCallback from "../../lib/handlers/auth-callback.js";

// The auth handlers redirect with Node-style res.writeHead(). The adapter did not
// have it after the Next port, so sign-in 500'd in production for a day while the
// handler tests stayed green on a mock that defined it. These run the real path.
const ENV = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs", AUTH_SECRET: "s".repeat(32), OWNER_EMAIL: "owner@example.com" };
const saved = {};
beforeEach(() => { for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterEach(() => { for (const k of Object.keys(ENV)) process.env[k] = saved[k]; });

describe("toRoute + auth handlers (writeHead)", () => {
  it("GET /api/auth/login answers 302 to Google with a state cookie", async () => {
    const res = await toRoute(authLogin)(new Request("https://flows-bheng.vercel.app/api/auth/login"), {});
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
    expect(res.headers.get("set-cookie")).toContain("sd_oauth_state=");
  });

  it("GET /api/auth/callback with a bad state answers 302 to ?auth=error, never 500", async () => {
    const res = await toRoute(authCallback)(new Request("https://flows-bheng.vercel.app/api/auth/callback?code=x&state=nope"), {});
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("auth=error");
  });
});
