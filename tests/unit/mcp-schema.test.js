// Every MCP tool has to survive z.toJSONSchema, because that is what tools/list
// returns. A schema can parse perfectly and still throw there (z.record with 1
// argument does exactly that in zod 4), and when it throws the client gets an
// error instead of a tool list - so the server looks like it has no tools at
// all. That shipped once. This is the guard.
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { PANELS, BADGES, SPEEDS, AMOUNTS } from "../../src/view-state.js";

const listTools = () =>
  new Promise((resolve, reject) => {
    const p = spawn("node", ["mcp/server.mjs"], {
      env: { ...process.env, OWNER_USER_ID: process.env.OWNER_USER_ID || "00000000-0000-0000-0000-000000000000" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      for (const line of out.split("\n")) {
        try {
          const m = JSON.parse(line);
          if (m.id === 2) return m.error ? reject(new Error(m.error.message)) : resolve(m.result.tools);
        } catch { /* not a json line */ }
      }
      reject(new Error(`no tools/list response in: ${out.slice(0, 200)}`));
    });
    p.on("error", reject);
    for (const msg of [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]) p.stdin.write(`${JSON.stringify(msg)}\n`);
    p.stdin.end();
  });

describe("the MCP tool list", () => {
  it("converts every tool to JSON schema without throwing", async () => {
    const tools = await listTools();
    expect(tools.length).toBeGreaterThan(10);
    for (const t of tools) expect(t.inputSchema, t.name).toBeTruthy();
  }, 20_000);

  it("offers the same node and edge fields on create as on update, so a round trip loses nothing", async () => {
    const by = Object.fromEntries((await listTools()).map((t) => [t.name, t.inputSchema.properties]));
    for (const part of ["nodes", "edges"]) {
      const c = Object.keys(by.create_flow[part].items.properties).sort();
      const u = Object.keys(by.update_flow[part].items.properties).sort();
      expect(u, part).toEqual(c);
    }
    // The 3 the canvas writes and the schema used to drop on the floor.
    for (const k of ["size", "iconSize", "style"]) expect(by.update_flow.nodes.items.properties).toHaveProperty(k);
    for (const k of ["id", "style"]) expect(by.update_flow.edges.items.properties).toHaveProperty(k);
  }, 20_000);

  it("declares the panels and badges from src/view-state.js and nothing else", async () => {
    const view = (await listTools()).find((t) => t.name === "update_flow").inputSchema.properties.view.properties;
    expect(view.panels.items.enum).toEqual(PANELS);
    expect(view.badge.enum).toEqual(BADGES);
    // The current's 2 presets are the 4th door onto the same list: the canvas
    // writes them, the API validates them, the renderer draws them.
    const cur = view.current.properties;
    expect(cur.speed.anyOf.map((o) => o.const)).toEqual(SPEEDS);
    expect(cur.amount.anyOf.map((o) => o.const)).toEqual(AMOUNTS);
  }, 20_000);
});
