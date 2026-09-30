import { describe, it, expect } from "vitest";
import { layoutElements } from "../../src/layout.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";

// A design that CLOSES A LOOP - the last step feeds back into the entry node.
// Most real designs do. The return edge used to give the entry node an incoming
// rank, so dagre pushed it into the middle of the canvas and the "Start here"
// pill pointed at something that was neither on the left nor obviously first.
const NODES = ["thryvbc", "sqs", "fastapi", "postgres", "cyclr", "s3"].map((id) => ({
  id,
  type: "awsNode",
  data: { id },
}));
const EDGES = [
  { id: "e0", source: "thryvbc", target: "sqs" },
  { id: "e1", source: "sqs", target: "fastapi" },
  { id: "e2", source: "fastapi", target: "postgres" },
  { id: "e3", source: "fastapi", target: "cyclr" },
  { id: "e4", source: "cyclr", target: "s3" },
  { id: "e5", source: "s3", target: "thryvbc" }, // the loop back to the start
];

const canvas = { width: 1600, height: 900 };

describe("layout puts the start node on the left, even on a loop", () => {
  it("ranks the entry node first despite an edge pointing back into it", () => {
    const laid = layoutElements(NODES, EDGES, { canvas }).filter((n) => n.type === "awsNode");
    const xs = laid.map((n) => n.position.x);
    const start = laid.find((n) => n.id === "thryvbc");
    expect(start.position.x).toBe(Math.min(...xs));
  });

  it("still puts a plain chain's head on the left", () => {
    const acyclic = EDGES.slice(0, 5);
    const laid = layoutElements(NODES, acyclic, { canvas }).filter((n) => n.type === "awsNode");
    const start = laid.find((n) => n.id === "thryvbc");
    expect(start.position.x).toBe(Math.min(...laid.map((n) => n.position.x)));
  });
});

describe("the share card's fallback layout survives a loop", () => {
  // With no stored positions the SVG renderer lays the design out itself. Relaxing
  // depth around a cycle gave every node its own column: a 12-node design became a
  // 24:1 chain that letterboxed to a hairline inside the card.
  it("keeps a sane aspect ratio instead of stringing every node into its own column", () => {
    const svg = renderDiagramSvg(
      NODES.map((n) => ({ id: n.id })), // deliberately position-less
      EDGES,
    );
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
    expect(w / h).toBeLessThan(6);
  });

  it("draws every node, and the loop edge too", () => {
    const svg = renderDiagramSvg(NODES.map((n) => ({ id: n.id })), EDGES);
    // One card group per node - counting labels would miss two services that
    // share a display name.
    expect((svg.match(/<g transform="translate\(/g) || []).length).toBeGreaterThanOrEqual(NODES.length);
    for (const label of ["PostgreSQL", "SQS", "FastAPI", "Cyclr", "S3"]) expect(svg).toContain(label);
    // Every edge is drawn, including the one that closes the loop.
    expect((svg.match(/<path d="M[^"]*" fill="none"/g) || []).length).toBeGreaterThanOrEqual(EDGES.length);
  });
});
