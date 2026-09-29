// Flow -> .drawio (mxGraph XML). This is the Lucidchart path: Lucid ingests its
// own .lucid format ONLY through an OAuth'd import API, but its File > Import
// takes a draw.io file on any account, free ones included. The same file opens
// in draw.io, Confluence and VS Code, so one writer covers four tools.
import { buildScene, wrapText } from "./scene.js";
import { SUNSET, INK } from "../../src/sunset.js";
import { dashArray } from "../../src/style.js";

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
    // The card as the format panel left it. draw.io spells a dash as its own
    // dashed/dashPattern pair rather than an SVG dasharray, and a rounded
    // corner as rounded=1 with arcSize as a PERCENTAGE of the shorter side -
    // so the panel's px radius is converted, never passed through.
    const st = n.style || {};
    const extra =
      (st.bw ? `strokeWidth=${st.bw};` : "") +
      (st.bs && st.bs !== "solid" ? `dashed=1;dashPattern=${dashArray(st.bs, st.bw || 1)};` : "") +
      (st.opacity == null ? "" : `opacity=${st.opacity};`) +
      (st.font === "mono" ? "fontFamily=Courier New;" : st.font === "serif" ? "fontFamily=Georgia;" : "") +
      (st.fs ? `fontSize=${st.fs};` : "") +
      (st.align ? `align=${st.align};` : "");
    // A logo card is draw.io's image shape, which paints its own backdrop with
    // imageBackground rather than fillColor - and has no corner radius at all,
    // so a rounded card imports square there. The alternative is dropping the
    // logo to get the corner, which is a worse trade in a diagram whose whole
    // point is the logos.
    const bg = st.bg && st.bg !== "transparent" ? st.bg : null;
    const style = uri
      ? `shape=image;image=${uri};imageAspect=1;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=none;whiteSpace=wrap;strokeColor=${stroke};html=1;imageBorder=${stroke};${bg ? `imageBackground=${bg};` : ""}${n.sunset ? "opacity=50;" : ""}${extra}`
      : `rounded=${st.radius ? 1 : 0};${st.radius ? `arcSize=${Math.round((st.radius / Math.min(n.w, n.h)) * 200)};` : ""}whiteSpace=wrap;html=1;strokeColor=${stroke};fillColor=${n.sunset ? SUNSET.tint : bg || "#ffffff"};${extra}`;

    // The break is <br>, not a newline: this is HTML, where a newline collapses
    // to a space and the sub ends up running on from the label ("CloudFront CDN").
    // The value attribute holds MARKUP, and markup inside an XML attribute is
    // escaped like everything else - a raw "<b>" leaves a bare ">" in the
    // attribute, which tears the cell in half for any parser reading to the
    // first ">". So the tags escape once, the text inside them twice.
    // The i badge does not survive an export, so what it hid becomes a third
    // line under the card - smaller and greyer than the sub, so the card still
    // reads label-first at a glance.
    const parts = [`<b>${escHtml(n.label)}</b>`];
    if (n.sub) parts.push(`<font color="${n.sunset ? SUNSET.ink : "#6b7280"}">${escHtml(n.sub)}</font>`);
    if (n.info) parts.push(`<font color="#9ca3af" style="font-size:9px">${escHtml(n.info)}</font>`);
    const html = parts.join("<br>");

    cells.push(
      `<mxCell id="${esc(n.id)}" value="${esc(html)}" style="${esc(style)}" vertex="1" parent="1">` +
      `<mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`,
    );

    // The note hangs under the card on the canvas in its own bordered box, so it
    // lands here as its own vertex rather than a fourth label line - it is a
    // paragraph, and a paragraph inside a 180px shape squashes the logo out of
    // it. draw.io wraps the text itself; the height is estimated the same way
    // the Excalidraw writer measures, so the boxes do not collide on import.
    if (n.note) {
      const h = wrapText(n.note, Math.max(10, Math.floor((n.w - 14) / 5.2))).length * 14 + 8;
      // verticalLabelPosition=bottom hangs the card's OWN label under the shape,
      // so a note parked at the shape's bottom edge lands on top of it and the
      // card loses its name. Clear the lines the label is about to take.
      const labelLines = 1 + (n.sub ? 1 : 0) + (n.info ? wrapText(n.info, Math.max(12, Math.floor(n.w / 5.6))).length : 0);
      cells.push(
        `<mxCell id="nt-${esc(n.id)}" value="${esc(escHtml(n.note))}" ` +
        `style="rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;fillColor=#ffffff;align=left;verticalAlign=top;fontSize=10;spacing=3;" vertex="1" parent="1">` +
        `<mxGeometry x="${n.x}" y="${n.y + n.h + 10 + labelLines * Math.max(16, Math.round((st.fs || 12) * 1.4))}" width="${n.w}" height="${h}" as="geometry"/></mxCell>`,
      );
    }

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
    const es = e.style || {};
    const stroke = e.sunset ? SUNSET.border : es.stroke || INK;
    // No waypoints: draw.io and Lucid both re-route an edge on import, and a
    // hand-computed path only fights them.
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=${stroke};${e.sunset ? "dashed=1;" : ""}` +
      (es.bw ? `strokeWidth=${es.bw};` : "") +
      (es.bs && es.bs !== "solid" ? `dashed=1;dashPattern=${dashArray(es.bs, es.bw || 1)};` : "") +
      (es.opacity == null ? "" : `opacity=${es.opacity};`);
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
