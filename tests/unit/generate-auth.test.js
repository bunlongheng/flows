import { describe, it, expect, beforeEach, afterEach } from "vitest";
import generate from "../../lib/handlers/generate.js";

// The most important auth guarantee: AI generation (which spends Anthropic
// credits) is ADMIN-ONLY. A caller holding a VALID public Bearer secret must
// still be rejected with 401 - the render-only POST /api/ai/flows is
// the only way public callers touch the API, and it never calls Claude.
function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

const SECRET = "test-secret-abc123";

describe("POST /api/ai/generate auth (admin-only)", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, e: process.env.NODE_ENV, l: process.env.LOCAL_DEV };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_DEV;
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.NODE_ENV = orig.e;
    process.env.LOCAL_DEV = orig.l;
  });

  it("rejects a VALID Bearer token with 401 (never spends Anthropic $)", async () => {
    const req = {
      method: "POST",
      headers: { host: "flows-bheng.vercel.app", authorization: `Bearer ${SECRET}` },
      body: { prompt: "design netflix" },
    };
    const res = mockRes();
    await generate(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("rejects an unauthenticated request with 401", async () => {
    const req = { method: "POST", headers: { host: "flows-bheng.vercel.app" }, body: { prompt: "x" } };
    const res = mockRes();
    await generate(req, res);
    expect(res.statusCode).toBe(401);
  });
});
