import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const NODES = [
  { id: "client", position: { x: 0, y: 0 }, note: "A user installs or uninstalls an app from Business Center." },
  { id: "ses", position: { x: 300, y: 0 } },
];
const EDGES = [{ source: "client", target: "ses", label: "webhook" }];

describe("renderDiagramSvg - node notes", () => {
  // The shared SVG must say what each step does, the same as the app does.
  it("draws a framed, wrapped caption for a node with a note and nothing for one without", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toContain('stroke="#111111"');
    expect(svg).toContain("A user installs or");
    expect(svg).toContain("Business Center.");
    // A single framed caption, not one per node.
    expect(svg.match(/stroke="#111111"/g)).toHaveLength(1);
  });

  it("clamps a long note to 10 lines with an ellipsis and escapes markup", () => {
    const note = "<b>alpha</b> " + "word ".repeat(70);
    const svg = renderDiagramSvg([{ ...NODES[0], note }], []);
    expect(svg).not.toContain("<b>alpha</b>");
    expect(svg).toContain("&lt;b&gt;alpha&lt;/b&gt;");
    const lines = svg.match(/<text x="5" y="[\d.]+" font-size="10"/g) || [];
    expect(lines).toHaveLength(10);
    expect(svg).toContain("…");
  });

  it("renders **bold** runs and a Jira URL as its ticket key, like the canvas", () => {
    const note = "Waits on **Patrick**. https://thryv.atlassian.net/browse/SHAR-8090 open.";
    const svg = renderDiagramSvg([{ ...NODES[0], note }], []);
    expect(svg).toContain('font-weight="700">Patrick</tspan>');
    expect(svg).toContain('<a href="https://thryv.atlassian.net/browse/SHAR-8090"');
    expect(svg).toContain('fill="#1d4ed8"');
    expect(svg).toContain(">SHAR-8090</tspan>");
  });

  it("hides every note when the saved view has notes off", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { view: { panels: ["notes-off"] } });
    expect(svg).not.toContain("A user installs");
    expect(svg).not.toContain('stroke="#111111"');
  });
});
