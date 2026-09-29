import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { boardIdFrom } from "../../lib/handlers/push-to-miro.js";

vi.mock("../../lib/db.js", () => ({
  default: { query: vi.fn(async () => ({ rows: [{ nodes: NODES, edges: EDGES }] })) },
}));
vi.mock("../../lib/auth-owner.js", () => ({
  authorizeOwner: vi.fn(async () => true),
  ownerId: () => "owner",
}));

const NODES = [
  { id: "apigw", position: { x: 0, y: 0 } },
  { id: "lambda", position: { x: 300, y: 0 }, info: "Scales with traffic and costs nothing idle." },
];
const EDGES = [{ source: "apigw", target: "lambda", label: "invoke" }];

const { default: pushToMiro } = await import("../../lib/handlers/push-to-miro.js");

// The handler speaks the express-ish shape lib/next-adapter.js hands it.
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const req = (body) => ({ method: "POST", query: { id: "11111111-2222-3333-4444-555555555555" }, headers: {}, body });

let calls;
beforeEach(() => {
  calls = [];
  let n = 0;
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return { ok: true, status: 200, json: async () => ({ id: `item${++n}` }) };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("boardIdFrom", () => {
  it("takes the id out of a pasted board URL, encoded or not", () => {
    expect(boardIdFrom("https://miro.com/app/board/uXjVN4v8Z1k=/")).toBe("uXjVN4v8Z1k=");
    expect(boardIdFrom("https://miro.com/app/board/uXjVN4v8Z1k%3D/?moveToWidget=3")).toBe("uXjVN4v8Z1k=");
    expect(boardIdFrom("uXjVN4v8Z1k=")).toBe("uXjVN4v8Z1k=");
  });
  it("refuses anything that is not one", () => {
    expect(boardIdFrom("https://example.com/hack")).toBe(null);
    expect(boardIdFrom("")).toBe(null);
  });
});

describe("pushToMiro", () => {
  it("writes shapes, then logos, then connectors - in that order", async () => {
    const r = res();
    await pushToMiro(req({ token: "tok", board: "https://miro.com/app/board/abc123=/" }), r);
    expect(r.code).toBe(200);
    const paths = calls.map((c) => c.url.replace(/.*\/boards\/[^/]+\//, ""));
    // Connectors need the ids the shape calls hand back, so they cannot start
    // until every shape is placed.
    expect(paths.filter((p) => p === "shapes")).toHaveLength(2);
    expect(paths.filter((p) => p === "images")).toHaveLength(2);
    expect(paths.lastIndexOf("shapes")).toBeLessThan(paths.indexOf("connectors"));
    expect(r.body).toEqual({ created: 2, failed: 0, boardUrl: "https://miro.com/app/board/abc123=/" });
  });

  it("binds each connector to ids Miro handed back, not to node ids", async () => {
    await pushToMiro(req({ token: "tok", board: "abc123=" }), res());
    const shapeIds = calls.filter((c) => c.url.endsWith("/shapes")).map((_, i) => `item${i + 1}`);
    const conn = calls.find((c) => c.url.endsWith("/connectors"));
    expect(shapeIds).toContain(conn.body.startItem.id);
    expect(shapeIds).toContain(conn.body.endItem.id);
    expect(conn.body.captions[0].content).toBe("invoke");
  });

  it("converts the canvas's top-left origin to Miro's centre origin", async () => {
    await pushToMiro(req({ token: "tok", board: "abc123=" }), res());
    const first = calls.find((c) => c.url.endsWith("/shapes"));
    // A 180x180 card at (0,0) has its centre at (90,90).
    expect(first.body.position).toEqual({ x: 90, y: 90, origin: "center" });
    expect(first.body.geometry).toEqual({ width: 180, height: 180 });
  });

  it("sends the logo as an embedded data URI, which is the point of the push", async () => {
    await pushToMiro(req({ token: "tok", board: "abc123=" }), res());
    const img = calls.find((c) => c.url.endsWith("/images"));
    expect(img.body.data.url).toMatch(/^data:image\//);
  });

  it("waits out a 429 instead of dropping the shape", async () => {
    let first = true;
    globalThis.fetch = vi.fn(async () => {
      if (first) { first = false; return { ok: false, status: 429, headers: { get: () => "0" } }; }
      return { ok: true, status: 200, json: async () => ({ id: "item1" }) };
    });
    const r = res();
    await pushToMiro(req({ token: "tok", board: "abc123=" }), r);
    expect(r.code).toBe(200);
    expect(r.body.failed).toBe(0);
  });

  it("refuses a request with no token or a URL that is not a board", async () => {
    const a = res();
    await pushToMiro(req({ board: "abc123=" }), a);
    expect(a.code).toBe(400);
    const b = res();
    await pushToMiro(req({ token: "tok", board: "https://example.com" }), b);
    expect(b.code).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("never echoes the token back", async () => {
    const r = res();
    await pushToMiro(req({ token: "super-secret", board: "abc123=" }), r);
    expect(JSON.stringify(r.body)).not.toContain("super-secret");
  });

  it("posts the i badge's text as its own item under the card", async () => {
    // Not inside the shape: a 600-character info in a 180px box either
    // overflows it or shrinks the label along with it.
    await pushToMiro(req({ token: "tok", board: "abc123=" }), res());
    const texts = calls.filter((c) => c.url.endsWith("/texts"));
    // One node has an info, the other does not.
    expect(texts).toHaveLength(1);
    expect(texts[0].body.data.content).toContain("Scales with traffic");
    // Under the 180px card, not on top of it.
    expect(texts[0].body.position.y).toBeGreaterThan(180);
  });
});
