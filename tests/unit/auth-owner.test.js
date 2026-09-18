import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bearerOk, authorizeOwner, ownerId } from "../../lib/auth-owner.js";

const SECRET = "test-secret-abc123";
const prodReq = (auth) => ({ headers: { host: "flows-bheng.vercel.app", authorization: auth } });

describe("bearerOk (constant-time Bearer check)", () => {
  const orig = process.env.FLOWS_API_SECRET;
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig;
  });

  it("accepts the correct Bearer secret", () => {
    expect(bearerOk(prodReq(`Bearer ${SECRET}`))).toBe(true);
  });

  it("rejects a wrong secret of the same length (no throw)", () => {
    const wrong = "x".repeat(SECRET.length);
    expect(bearerOk(prodReq(`Bearer ${wrong}`))).toBe(false);
  });

  it("rejects a wrong-length token without throwing", () => {
    expect(() => bearerOk(prodReq("Bearer short"))).not.toThrow();
    expect(bearerOk(prodReq("Bearer short"))).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(bearerOk(prodReq(undefined))).toBe(false);
  });

  it("returns false when no secret is configured", () => {
    delete process.env.FLOWS_API_SECRET;
    expect(bearerOk(prodReq(`Bearer ${SECRET}`))).toBe(false);
  });
});

describe("authorizeOwner", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, e: process.env.NODE_ENV, l: process.env.LOCAL_DEV };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    delete process.env.NODE_ENV;
    delete process.env.LOCAL_DEV;
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.NODE_ENV = orig.e;
    process.env.LOCAL_DEV = orig.l;
  });

  it("allows a valid Bearer when allowBearer is true (default)", async () => {
    expect(await authorizeOwner(prodReq(`Bearer ${SECRET}`))).toBe(true);
  });

  it("REJECTS a valid Bearer when allowBearer is false (admin-only routes)", async () => {
    expect(await authorizeOwner(prodReq(`Bearer ${SECRET}`), { allowBearer: false })).toBe(false);
  });
});

describe("ownerId", () => {
  it("returns the trimmed OWNER_USER_ID or null", () => {
    const orig = process.env.OWNER_USER_ID;
    process.env.OWNER_USER_ID = "  731ace87-64e5-44db-bf2a-82265f06f4d9  ";
    expect(ownerId()).toBe("731ace87-64e5-44db-bf2a-82265f06f4d9");
    delete process.env.OWNER_USER_ID;
    expect(ownerId()).toBe(null);
    process.env.OWNER_USER_ID = orig;
  });
});
