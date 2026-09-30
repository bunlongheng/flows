import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));

const { default: flowVersions } = await import("../../lib/handlers/flow-versions.js");

function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const OWNER = "731ace87-64e5-44db-bf2a-82265f06f4d9";
const FLOW = "11111111-1111-1111-1111-111111111111";
const VID = "22222222-2222-2222-2222-222222222222";
const SECRET = "test-secret-abc123";
// Local requests are the owner (isLocal); a prod host with only the Bearer key is not.
const local = (method, query) => ({ method, headers: { host: "localhost:5174" }, socket: { remoteAddress: "127.0.0.1" }, query });
const bearer = (method, query) => ({ method, headers: { host: "flows-bheng.vercel.app", authorization: `Bearer ${SECRET}` }, query });
const ownedFlow = (locked = false) => ({ rows: [{ id: FLOW, locked }] });

describe("flow versions", () => {
  const orig = { s: process.env.FLOWS_API_SECRET, o: process.env.OWNER_USER_ID };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = OWNER;
    query.mockReset();
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
  });

  it("400s on a non-uuid flow or version id before touching the db", async () => {
    for (const q of [{ id: "nope" }, { id: FLOW, vid: "nope" }]) {
      const res = mockRes();
      await flowVersions(local("GET", q), res);
      expect(res.statusCode).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("refuses the Bearer key: history is the owner's, like PATCH and DELETE", async () => {
    const res = mockRes();
    await flowVersions(bearer("GET", { id: FLOW }), res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("lists versions newest first, scoped to the owner's live flow", async () => {
    const versions = [{ id: VID, kind: "content", reason: "backfill", saved_at: "2026-09-26T10:00:00Z", node_count: 4, edge_count: 3 }];
    query.mockResolvedValueOnce(ownedFlow()).mockResolvedValueOnce({ rows: versions });
    const res = mockRes();
    await flowVersions(local("GET", { id: FLOW }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.versions).toEqual(versions);
    expect(query.mock.calls[0][0]).toMatch(/user_id = \$2 AND deleted_at IS NULL/);
    expect(query.mock.calls[0][1]).toEqual([FLOW, OWNER]);
    expect(query.mock.calls[1][0]).toMatch(/ORDER BY saved_at DESC/);
  });

  it("404s a flow that is not the owner's, without listing anything", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await flowVersions(local("GET", { id: FLOW }), res);
    expect(res.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns one version in full, and 404s a version from another flow", async () => {
    const full = { id: VID, kind: "layout", nodes: [{ id: "user" }], edges: [] };
    query.mockResolvedValueOnce(ownedFlow()).mockResolvedValueOnce({ rows: [full] });
    const res = mockRes();
    await flowVersions(local("GET", { id: FLOW, vid: VID }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(full);
    expect(query.mock.calls[1][1]).toEqual([VID, FLOW]);

    query.mockReset();
    query.mockResolvedValueOnce(ownedFlow()).mockResolvedValueOnce({ rows: [] });
    const miss = mockRes();
    await flowVersions(local("GET", { id: FLOW, vid: VID }), miss);
    expect(miss.statusCode).toBe(404);
  });

  it("restores a version as a normal write, so the trigger keeps what it replaced", async () => {
    const v = { title: "Old title", nodes: [{ id: "user", position: { x: 1, y: 2 } }], edges: [], pattern: null, description: "d", view_state: { start: "user" }, saved_at: "2026-09-26T10:00:00.000Z" };
    query.mockResolvedValueOnce(ownedFlow()).mockResolvedValueOnce({ rows: [v] }).mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await flowVersions(local("POST", { id: FLOW, vid: VID }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ restored: VID, saved_at: v.saved_at, title: "Old title" });
    const [sql, params] = query.mock.calls[2];
    expect(sql).toMatch(/^\s*UPDATE flows SET title = \$2, nodes = \$3::jsonb, edges = \$4::jsonb/);
    expect(sql).not.toMatch(/locked|is_public|slug/);
    expect(params[0]).toBe(FLOW);
    expect(params[1]).toBe("Old title");
    expect(JSON.parse(params[2])).toEqual(v.nodes);
    expect(params[7]).toBe("Restored the version saved 2026-09-26T10:00:00.000Z");
  });

  it("409s a restore on a locked diagram and writes nothing", async () => {
    query.mockResolvedValueOnce(ownedFlow(true));
    const res = mockRes();
    await flowVersions(local("POST", { id: FLOW, vid: VID }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.locked).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  // An agent's restore (the MCP server) is an edit and answers to the edit
  // lock; the owner's own restore above answers to the delete lock as before.
  it("restoreVersion with agent: true answers to the edit lock, not the delete lock", async () => {
    const { restoreVersion } = await import("../../lib/versions.js");
    query.mockResolvedValueOnce({ rows: [{ id: FLOW, locked: false, edit_locked: true }] });
    expect(await restoreVersion(FLOW, OWNER, VID, { agent: true })).toEqual({ locked: true, edit_locked: true });
    expect(query).toHaveBeenCalledTimes(1);
    query.mockClear();
    // Delete lock on, edit lock off: the agent's restore goes through to the version lookup.
    query.mockResolvedValueOnce({ rows: [{ id: FLOW, locked: true, edit_locked: false }] });
    query.mockResolvedValueOnce({ rows: [] });
    expect(await restoreVersion(FLOW, OWNER, VID, { agent: true })).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("404s a restore of a version that is not the flow's", async () => {
    query.mockResolvedValueOnce(ownedFlow()).mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await flowVersions(local("POST", { id: FLOW, vid: VID }), res);
    expect(res.statusCode).toBe(404);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
