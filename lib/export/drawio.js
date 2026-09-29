// Flow -> .drawio (mxGraph XML). This is the Lucidchart path: Lucid ingests its
// own .lucid format ONLY through an OAuth'd import API, but its File > Import
// takes a draw.io file on any account, free ones included. The same file opens
// in draw.io, Confluence and VS Code, so one writer covers four tools.
import { buildScene } from "./scene.js";
import { SUNSET, INK } from "../../src/sunset.js";

// Node labels are the owner's own words and land inside an XML attribute.
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// A label cell is html=1, so draw.io un-escapes the attribute ONCE and then
// renders what it gets as HTML. User text therefore crosses TWO layers and has
// to be escaped for both - the HTML layer here, the XML layer by esc() at the
// call site. Escaping once would hand draw.io a live <script> from a node
// label. The two escapes happen to be the same transform, hence the alias.
const escHtml = esc;

// draw.io's style string is a SEMICOLON-separated list, so a data URI carrying
// ";base64" inside it terminates the `image=` value early and the shape renders
// blank - with no error anywhere. draw.io's own convention is to drop the
// ";base64" marker and keep the payload: "data:image/svg+xml,<base64>".
function styleUri(dataUri) {
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/s.exec(dataUri || "");
  if (!m) return null;
  return `data:${m[1]},${m[2]}`;
}

export function renderDrawio(rawNodes, rawEdges) {
  const scene = buildScene(rawNodes, rawEdges);
  const cells = [];

  for (const n of scene.nodes) {
    const uri = styleUri(n.iconDataUri);
    const stroke = n.color;
    // With a logo the card IS the logo, labelled underneath - the same read as
    // the canvas card. Without one it falls back to a plain labelled box rather
    // than an empty frame.
    const style = uri
      ? `shape=image;image=${uri};imageAspect=1;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;strokeColor=${stroke};html=1;${n.sunset ? "opacity=50;" : ""}`
      : `rounded=0;whiteSpace=wrap;html=1;strokeColor=${stroke};fillColor=${n.sunset ? SUNSET.tint : "#ffffff"};`;

    // The break is <br>, not a newline: this is HTML, where a newline collapses
    // to a space and the sub ends up running on from the label ("CloudFront CDN").
    // The value attribute holds MARKUP, and markup inside an XML attribute is
    // escaped like everything else - a raw "<b>" leaves a bare ">" in the
    // attribute, which tears the cell in half for any parser reading to the
    // first ">". So the tags escape once, the text inside them twice.
    const html = n.sub
      ? `<b>${escHtml(n.label)}</b><br><font color="${n.sunset ? SUNSET.ink : "#6b7280"}">${escHtml(n.sub)}</font>`
      : `<b>${escHtml(n.label)}</b>`;

    cells.push(
      `<mxCell id="${esc(n.id)}" value="${esc(html)}" style="${esc(style)}" vertex="1" parent="1">` +
      `<mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`,
    );

    if (n.sunset) {
      // Silver alone does not survive every importer's palette mapping, so the
      // red X rides as its own shape - the same signal the canvas gives.
      const s = Math.round(Math.min(n.w, n.h) * 0.4);
      cells.push(
        `<mxCell id="x-${esc(n.id)}" value="" style="shape=cross;strokeColor=${SUNSET.x};fillColor=${SUNSET.x};html=1;direction=north;" vertex="1" parent="1">` +
        `<mxGeometry x="${Math.round(n.x + (n.w - s) / 2)}" y="${Math.round(n.y + (n.h - s) / 2 - 20)}" width="${s}" height="${s}" as="geometry"/></mxCell>`,
      );
    }
  }

  scene.edges.forEach((e, i) => {
    const stroke = e.sunset ? SUNSET.border : INK;
    // No waypoints: draw.io and Lucid both re-route an edge on import, and a
    // hand-computed path only fights them.
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=${stroke};${e.sunset ? "dashed=1;" : ""}`;
    cells.push(
      `<mxCell id="edge-${i}" value="${esc(escHtml(e.label))}" style="${esc(style)}" edge="1" parent="1" source="${esc(e.source)}" target="${esc(e.target)}">` +
      `<mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  });

  return `<mxfile host="flows-bheng.vercel.app" type="device">` +
    `<diagram name="Flow" id="flow">` +
    `<mxGraphModel dx="1200" dy="800" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}</root>` +
    `</mxGraphModel></diagram></mxfile>`;
}
