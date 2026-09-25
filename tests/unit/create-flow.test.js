import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the DB so the create handler's validation + auth can be tested without a
// real Postgres. First query() (slug lookup) returns no collisions; second
// (INSERT) returns a fixed id.
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
const ID = "11111111-1111-1111-1111-111111111111";
const good = (auth, body) => ({ method: "POST", headers: { host: "flows-bheng.vercel.app", authorization: auth }, body });
const VALID_BODY = {
  title: "Netflix Video Streaming",
  nodes: [{ id: "user", position: { x: 40, y: 200 } }, { id: "cloudfront", position: { x: 260, y: 200 } }],
  edges: [{ id: "e1", source: "user", target: "cloudfront" }],
};

describe("POST /api/ai/flows (public render-only)", () => {
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

  it("401s without a Bearer token", async () => {
    const res = mockRes();
    await createFlow(good(undefined, VALID_BODY), res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("400s (with a sample_request) when title is missing", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { nodes: VALID_BODY.nodes }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.sample_request).toBeTruthy();
    expect(query).not.toHaveBeenCalled();
  });

  it("400s when nodes is empty", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { title: "x", nodes: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  // The stored `type` is the singular. The rename briefly made this path write
  // "flows", which left 3 rows disagreeing with the other 43 and would have
  // rejected an MCP-shaped call arriving over HTTP - the MCP server has always
  // written "flow". Both spellings are taken in; only the singular is stored.
  it.each(["flow", "flows", undefined])("accepts type %s and stores the singular", async (type) => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: "00000000-0000-0000-0000-0000000000ff" }] });
    const res = mockRes();
    const body = { ...VALID_BODY };
    if (type === undefined) delete body.type; else body.type = type;
    await createFlow(good(`Bearer ${SECRET}`, body), res);
    expect(res.statusCode).toBe(201);
    expect(query.mock.calls[1][1][5]).toBe("flow");
  });

  it("400s for an unsupported type", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, type: "sequence" }), res);
    expect(res.statusCode).toBe(400);
  });

  it("201s with a url on a valid request (parameterized INSERT)", async () => {
    query.mockResolvedValueOnce({ rows: [] }); // slug lookup: no collisions
    query.mockResolvedValueOnce({ rows: [{ id: ID }] }); // insert
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, VALID_BODY), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.url).toContain(ID);
    // INSERT must be parameterized (values passed separately, not interpolated).
    const insertCall = query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO flows/);
    expect(Array.isArray(insertCall[1])).toBe(true);
  });
});

describe("POST /api/ai/flows - node notes", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, o: process.env.OWNER_USER_ID };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
  });

  // A note is part of the payload, so an agent can explain each step in the
  // same call that draws it - no sign-in, no second request.
  it("stores a trimmed, bounded note on the node and drops an empty one", async () => {
    const res = mockRes();
    const nodes = [
      { id: "user", note: "  Installs or uninstalls an app.  " },
      { id: "cloudfront", note: "x".repeat(500) },
      { id: "apigw", note: "   " },
    ];
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, nodes, edges: [] }), res);
    expect(res.statusCode).toBe(201);
    const written = JSON.parse(query.mock.calls[1][1][3]);
    expect(written.find((n) => n.id === "user").note).toBe("Installs or uninstalls an app.");
    expect(written.find((n) => n.id === "cloudfront").note).toHaveLength(400);
    expect(written.find((n) => n.id === "apigw")).not.toHaveProperty("note");
  });
});

describe("POST /api/ai/flows - visibility and share link", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, o: process.env.OWNER_USER_ID };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
  });

  it("is private by default and says so, with a share_url the recipient can use once public", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, VALID_BODY), res);
    expect(res.statusCode).toBe(201);
    expect(query.mock.calls[1][1][7]).toBe(false);
    expect(res.body.visibility).toBe("private");
    expect(res.body.share_note).toMatch(/404/);
    expect(res.body.share_url).toMatch(/\/demo\?name=netflix-video-streaming$/);
    // The README embed is ready to paste, by slug, at retina width.
    expect(res.body.gif_url).toMatch(/\/api\/flows\/netflix-video-streaming\?format=gif&w=3200$/);
    expect(res.body.readme).toBe(`![${VALID_BODY.title}](${res.body.gif_url})`);
  });

  it("is_public: true publishes on create", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, is_public: true }), res);
    expect(query.mock.calls[1][1][7]).toBe(true);
    expect(res.body.visibility).toBe("public");
    expect(res.body.share_note).toBeUndefined();
  });
});

// The product's single hard rule: every node renders a real logo.
describe("POST /api/ai/flows - logo gate", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, o: process.env.OWNER_USER_ID };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
  });

  it("400s an unknown service id and names it", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, nodes: [{ id: "user" }, { id: "not-a-service" }] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.unresolved).toEqual(["not-a-service"]);
    expect(query).not.toHaveBeenCalled();
  });

  it("400s a script or protocol-relative icon", async () => {
    for (const icon of ["javascript:alert(1)", "//evil.example/x.svg"]) {
      const res = mockRes();
      await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, nodes: [{ id: "custom", icon, label: "X" }] }), res);
      expect(res.statusCode, icon).toBe(400);
    }
  });

  it("201s a bring-your-own icon and drops a non-hex colour", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, nodes: [{ id: "hub", icon: "/brand/hubspot.svg", label: "HubSpot", color: '#fff" onload="x' }], edges: [] }), res);
    expect(res.statusCode).toBe(201);
    const written = JSON.parse(query.mock.calls[1][1][3]);
    expect(written[0].icon).toBe("/brand/hubspot.svg");
    expect(written[0]).not.toHaveProperty("color");
  });
});

// The detail view and the share card render these 2 lines, and until now
// nothing could set them.
describe("POST /api/ai/flows - pattern and description", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, o: process.env.OWNER_USER_ID };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
  });

  it("stores both, trimmed and bounded", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, pattern: "  Fan-out on write  ", description: "x".repeat(700) }), res);
    expect(res.statusCode).toBe(201);
    const args = query.mock.calls[1][1];
    expect(args[8]).toBe("Fan-out on write");
    expect(args[9]).toHaveLength(600);
  });

  it("stores null when they are absent or blank", async () => {
    const res = mockRes();
    await createFlow(good(`Bearer ${SECRET}`, { ...VALID_BODY, pattern: "   " }), res);
    expect(res.statusCode).toBe(201);
    const args = query.mock.calls[1][1];
    expect(args[8]).toBeNull();
    expect(args[9]).toBeNull();
  });
});
