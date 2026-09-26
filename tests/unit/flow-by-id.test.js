import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signSession } from "../../lib/auth-session.js";

// Mock the DB so the by-id handler's validation + auth can be tested without a
// real Postgres, following the create-flows.test.js pattern.
const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));

const { default: flowById } = await import("../../lib/handlers/flow-by-id.js");

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

const SECRET = "test-secret-abc123";
const ID = "11111111-1111-1111-1111-111111111111";
const OWNER_EMAIL = "owner@example.com";

// No `socket` property -> isLocal() falls through to the false branch, and
// NODE_ENV=production keeps the prod gate deterministic.
function req(method, id, auth, cookie, extraQuery = {}) {
  return {
    method,
    query: { id, ...extraQuery },
    headers: { host: "flows-bheng.vercel.app", authorization: auth, cookie },
  };
}

describe("/api/flows/:id", () => {
  const orig = {
    s: process.env.FLOWS_API_SECRET,
    o: process.env.OWNER_USER_ID,
    e: process.env.NODE_ENV,
    a: process.env.AUTH_SECRET,
    oe: process.env.OWNER_EMAIL,
  };
  beforeEach(() => {
    process.env.FLOWS_API_SECRET = SECRET;
    process.env.OWNER_USER_ID = "731ace87-64e5-44db-bf2a-82265f06f4d9";
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.OWNER_EMAIL = OWNER_EMAIL;
    query.mockReset();
  });
  afterEach(() => {
    process.env.FLOWS_API_SECRET = orig.s;
    process.env.OWNER_USER_ID = orig.o;
    process.env.NODE_ENV = orig.e;
    process.env.AUTH_SECRET = orig.a;
    process.env.OWNER_EMAIL = orig.oe;
  });

  it("GET returns 200 with the row for a valid uuid that exists", async () => {
    const row = { id: ID, title: "Netflix", nodes: [], edges: [] };
    query.mockResolvedValueOnce({ rows: [row] });
    const res = mockRes();
    await flowById(req("GET", ID), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(row);
  });

  it("GET returns 404 for a valid uuid that does not exist", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await flowById(req("GET", ID), res);
    expect(res.statusCode).toBe(404);
  });

  // A non-uuid GET is a SLUG lookup now - that is how /?name=my-design resolves.
  // Resolving it by scanning the list endpoints instead was the bug that made a
  // published non-demo design 404 on its own share link.
  it("GET a slug looks the design up by slug, not by id", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ID, slug: "my-design", is_public: true }] });
    const res = mockRes();
    await flowById(req("GET", "my-design"), res);
    expect(res.statusCode).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE slug = \$1/);
    expect(params).toEqual(["my-design"]);
  });

  it("GET a malformed slug returns 400 and never queries the db", async () => {
    const res = mockRes();
    await flowById(req("GET", "not a slug!"), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid id" });
    expect(query).not.toHaveBeenCalled();
  });

  // Mutations stay uuid-only even for a well-formed slug: a slug changes meaning
  // when a design is renamed, so it is not a safe thing to delete or overwrite by.
  it("DELETE by slug returns 400 and never queries the db", async () => {
    const res = mockRes();
    await flowById(req("DELETE", "my-design", `Bearer ${SECRET}`), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid id" });
    expect(query).not.toHaveBeenCalled();
  });

  it("PATCH view_state keeps the whole set of open panels, not one winner", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    const r = req("PATCH", ID, undefined, cookie);
    r.body = { view_state: { panels: ["details", "steps"], badge: "silver" } };
    await flowById(r, res);
    expect(res.statusCode).toBe(200);
    // Order is normalised to the canonical list, and both survive.
    expect(res.body.view_state).toEqual({ panels: ["steps", "details"], badge: "silver" });
  });

  it("PATCH view_state drops anything not a real panel or badge", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    const r = req("PATCH", ID, undefined, cookie);
    r.body = { view_state: { panels: ["steps", "evil", 1], badge: "neon" } };
    await flowById(r, res);
    expect(res.body.view_state).toEqual({ panels: ["steps"], badge: null });
  });

  // A layout save must move nodes and nothing else. Replacing the array with the
  // client's copy let a tab left open across a change write its stale nodes back
  // on the next drag - a low-res logo that had just been backfilled away came
  // back seven minutes later.
  it("PATCH nodes takes ONLY position and keeps stored branding", async () => {
    const stored = [
      { id: "integry", label: "Integry", color: "#ef4444", sub: "DECOMMISSION", position: { x: 0, y: 0 } },
    ];
    query.mockResolvedValueOnce({ rows: [{ nodes: stored }] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    // A stale client sends the OLD inline icon back alongside the new position.
    r.body = { nodes: [{ id: "integry", position: { x: 500, y: 250 }, icon: "data:image/png;base64,STALE", color: "#000000" }] };
    await flowById(r, res);

    const written = JSON.parse(query.mock.calls[1][1][0]);
    expect(written[0].position).toEqual({ x: 500, y: 250 }); // the move lands
    expect(written[0].icon).toBeUndefined();                 // the stale icon does not
    expect(written[0].color).toBe("#ef4444");                // stored branding wins
    expect(written[0].sub).toBe("DECOMMISSION");
  });

  it("PATCH nodes still accepts a genuinely new node whole", async () => {
    query.mockResolvedValueOnce({ rows: [{ nodes: [{ id: "a", position: { x: 0, y: 0 } }] }] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { nodes: [{ id: "brand-new", position: { x: 9, y: 9 }, icon: "/brand/x.png", label: "New" }] };
    await flowById(r, res);
    const written = JSON.parse(query.mock.calls[1][1][0]);
    const added = written.find((n) => n.id === "brand-new");
    expect(added).toEqual({ id: "brand-new", position: { x: 9, y: 9 }, icon: "/brand/x.png", label: "New" });
    expect(written.find((n) => n.id === "a")).toBeTruthy(); // untouched node survives
  });

  // A note is one deliberate edit, merged by id: only the note changes, and
  // '' takes it off. Branding and position come from storage, never the client.
  it("PATCH notes sets, replaces and removes a note by node id and nothing else", async () => {
    const stored = [
      { id: "tray", label: "Tray", color: "#1f2937", position: { x: 0, y: 0 }, note: "old" },
      { id: "recurly", position: { x: 300, y: 0 }, note: "keep me" },
      { id: "ubs", position: { x: 600, y: 0 } },
    ];
    query.mockResolvedValueOnce({ rows: [{ nodes: stored }] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { notes: [
      { id: "tray", note: "  Reads Recurly subscriptions, branches per app.  ", color: "#ff0000", position: { x: 9, y: 9 } },
      { id: "ubs", note: "" },
      { id: "ghost", note: "no such node" },
    ] };
    await flowById(r, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.noted).toBe(2);
    const written = JSON.parse(query.mock.calls[1][1][0]);
    const tray = written.find((n) => n.id === "tray");
    expect(tray.note).toBe("Reads Recurly subscriptions, branches per app.");
    expect(tray.color).toBe("#1f2937");            // branding untouched
    expect(tray.position).toEqual({ x: 0, y: 0 }); // position untouched
    expect(written.find((n) => n.id === "recurly").note).toBe("keep me");
    expect(written.find((n) => n.id === "ubs")).not.toHaveProperty("note");
    expect(written.find((n) => n.id === "ghost")).toBeUndefined();
  });

  it("PATCH notes is owner-only and rejects an empty list", async () => {
    const res = mockRes();
    const anon = req("PATCH", ID);
    anon.body = { notes: [{ id: "tray", note: "x" }] };
    await flowById(anon, res);
    expect(res.statusCode).toBe(401);

    const res2 = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { notes: [] };
    await flowById(r, res2);
    expect(res2.statusCode).toBe(400);
  });

  // A layout save carries the note along with the rest of the stored node.
  it("PATCH nodes (layout save) keeps a stored note", async () => {
    query.mockResolvedValueOnce({ rows: [{ nodes: [{ id: "tray", position: { x: 0, y: 0 }, note: "stays" }] }] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { nodes: [{ id: "tray", position: { x: 50, y: 50 } }] };
    await flowById(r, res);
    const written = JSON.parse(query.mock.calls[1][1][0]);
    expect(written[0]).toEqual({ id: "tray", position: { x: 50, y: 50 }, note: "stays" });
  });

  // Dragged step-badge positions. Merged BY EDGE ID into the stored edges, so a
  // stale or malicious client cannot drop labels or rewrite endpoints.
  it("PATCH edges stores labelT and never touches label or endpoints", async () => {
    const stored = [
      { id: "e1", source: "a", target: "b", label: "first" },
      { id: "e2", source: "b", target: "c", label: "second", labelT: 0.8 },
    ];
    query.mockResolvedValueOnce({ rows: [{ edges: stored }] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    // e1 gets a position; e2's is reset; the caller sends no label or endpoints.
    r.body = { edges: [{ id: "e1", labelT: 0.123456 }, { id: "e2" }] };
    await flowById(r, res);
    expect(res.statusCode).toBe(200);

    const written = JSON.parse(query.mock.calls[1][1][0]);
    expect(written[0]).toEqual({ id: "e1", source: "a", target: "b", label: "first", labelT: 0.1235 });
    // Reset drops the key rather than storing a zero, which would mean "at the start".
    expect(written[1]).toEqual({ id: "e2", source: "b", target: "c", label: "second" });
    expect(res.body.moved).toBe(1);
  });

  it("PATCH edges clamps labelT away from the node ends and ignores a non-number", async () => {
    query.mockResolvedValueOnce({
      rows: [{ edges: [{ id: "e1", source: "a", target: "b" }, { id: "e2", source: "b", target: "c" }] }],
    });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { edges: [{ id: "e1", labelT: 4.2 }, { id: "e2", labelT: "nope" }] };
    await flowById(r, res);
    const written = JSON.parse(query.mock.calls[1][1][0]);
    expect(written[0].labelT).toBe(0.88);      // clamped short of the node
    expect(written[1].labelT).toBeUndefined();  // rubbish ignored
  });

  it("PATCH edges drops the legacy free-floating offset", async () => {
    query.mockResolvedValueOnce({
      rows: [{ edges: [{ id: "e1", source: "a", target: "b", labelOffset: { dx: 30, dy: -20 } }] }],
    });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { edges: [{ id: "e1", labelT: 0.5 }] };
    await flowById(r, res);
    const written = JSON.parse(query.mock.calls[1][1][0]);
    expect(written[0].labelOffset).toBeUndefined();
    expect(written[0].labelT).toBe(0.5);
  });

  it("DELETE is a SOFT delete: stamps deleted_at and says it is recoverable", async () => {
    // DELETE now checks the lock first, so the soft delete is the SECOND query.
    query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    query.mockResolvedValueOnce({ rowCount: 1 });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    await flowById(req("DELETE", ID, undefined, cookie), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: true, recoverable: true });
    // The row is updated, never removed.
    const [sql] = query.mock.calls[1];
    expect(sql).toMatch(/UPDATE flows SET deleted_at = now\(\)/);
    expect(sql).not.toMatch(/DELETE FROM/);
  });

  it("DELETE ?purge=1 hard-deletes, and ONLY a row already in trash", async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: false }] });
    query.mockResolvedValueOnce({ rowCount: 1 });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    await flowById(req("DELETE", ID, undefined, cookie, { purge: "1" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ purged: true });
    const [sql] = query.mock.calls[1];
    expect(sql).toMatch(/DELETE FROM flows/);
    // The guard that makes destroying anything take two deliberate steps.
    expect(sql).toMatch(/deleted_at IS NOT NULL/);
  });

  it("DELETE with a valid Bearer header (no owner session) returns 401 and never queries the db", async () => {
    const res = mockRes();
    await flowById(req("DELETE", ID, `Bearer ${SECRET}`), res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("DELETE with no Bearer (and not local) returns 401 and never queries the db", async () => {
    const res = mockRes();
    await flowById(req("DELETE", ID), res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("DELETE with a bad Bearer (and not local) returns 401 and never queries the db", async () => {
    const res = mockRes();
    await flowById(req("DELETE", ID, "Bearer wrong-secret-1234"), res);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("PUT on a valid uuid returns 405", async () => {
    const res = mockRes();
    await flowById(req("PUT", ID), res);
    expect(res.statusCode).toBe(405);
  });

  // A diagram linked from a README must not disappear because someone tidied the
  // gallery. The guard lives here, server-side, not only in the button.
  it("DELETE refuses a locked diagram, and says how to release it", async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: true }] });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    await flowById(req("DELETE", ID, undefined, cookie), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.locked).toBe(true);
    expect(res.body.detail).toMatch(/unlock/i);
    // Nothing was written - the lock lookup is the only query that ran.
    expect(query.mock.calls).toHaveLength(1);
  });

  it("?purge=1 is refused too, so a lock cannot be stepped around", async () => {
    query.mockResolvedValueOnce({ rows: [{ locked: true }] });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    await flowById(req("DELETE", ID, undefined, cookie, { purge: "1" }), res);
    expect(res.statusCode).toBe(409);
    expect(query.mock.calls).toHaveLength(1);
  });

  it("PATCH { locked } flips the flag", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ID, locked: true }] });
    const res = mockRes();
    const cookie = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;
    const r = req("PATCH", ID, undefined, cookie);
    r.body = { locked: true };
    await flowById(r, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: ID, locked: true });
    expect(query.mock.calls[0][0]).toMatch(/SET locked/);
  });

  it("PATCH nodes on a locked diagram still saves", async () => {
    query.mockResolvedValueOnce({ rows: [{ nodes: [{ id: "a", position: { x: 0, y: 0 } }] }] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { nodes: [{ id: "a", position: { x: 1, y: 1 } }] };
    await flowById(r, res);
    expect(res.statusCode).toBe(200);
  });

  it("PATCH view_state on a locked diagram still saves", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    const r = req("PATCH", ID, undefined, `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`);
    r.body = { view_state: { panels: ["steps"], badge: "dark" } };
    await flowById(r, res);
    expect(res.statusCode).toBe(200);
  });
});
