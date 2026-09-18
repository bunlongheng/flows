import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the DB so the health check's readiness probe can be driven without a
// real Postgres, following the flows-by-id.test.js pattern.
const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));

const { default: health } = await import("../../lib/handlers/health.js");

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

describe("GET /api/health", () => {
  const orig = {
    s: process.env.FLOWS_API_SECRET,
    o: process.env.OWNER_USER_ID,
    ci: process.env.GOOGLE_CLIENT_ID,
    cs: process.env.GOOGLE_CLIENT_SECRET,
    a: process.env.AUTH_SECRET,
    oe: process.env.OWNER_EMAIL,
  };
  beforeEach(() => {
    // All non-DB checks configured so only the DB check drives ok/not-ok.
    process.env.FLOWS_API_SECRET = "test-secret-abc123";
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.AUTH_SECRET = "test-auth-secret-0123456789";
    process.env.OWNER_EMAIL = "owner@example.com";
    query.mockReset();
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
    process.env.GOOGLE_CLIENT_ID = orig.ci;
    process.env.GOOGLE_CLIENT_SECRET = orig.cs;
    process.env.AUTH_SECRET = orig.a;
    process.env.OWNER_EMAIL = orig.oe;
  });

  it("returns 200 ok:true with all checks true when the DB query succeeds", async () => {
    query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = mockRes();
    await health({}, res);

    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      checks: {
        api_secret: true,
        owner_user_id: true,
        google_oauth: true,
        auth_secret: true,
        owner_email: true,
        database: true,
      },
    });
  });

  it("returns 503 ok:false with database:false when the DB query rejects", async () => {
    query.mockRejectedValueOnce(new Error("connection refused"));
    const res = mockRes();
    await health({}, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.checks.database).toBe(false);
    expect(res.body.checks.api_secret).toBe(true);
    expect(res.body.checks.owner_user_id).toBe(true);
    expect(res.body.checks.google_oauth).toBe(true);
    expect(res.body.checks.auth_secret).toBe(true);
    expect(res.body.checks.owner_email).toBe(true);
  });
});
