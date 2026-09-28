import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// HARD RULE: a diagram starts on the LEFT and reads left-to-right. Never from the
// bottom, never backward.
//
// The rule lives in mcp/server.mjs, which starts a stdio server on import, so the
// two pure helpers are lifted out and evaluated on their own.
let toStoredNodes, enforceStartLeft;
beforeAll(async () => {
  const src = readFileSync("mcp/server.mjs", "utf8");
  const body = src.slice(src.indexOf("function toStoredNodes"), src.indexOf("function toStoredEdges"));
  const mod = await import(
    // toStoredNodes bounds a node note through the shared helper, so hand it the real one.
    "data:text/javascript," + encodeURIComponent(
      `import { cleanNote, cleanInfo } from "${pathToFileURL("src/note.js").href}";\nimport { okColor } from "${pathToFileURL("lib/validate-design.js").href}";\n` + body + "\nexport { toStoredNodes, enforceStartLeft }",
    )
  );
  ({ toStoredNodes, enforceStartLeft } = mod);
});

const IDS = ["thryvbc", "sqs", "fastapi", "cyclr", "s3"];
const NODES = IDS.map((id) => ({ id }));
const EDGES = [
  { source: "thryvbc", target: "sqs" },
  { source: "sqs", target: "fastapi" },
  { source: "fastapi", target: "cyclr" },
  { source: "cyclr", target: "s3" },
  { source: "s3", target: "thryvbc" }, // closes the loop
];

const run = (nodes) => enforceStartLeft(toStoredNodes(nodes), EDGES);
const kept = (r) => r.nodes.filter((n) => n.position).length;

describe("start-left rule", () => {
  it("stores NO positions when the caller gives none, so the canvas lays it out", () => {
    // This is the fix at source: omitting x/y used to fabricate a 6-column grid
    // BY ARRAY INDEX, which made the app treat it as hand-placed and skip its own
    // layout. A start node late in the array then landed bottom-right.
    const r = run(NODES);
    expect(kept(r)).toBe(0);
    expect(r.warning).toBeNull();
  });

  it("rejects the fabricated grid that put the start at the bottom", () => {
    const grid = [...NODES].reverse().map((n, i) => ({ ...n, x: 120 + (i % 2) * 220, y: 120 + Math.floor(i / 2) * 160 }));
    const r = run(grid);
    expect(r.warning).toMatch(/bottom/);
    expect(kept(r)).toBe(0); // dropped -> auto-laid out left-to-right
  });

  it("rejects a right-to-left flow", () => {
    const r = run(NODES.map((n, i) => ({ ...n, x: 1400 - i * 260, y: 300 })));
    expect(r.warning).toMatch(/leftmost column/);
    expect(kept(r)).toBe(0);
  });

  it("keeps a good single-row layout - every node shares a y, which is not 'at the bottom'", () => {
    const r = run(NODES.map((n, i) => ({ ...n, x: 60 + i * 260, y: 300 })));
    expect(r.warning).toBeNull();
    expect(kept(r)).toBe(IDS.length);
  });

  it("keeps a good diagonal layout", () => {
    const r = run(NODES.map((n, i) => ({ ...n, x: 60 + i * 260, y: 200 + i * 90 })));
    expect(r.warning).toBeNull();
    expect(kept(r)).toBe(IDS.length);
  });

  it("keeps a grid whose start is top-left", () => {
    const r = run(NODES.map((n, i) => ({ ...n, x: 120 + (i % 2) * 220, y: 120 + Math.floor(i / 2) * 160 })));
    expect(r.warning).toBeNull();
    expect(kept(r)).toBe(IDS.length);
  });

  it("leaves a partially placed layout alone - it gets auto-laid out anyway", () => {
    const half = NODES.map((n, i) => (i < 2 ? { ...n, x: 60 + i * 260, y: 300 } : n));
    const r = run(half);
    expect(r.warning).toBeNull();
  });
});
