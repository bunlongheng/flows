import { describe, it, expect } from "vitest";
import { renderDrawio } from "../../lib/export/drawio.js";
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

// Cheap structural read - enough to assert shape without pulling in a parser.
const cellsOf = (xml) => xml.match(/<mxCell [^>]*>/g) || [];
const attr = (cell, name) => (new RegExp(`${name}="([^"]*)"`).exec(cell) || [])[1];

describe("renderDrawio", () => {
  it("writes a draw.io file with the two root cells and one vertex per node", () => {
    const xml = renderDrawio(NODES, EDGES);
    expect(xml.startsWith("<mxfile")).toBe(true);
    expect(xml).toContain('<mxCell id="0"/><mxCell id="1" parent="0"/>');
    const vertices = cellsOf(xml).filter((c) => c.includes('vertex="1"') && !attr(c, "id").startsWith("x-"));
    expect(vertices).toHaveLength(3);
    expect(vertices.map((c) => attr(c, "id"))).toEqual(["apigw", "lambda", "dynamo"]);
  });

  it("embeds the logo in a form draw.io's style parser survives", () => {
    // draw.io's style string is SEMICOLON-separated, so a data URI carrying
    // ";base64" terminates the image= value early and the shape renders blank,
    // with no error anywhere. draw.io's own convention drops the marker.
    const xml = renderDrawio(NODES, []);
    expect(xml).toContain("image=data:image/svg+xml,");
    expect(xml).not.toContain("image=data:image/svg+xml;base64,");
    // One image per node, all three present.
    expect(xml.match(/image=data:image\/svg\+xml,/g)).toHaveLength(3);
  });

  it("keeps the canvas geometry", () => {
    const xml = renderDrawio(NODES, []);
    expect(xml).toContain('<mxGeometry x="0" y="0" width="180" height="180" as="geometry"/>');
    expect(xml).toContain('<mxGeometry x="300" y="0" width="180" height="180" as="geometry"/>');
  });

  it("wires every edge to vertices that exist", () => {
    const xml = renderDrawio(NODES, EDGES);
    const ids = new Set(cellsOf(xml).filter((c) => c.includes('vertex="1"')).map((c) => attr(c, "id")));
    const edges = cellsOf(xml).filter((c) => c.includes('edge="1"'));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(ids.has(attr(e, "source"))).toBe(true);
      expect(ids.has(attr(e, "target"))).toBe(true);
    }
    expect(attr(edges[0], "value")).toBe("invoke");
  });

  it("escapes a label that would otherwise break the XML", () => {
    // Node labels are the owner's own words and land inside an attribute.
    const xml = renderDrawio(
      [{ id: "x", label: 'A & B <script>"go"', icon: "/icons/lambda.svg", position: { x: 0, y: 0 } }],
      [],
    );
    expect(xml).not.toContain("<script>");
    // The label's own <b> is escaped too, so nothing leaves a bare ">" inside
    // an attribute value.
    expect(xml).toContain("&lt;b&gt;A &amp;amp; B &amp;lt;script&amp;gt;");
    // Still one well-formed vertex, not a torn attribute.
    expect(cellsOf(xml).filter((c) => c.includes('vertex="1"'))).toHaveLength(1);
  });

  it("marks a sunset node silver, dashed and crossed", () => {
    const xml = renderDrawio(NODES, EDGES);
    const cross = cellsOf(xml).find((c) => attr(c, "id") === "x-dynamo");
    expect(cross).toBeTruthy();
    expect(cross).toContain(SUNSET.x);
    // ...and the edge into it goes silver and dashed with it.
    const edge = cellsOf(xml).filter((c) => c.includes('edge="1"'))[1];
    expect(edge).toContain(SUNSET.border);
    expect(edge).toContain("dashed=1");
  });

  it("falls back to a labelled box for a node with no logo", () => {
    const xml = renderDrawio([{ id: "mystery", label: "Something", position: { x: 0, y: 0 } }], []);
    expect(xml).not.toContain("shape=image");
    expect(xml).toContain("whiteSpace=wrap");
    expect(xml).toContain("Something");
  });

  it("survives a flow with no nodes", () => {
    const xml = renderDrawio([], []);
    expect(xml.startsWith("<mxfile")).toBe(true);
    expect(cellsOf(xml).filter((c) => c.includes('vertex="1"'))).toHaveLength(0);
  });

  it("puts the i badge's text under the card as a third line", () => {
    const xml = renderDrawio([{ id: "lambda", info: "Runs the shortener.", position: { x: 0, y: 0 } }], []);
    // Escaped twice - it is markup inside an XML attribute, same as the label.
    expect(xml).toContain("&lt;font color=&quot;#9ca3af&quot;");
    expect(xml).toContain("Runs the shortener.");
    // A label under an image shape runs off sideways without this.
    expect(xml).toContain("whiteSpace=wrap");
  });

  it("escapes info as carefully as the label", () => {
    const xml = renderDrawio([{ id: "x", info: '<script>"go"', position: { x: 0, y: 0 } }], []);
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&amp;lt;script&amp;gt;");
  });

  it("gives the note its own vertex under the card, escaped twice", () => {
    const xml = renderDrawio([{ id: "cb", note: 'calls Get<ctx> & "key"', position: { x: 0, y: 0 } }], []);
    const cell = /<mxCell id="nt-cb" value="([^"]*)"[\s\S]*?<mxGeometry x="(-?\d+)" y="(-?\d+)"/.exec(xml);
    expect(cell).toBeTruthy();
    // XML layer then HTML layer: a single escape would hand draw.io live markup.
    expect(cell[1]).toBe("calls Get&amp;lt;ctx&amp;gt; &amp;amp; &amp;quot;key&amp;quot;");
    // Under the card, never inside it - a paragraph in a 180px shape crushes the logo.
    expect(Number(cell[3])).toBeGreaterThanOrEqual(180);
  });

  it("writes no note vertex for a node that has none", () => {
    expect(renderDrawio([{ id: "a", position: { x: 0, y: 0 } }], [])).not.toContain('id="nt-a"');
  });
});
