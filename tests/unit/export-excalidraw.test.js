import { describe, it, expect } from "vitest";
import { renderExcalidraw } from "../../lib/export/excalidraw.js";
import { SUNSET } from "../../src/sunset.js";

const NODES = [
  { id: "apigw", position: { x: 0, y: 0 } },
  { id: "lambda", position: { x: 300, y: 0 } },
  { id: "dynamo", position: { x: 600, y: 0 }, sunset: true },
];
const EDGES = [
  { source: "apigw", target: "lambda", label: "invoke" },
  { source: "lambda", target: "dynamo" },
];

describe("renderExcalidraw", () => {
  it("writes a scene Excalidraw will open", () => {
    const out = renderExcalidraw(NODES, EDGES);
    expect(out.type).toBe("excalidraw");
    expect(out.version).toBe(2);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out); // no undefined / cycles
    expect(out.elements.length).toBeGreaterThan(0);
  });

  it("embeds each logo ONCE and points every image element at a real file", () => {
    // The whole feature is the logos. A card without its mark is a grey box.
    const out = renderExcalidraw([...NODES, { id: "lambda2", icon: "/icons/lambda.svg", label: "Worker", position: { x: 0, y: 300 } }], []);
    const images = out.elements.filter((e) => e.type === "image");
    expect(images).toHaveLength(4);
    expect(images.every((i) => out.files[i.fileId])).toBe(true);
    // Two Lambda nodes, one copy of the Lambda SVG.
    expect(Object.keys(out.files)).toHaveLength(3);
    for (const f of Object.values(out.files)) {
      expect(f.dataURL).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(f.mimeType).toBe("image/svg+xml");
    }
  });

  it("binds every arrow to both cards so the diagram stays wired when dragged", () => {
    const out = renderExcalidraw(NODES, EDGES);
    const ids = new Set(out.elements.map((e) => e.id));
    const arrows = out.elements.filter((e) => e.type === "arrow");
    expect(arrows).toHaveLength(2);
    for (const a of arrows) {
      expect(ids.has(a.startBinding.elementId)).toBe(true);
      expect(ids.has(a.endBinding.elementId)).toBe(true);
      expect(a.endArrowhead).toBe("arrow");
    }
    // ...and the cards know about the arrows, which is the half that makes
    // Excalidraw actually re-route them.
    const rect = out.elements.find((e) => e.id === "r-lambda");
    expect(rect.boundElements.map((b) => b.type)).toEqual(["arrow", "arrow"]);
  });

  it("carries an edge label as text bound to its arrow", () => {
    const out = renderExcalidraw(NODES, EDGES);
    const label = out.elements.find((e) => e.type === "text" && e.text === "invoke");
    expect(label.containerId).toBeTruthy();
    const arrow = out.elements.find((e) => e.id === label.containerId);
    expect(arrow.boundElements).toEqual([{ id: label.id, type: "text" }]);
  });

  it("sizes an edge label's box to fit the words", () => {
    // A fixed-width box clipped every longer label at BOTH ends, because the
    // text is centred in it: "cache miss / route" rendered as "ache miss / rout".
    const long = "read/write short->long (sharded)";
    const out = renderExcalidraw(NODES, [{ source: "apigw", target: "lambda", label: long }]);
    const label = out.elements.find((e) => e.text === long);
    expect(label.width).toBeGreaterThan(long.length * 5);
  });

  it("draws clean, never sketchy", () => {
    // roughness 0 is the difference between an architecture diagram and a
    // doodle. Nothing in an export may raise it.
    const out = renderExcalidraw(NODES, EDGES);
    expect(out.elements.every((e) => e.roughness === 0)).toBe(true);
  });

  it("gives every element the fields Excalidraw silently drops an element without", () => {
    const out = renderExcalidraw(NODES, EDGES);
    const required = ["id", "type", "x", "y", "width", "height", "angle", "strokeColor",
      "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity",
      "groupIds", "frameId", "roundness", "seed", "version", "versionNonce", "isDeleted", "updated", "link", "locked"];
    for (const e of out.elements) {
      for (const k of required) expect(e, `${e.type} ${e.id} missing ${k}`).toHaveProperty(k);
    }
  });

  it("groups a card's parts so it moves as one", () => {
    const out = renderExcalidraw(NODES, EDGES);
    const parts = out.elements.filter((e) => e.groupIds.includes("g-lambda"));
    expect(parts.length).toBeGreaterThanOrEqual(3); // card, logo, label
    expect(parts.map((p) => p.type)).toContain("rectangle");
  });

  it("paints the card behind its own label", () => {
    // Excalidraw z-orders by array index, so a card added after its text hides it.
    const out = renderExcalidraw(NODES, EDGES);
    const i = (id) => out.elements.findIndex((e) => e.id === id);
    expect(i("r-lambda")).toBeLessThan(i("t-lambda"));
    expect(i("r-lambda")).toBeLessThan(i("i-lambda"));
  });

  it("marks a sunset node silver with a red X", () => {
    const out = renderExcalidraw(NODES, EDGES);
    const rect = out.elements.find((e) => e.id === "r-dynamo");
    expect(rect.backgroundColor).toBe(SUNSET.tint);
    expect(rect.strokeColor).toBe(SUNSET.border);
    const xs = out.elements.filter((e) => e.type === "line" && e.strokeColor === SUNSET.x);
    expect(xs).toHaveLength(2);
    // The logo dims rather than greys - Excalidraw has no image filter.
    expect(out.elements.find((e) => e.id === "i-dynamo").opacity).toBeLessThan(100);
  });

  it("is deterministic, so the same flow exports to the same bytes", () => {
    expect(JSON.stringify(renderExcalidraw(NODES, EDGES)))
      .toBe(JSON.stringify(renderExcalidraw(NODES, EDGES)));
  });

  it("survives a flow with no nodes", () => {
    const out = renderExcalidraw([], []);
    expect(out.type).toBe("excalidraw");
    expect(out.elements).toEqual([]);
  });
});
