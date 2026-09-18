import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signSession } from "../../lib/auth-session.js";

// AI generate was the one door with no logo gate: a hallucinated service id was
// stored and drawn as a bare letter. Now it goes through lib/validate-design.js
// and the same arrange step as the API.
const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));
let modelReply = "";
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: async () => ({ content: [{ type: "text", text: modelReply }], usage: { output_tokens: 7 } }) } },
}));
const { default: generate } = await import("../../lib/handlers/generate.js");

function mockRes() {
  return { statusCode: 0, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
}
const ID = "11111111-1111-1111-1111-111111111111";
const ENV = { NODE_ENV: "production", AUTH_SECRET: "s".repeat(32), OWNER_EMAIL: "owner@example.com", OWNER_USER_ID: "731ace87-64e5-44db-bf2a-82265f06f4d9", ANTHROPIC_API_KEY: "k" };
const saved = {};
const req = () => ({
  method: "POST", query: {}, body: { prompt: "a url shortener" },
  headers: { host: "flows-bheng.vercel.app", cookie: `sd_session=${signSession({ email: ENV.OWNER_EMAIL })}` },
});

describe("POST /api/ai/generate - logo gate + arrange", () => {
  beforeEach(() => { for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; } delete process.env.LOCAL_DEV; query.mockReset(); });
  afterEach(() => { for (const k of Object.keys(ENV)) process.env[k] = saved[k]; });

  it("422s a hallucinated service id and stores nothing", async () => {
    modelReply = JSON.stringify({ title: "X", nodes: [{ id: "user" }, { id: "magic-db" }], edges: [] });
    const res = mockRes();
    await generate(req(), res);
    expect(res.statusCode).toBe(422);
    expect(res.body.unresolved).toEqual(["magic-db"]);
    expect(query).not.toHaveBeenCalled();
  });

  it("201s a valid reply with every node arranged and only stored fields kept", async () => {
    modelReply = "```json\n" + JSON.stringify({ title: "URL Shortener", nodes: [{ id: "user", junk: 1 }, { id: "apigw", color: "red" }], edges: [{ id: "e1", source: "user", target: "apigw", label: "GET" }] }) + "\n```";
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: ID }] });
    const res = mockRes();
    await generate(req(), res);
    expect(res.statusCode).toBe(201);
    const written = JSON.parse(query.mock.calls[1][1][3]);
    expect(written).toHaveLength(2);
    for (const n of written) { expect(n.position.x).toEqual(expect.any(Number)); expect(n).not.toHaveProperty("junk"); expect(n).not.toHaveProperty("color"); }
  });
});
