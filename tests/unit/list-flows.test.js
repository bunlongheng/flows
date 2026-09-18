import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signSession } from "../../lib/auth-session.js";

// Mock the DB so the list handler can be tested without a real Postgres,
// following the create-flows.test.js pattern.
const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));

const { default: listFlows } = await import("../../lib/handlers/list-flows.js");

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

const OWNER_EMAIL = "owner@example.com";

// Owner-gated (list-flows is now behind authorizeOwner): send an
// owner session cookie so isLocal's absence doesn't matter under NODE_ENV=test.
function req(method) {
  return {
    method,
    headers: { cookie: `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}` },
  };
}

describe("GET /api/flows (list)", () => {
  const orig = { o: process.env.OWNER_USER_ID, a: process.env.AUTH_SECRET, oe: process.env.OWNER_EMAIL };
  beforeEach(() => {
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.OWNER_EMAIL = OWNER_EMAIL;
    query.mockReset();
  });
  afterEach(() => {
    process.env.OWNER_USER_ID = orig.o;
    process.env.AUTH_SECRET = orig.a;
    process.env.OWNER_EMAIL = orig.oe;
  });

  it("GET returns 200 with the array from db.query", async () => {
    const rows = [{ id: "11111111-1111-1111-1111-111111111111", title: "X" }];
    query.mockResolvedValueOnce({ rows });
    const res = mockRes();
    await listFlows(req("GET"), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(rows);
  });

  it("a non-GET method returns 405", async () => {
    const res = mockRes();
    await listFlows(req("POST"), res);
    expect(res.statusCode).toBe(405);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no owner session", async () => {
    const res = mockRes();
    await listFlows({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 500 when OWNER_USER_ID is unset", async () => {
    delete process.env.OWNER_USER_ID;
    const res = mockRes();
    await listFlows(req("GET"), res);
    expect(res.statusCode).toBe(500);
    expect(query).not.toHaveBeenCalled();
  });
});
