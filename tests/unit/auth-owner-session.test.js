import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authorizeOwner } from "../../lib/auth-owner.js";
import { signSession } from "../../lib/auth-session.js";

// A valid OWNER session cookie must authorize even admin-only routes
// (allowBearer:false) - that is what lets the signed-in owner use AI generate in
// prod - while a non-owner session must be rejected.
const prodReq = (cookie) => ({
  headers: { host: "flows-bheng.vercel.app", cookie },
});

describe("authorizeOwner via Google owner session", () => {
  const orig = { s: process.env.AUTH_SECRET, o: process.env.OWNER_EMAIL, e: process.env.NODE_ENV, l: process.env.LOCAL_DEV };
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret-0123456789";
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_DEV;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = orig.s;
    process.env.OWNER_EMAIL = orig.o;
    process.env.NODE_ENV = orig.e;
    process.env.LOCAL_DEV = orig.l;
  });

  it("authorizes the owner session on an admin-only route (allowBearer:false)", async () => {
    const cookie = `sd_session=${signSession({ email: "owner@example.com" })}`;
    expect(await authorizeOwner(prodReq(cookie), { allowBearer: false })).toBe(true);
  });

  it("rejects a non-owner session", async () => {
    const cookie = `sd_session=${signSession({ email: "someone@else.com" })}`;
    expect(await authorizeOwner(prodReq(cookie), { allowBearer: false })).toBe(false);
  });

  it("rejects when there is no session cookie", async () => {
    expect(await authorizeOwner(prodReq(""), { allowBearer: false })).toBe(false);
  });

  it("rejects a forged (wrong-secret) owner cookie", async () => {
    process.env.AUTH_SECRET = "different-secret";
    const forged = `sd_session=${signSession({ email: "owner@example.com" })}`;
    process.env.AUTH_SECRET = "test-auth-secret-0123456789";
    expect(await authorizeOwner(prodReq(forged), { allowBearer: false })).toBe(false);
  });
});
