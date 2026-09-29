import { describe, it, expect } from "vitest";
import { buildScene, wrapText, CARD_W, CARD_H, PIC_W, PIC_H } from "../../lib/export/scene.js";
import { SUNSET } from "../../src/sunset.js";

describe("buildScene - the geometry every interchange export shares", () => {
  it("keeps stored positions verbatim, at TRUE canvas size", () => {
    // render-svg squashes cards to 158x94 to fit a share card. An export that
    // lands in a tool the owner keeps editing must not: a card there has to be
    // the size it was here.
    const { nodes } = buildScene([{ id: "lambda", position: { x: 40, y: 90 } }], []);
    expect(nodes[0]).toMatchObject({ x: 40, y: 90, w: CARD_W, h: CARD_H });
  });

  it("gives a picture node the wider card and honours a dragged size", () => {
    const { nodes } = buildScene([
      { id: "shot", position: { x: 0, y: 0 }, image: "data:image/jpeg;base64,AA" },
      { id: "big", position: { x: 400, y: 0 }, size: { w: 320, h: 260 } },
    ], []);
    expect(nodes[0]).toMatchObject({ w: PIC_W, h: PIC_H, isPicture: true });
    expect(nodes[1]).toMatchObject({ w: 320, h: 260 });
  });

  it("falls back to the layered layout when no node has a position", () => {
    const { nodes } = buildScene(
      [{ id: "apigw" }, { id: "lambda" }, { id: "dynamo" }],
      [{ source: "apigw", target: "lambda" }, { source: "lambda", target: "dynamo" }],
    );
    // A chain must come out as a chain, not a pile at the origin.
    expect(new Set(nodes.map((n) => n.x)).size).toBe(3);
    expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it("resolves the service logo to an embedded data URI, never a path", () => {
    const { nodes } = buildScene([{ id: "lambda", position: { x: 0, y: 0 } }], []);
    expect(nodes[0].iconDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(nodes[0].label).toBe("Lambda");
  });

  it("paints a sunset node silver and carries the state onto its edges", () => {
    const { nodes, edges } = buildScene(
      [{ id: "apigw", position: { x: 0, y: 0 } }, { id: "dynamo", position: { x: 300, y: 0 }, sunset: true }],
      [{ source: "apigw", target: "dynamo" }],
    );
    expect(nodes[1].color).toBe(SUNSET.border);
    expect(nodes[0].color).not.toBe(SUNSET.border);
    // An edge into something being decommissioned is on its way out too.
    expect(edges[0].sunset).toBe(true);
  });

  it("drops an edge pointing at a node that is not there", () => {
    const { edges } = buildScene(
      [{ id: "lambda", position: { x: 0, y: 0 } }],
      [{ source: "lambda", target: "ghost" }],
    );
    expect(edges).toHaveLength(0);
  });

  it("returns an empty scene rather than throwing on a flow with no nodes", () => {
    expect(buildScene([], [])).toEqual({ nodes: [], edges: [], bounds: { x: 0, y: 0, w: 0, h: 0 } });
  });

  it("carries what the i badge hides, so the export does not drop it", () => {
    const info = "Runs the shortener. Stateless, so it scales with traffic.";
    const scene = buildScene([{ id: "lambda", info, position: { x: 0, y: 0 } }], []);
    expect(scene.nodes[0].info).toBe(info);
  });

  it("wraps text to a measure, since Excalidraw never wraps one for you", () => {
    expect(wrapText("one two three four five", 9)).toEqual(["one two", "three", "four five"]);
    expect(wrapText("", 10)).toEqual([]);
  });
});
