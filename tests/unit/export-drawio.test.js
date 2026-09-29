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
    const vertices = cellsOf(xml).filter((c) => c.includes('vertex="1"')
      && !attr(c, "id").startsWith("x-") && !attr(c, "id").startsWith("g-"));
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

  it("drops the note below the card's own label, which draw.io hangs underneath", () => {
    // verticalLabelPosition=bottom means the label and sub live in the gap under
    // the shape. A note parked at the bottom edge covers them and the card loses
    // its name - so the more the card says, the further the note falls.
    const note = "what happens here";
    const y = (node) => Number(/<mxCell id="nt-[^"]*"[\s\S]*?<mxGeometry x="-?\d+" y="(-?\d+)"/.exec(renderDrawio([node], []))[1]);
    const bare = y({ id: "lambda", note, position: { x: 0, y: 0 } });
    const wordy = y({ id: "lambda", note, sub: "Trigger", info: "Runs the shortener on demand, stateless and cheap when idle.", position: { x: 0, y: 0 } });
    expect(bare).toBeGreaterThan(180);
    expect(wordy).toBeGreaterThan(bare);
    // A bigger label takes more of that gap, so the clearance scales with it.
    expect(y({ id: "lambda", note, style: { fs: 24 }, position: { x: 0, y: 0 } })).toBeGreaterThan(bare);
  });

  it("paints a logo card's border with imageBorder, which is the only one that shows", () => {
    // strokeColor on shape=image is accepted and drawn by nothing.
    const s = /<mxCell id="lambda" [^>]*style="([^"]*)"/.exec(renderDrawio([{ id: "lambda", position: { x: 0, y: 0 } }], []))[1];
    expect(s).toContain("imageBorder=");
  });

  it("writes no note vertex for a node that has none", () => {
    expect(renderDrawio([{ id: "a", position: { x: 0, y: 0 } }], [])).not.toContain('id="nt-a"');
  });

  it("carries a styled card through, in draw.io's own vocabulary", () => {
    const style = { stroke: "#e03131", bg: "#ffec99", bw: 4, bs: "dashed", radius: 12, font: "mono", fs: 24, align: "left", opacity: 60 };
    // A vertex with no logo takes the plain-rectangle style branch, which is
    // where fill and corner live - the image branch has neither.
    const xml = renderDrawio([{ id: "x", label: "X", icon: "/brand/x.svg", style, position: { x: 0, y: 0 } }], []);
    const s = /<mxCell id="x" [^>]*style="([^"]*)"/.exec(xml)[1];
    expect(s).toContain("strokeColor=#e03131");
    expect(s).toContain("strokeWidth=4");
    // draw.io spells a dash as its own pair, not as an SVG dasharray attribute.
    expect(s).toContain("dashed=1");
    expect(s).toContain("dashPattern=20 12");
    expect(s).toContain("opacity=60");
    expect(s).toContain("fontFamily=Courier New");
    expect(s).toContain("fontSize=24");
    expect(s).toContain("align=left");
    // A plain card is a rectangle, so fill and corner land the usual way -
    // draw.io's arcSize is a PERCENTAGE of the shorter side, not px.
    expect(s).toContain("fillColor=#ffec99");
    expect(s).toContain("rounded=1");
    expect(s).toContain("arcSize=13");
  });

  it("paints a logo card's background with imageBackground, where fillColor does nothing", () => {
    // A catalog id resolves to a real logo, which is draw.io's image shape -
    // a different style vocabulary from the plain rectangle above.
    const s = /<mxCell id="lambda" [^>]*style="([^"]*)"/.exec(
      renderDrawio([{ id: "lambda", style: { bg: "#ffec99", bw: 2 }, position: { x: 0, y: 0 } }], []),
    )[1];
    expect(s).toContain("shape=image");
    expect(s).toContain("imageBackground=#ffec99");
    expect(s).toContain("strokeWidth=2");
    expect(s).not.toContain("fillColor=");
  });

  it("leaves an unstyled card exactly as it was", () => {
    const s = /<mxCell id="x" [^>]*style="([^"]*)"/.exec(renderDrawio([{ id: "x", label: "X", icon: "/brand/x.svg", position: { x: 0, y: 0 } }], []))[1];
    expect(s).not.toContain("strokeWidth=");
    expect(s).not.toContain("dashed=1");
    expect(s).not.toContain("opacity=");
  });

  it("carries a styled line into the connector style", () => {
    const xml = renderDrawio(NODES, [{ source: "apigw", target: "lambda", style: { stroke: "#1971c2", bw: 4, bs: "dashed", opacity: 40 } }]);
    const edge = cellsOf(xml).find((c) => c.includes('edge="1"'));
    const style = attr(edge, "style");
    expect(style).toContain("strokeColor=#1971c2");
    expect(style).toContain("strokeWidth=4");
    expect(style).toContain("dashed=1");
    expect(style).toContain("opacity=40");
  });

  it("maps the 3 arrow types onto draw.io's own", () => {
    const of = (arrow) => {
      const xml = renderDrawio(NODES, [{ source: "apigw", target: "lambda", ...(arrow ? { style: { arrow } } : {}) }]);
      return attr(cellsOf(xml).find((c) => c.includes('edge="1"')), "style");
    };
    expect(of("step")).toContain("edgeStyle=orthogonalEdgeStyle");
    expect(of()).toContain("edgeStyle=orthogonalEdgeStyle");
    expect(of("curved")).toContain("curved=1");
    expect(of("straight")).toContain("edgeStyle=none");
    expect(of("straight")).not.toContain("curved=1");
  });

  // draw.io stacks by document order and does not move a free vertex with the
  // shape above it, so both rules live in the writer, not in the importer.
  it("writes the edges first and rides a note in a group with its card", () => {
    const xml = renderDrawio([{ id: "lambda", note: "watch this one", position: { x: 0, y: 0 } },
      { id: "apigw", position: { x: 400, y: 0 } }], [{ source: "apigw", target: "lambda" }]);
    const ids = cellsOf(xml).map((c) => attr(c, "id"));
    // Every connector is below every shape.
    expect(ids.indexOf("edge-0")).toBeLessThan(ids.indexOf("lambda"));
    expect(ids.indexOf("edge-0")).toBeLessThan(ids.indexOf("nt-lambda"));
    // The card and its note are children of one group, and their geometry is
    // relative to it - an absolute x here would fling the note across the page.
    const group = cellsOf(xml).find((c) => attr(c, "id") === "g-lambda");
    expect(group).toContain('style="group;"');
    for (const id of ["lambda", "nt-lambda"]) {
      expect(cellsOf(xml).find((c) => attr(c, "id") === id)).toContain('parent="g-lambda"');
    }
    const geo = (id) => /x="(-?\d+)" y="(-?\d+)"/.exec(xml.slice(xml.indexOf(`id="${id}"`)));
    expect(geo("lambda").slice(1)).toEqual(["0", "0"]);
    // A card with nothing hanging off it needs no group.
    expect(ids).not.toContain("g-apigw");
    expect(cellsOf(xml).find((c) => attr(c, "id") === "apigw")).toContain('parent="1"');
  });
});
