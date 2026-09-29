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

  it("draws the i badge's text under the card, wrapped to the card width", () => {
    // Excalidraw has no hover badge and no auto-wrap, so the info becomes a
    // text element with the line breaks already in it.
    const info = "Runs the shortener on demand. Stateless, so it scales with traffic and costs nothing idle.";
    const out = renderExcalidraw([{ id: "lambda", info, position: { x: 0, y: 0 } }], []);
    const note = out.elements.find((e) => e.id === "n-lambda");
    expect(note.text.split("\n").length).toBeGreaterThan(1);
    expect(note.text.replace(/\n/g, " ")).toBe(info);
    // Below the card, and not grouped with it - a long info is taller than the
    // gap to the next row and must not ride along on every drag.
    expect(note.y).toBeGreaterThanOrEqual(180);
    expect(note.groupIds).toEqual([]);
  });

  it("writes no info element for a node that has none", () => {
    const out = renderExcalidraw(NODES, EDGES);
    expect(out.elements.some((e) => e.id.startsWith("n-"))).toBe(false);
  });

  it("draws the note in its own bordered box under the card", () => {
    const note = "Step 4 Hidden tests. lib/cache/fncache_test.go, package cache. TestFnCacheSanity calls newFnCache directly.";
    const out = renderExcalidraw([{ id: "codebuild", note, position: { x: 0, y: 0 } }], []);
    const box = out.elements.find((e) => e.id === "nb-codebuild");
    const txt = out.elements.find((e) => e.id === "nt-codebuild");
    // A box, not loose text: white fill, black border, exactly what the canvas draws.
    expect(box.type).toBe("rectangle");
    expect(box.strokeColor).toBe("#111111");
    expect(box.backgroundColor).toBe("#ffffff");
    // Every word survives the wrap - a truncated note is worse than no note.
    expect(txt.text.replace(/\n/g, " ")).toBe(note);
    expect(txt.text.split("\n").length).toBeGreaterThan(1);
    // The text sits inside its box, and the box sits below the card.
    expect(box.y).toBeGreaterThanOrEqual(180);
    expect(txt.y).toBeGreaterThan(box.y);
    expect(txt.y + txt.height).toBeLessThanOrEqual(box.y + box.height);
  });

  it("stacks the note under the info when a node has both", () => {
    const out = renderExcalidraw([{ id: "a", info: "Why it is here.", note: "What happens here.", position: { x: 0, y: 0 } }], []);
    const info = out.elements.find((e) => e.id === "n-a");
    const box = out.elements.find((e) => e.id === "nb-a");
    expect(box.y).toBeGreaterThanOrEqual(info.y + info.height);
  });

  it("writes no note box for a node that has none", () => {
    const out = renderExcalidraw([{ id: "a", position: { x: 0, y: 0 } }], []);
    expect(out.elements.some((e) => e.id.startsWith("nb-") || e.id.startsWith("nt-"))).toBe(false);
  });

  it("carries a styled card through, in Excalidraw's own vocabulary", () => {
    const style = { stroke: "#e03131", bg: "#ffec99", bw: 4, bs: "dotted", radius: 12, font: "mono", fs: 24, align: "left", opacity: 60 };
    const out = renderExcalidraw([{ id: "lambda", style, position: { x: 0, y: 0 } }], []);
    const card = out.elements.find((e) => e.id === "r-lambda");
    expect(card.strokeColor).toBe("#e03131");
    // An explicit background is taken flat, not as an 8% wash of the stroke.
    expect(card.backgroundColor).toBe("#ffec99");
    expect(card.strokeWidth).toBe(4);
    expect(card.strokeStyle).toBe("dotted");
    // Excalidraw has no radius in px: a rounded corner is a roundness type.
    expect(card.roundness).toEqual({ type: 3 });
    expect(card.opacity).toBe(60);
    // ...and no serif, so only mono leaves family 2. Never family 1 - that is
    // the hand-drawn face, and this writer does not make sketches.
    const label = out.elements.find((e) => e.id === "t-lambda");
    expect(label.fontFamily).toBe(3);
    expect(label.textAlign).toBe("left");
    // An alignment inside a box that shrinks to its content is not an
    // alignment, so the box has to be pinned to the card width first.
    expect(label.autoResize).toBe(false);
    expect(label.fontSize).toBe(32);
  });

  it("leaves an unstyled card exactly as it was", () => {
    const out = renderExcalidraw([{ id: "lambda", position: { x: 0, y: 0 } }], []);
    const card = out.elements.find((e) => e.id === "r-lambda");
    expect(card.strokeWidth).toBe(1);
    expect(card.strokeStyle).toBe("solid");
    expect(card.roundness).toBe(null);
    expect(card.opacity).toBe(100);
    expect(out.elements.find((e) => e.id === "t-lambda").fontFamily).toBe(2);
  });

  it("refuses a style the panel could never have written", () => {
    // The rows predate the panel and the API is hand-callable, so the export
    // must not be the first thing to trust what it reads.
    const out = renderExcalidraw([{ id: "lambda", position: { x: 0, y: 0 }, style: { stroke: "red; x", bw: 99, bs: "groove" } }], []);
    const card = out.elements.find((e) => e.id === "r-lambda");
    expect(card.strokeWidth).toBe(1);
    expect(card.strokeStyle).toBe("solid");
    expect(card.strokeColor).not.toContain("red");
  });

  it("carries a styled line through", () => {
    const nodes = [{ id: "apigw", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 300, y: 0 } }];
    const edges = [{ source: "apigw", target: "lambda", style: { stroke: "#1971c2", bw: 4, bs: "dashed", opacity: 40 } }];
    const arrow = renderExcalidraw(nodes, edges).elements.find((e) => e.type === "arrow");
    expect(arrow.strokeColor).toBe("#1971c2");
    expect(arrow.strokeWidth).toBe(4);
    expect(arrow.strokeStyle).toBe("dashed");
    expect(arrow.opacity).toBe(40);
    // A picked colour never costs the line its binding: drag a card and the
    // arrow still follows.
    expect(arrow.startBinding.elementId).toBe("r-apigw");
  });

  it("keeps silver on a sunset line even when a stroke was picked", () => {
    const nodes = [{ id: "apigw", position: { x: 0, y: 0 } }, { id: "lambda", sunset: true, position: { x: 300, y: 0 } }];
    const edges = [{ source: "apigw", target: "lambda", style: { stroke: "#1971c2" } }];
    const arrow = renderExcalidraw(nodes, edges).elements.find((e) => e.type === "arrow");
    expect(arrow.strokeColor).toBe(SUNSET.border);
  });

  it("keeps silver on a sunset card even when a stroke was picked", () => {
    const out = renderExcalidraw([{ id: "lambda", sunset: true, style: { stroke: "#e03131" }, position: { x: 0, y: 0 } }], []);
    expect(out.elements.find((e) => e.id === "r-lambda").strokeColor).not.toBe("#e03131");
  });
});
