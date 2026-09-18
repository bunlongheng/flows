import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the DB so the create handler's payload caps can be tested without a
// real Postgres, following the create-flows.test.js pattern.
const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));

const { default: createFlow } = await import("../../lib/handlers/create-flow.js");

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
const good = (body) => ({ method: "POST", headers: { host: "flows-bheng.vercel.app", authorization: `Bearer ${SECRET}` }, body });

describe("POST /api/ai/flows payload caps", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, o: process.env.OWNER_USER_ID };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    query.mockReset();
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
  });

  it("400s when title is longer than 200 characters", async () => {
    const res = mockRes();
    await createFlow(
      good({
        title: "x".repeat(201),
        nodes: [{ id: "user", position: { x: 0, y: 0 } }],
        edges: [],
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("400s when nodes array length is greater than 100", async () => {
    const res = mockRes();
    const nodes = Array.from({ length: 101 }, () => ({ id: "user", position: { x: 0, y: 0 } }));
    await createFlow(good({ title: "Too many nodes", nodes, edges: [] }), res);
    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it("400s when edges array length is greater than 300", async () => {
    const res = mockRes();
    const nodes = [{ id: "user", position: { x: 0, y: 0 } }];
    const edges = Array.from({ length: 301 }, () => ({ source: "user", target: "user" }));
    await createFlow(good({ title: "Too many edges", nodes, edges }), res);
    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
