// Flow -> .excalidraw. Every card becomes a grouped rectangle + logo + label +
// sub, every edge a real arrow BOUND to both cards, so dragging a card in
// Excalidraw keeps the diagram wired. Logos ride along base64 in `files`, so the
// file still draws years later, offline, with no call back to this app.
import { createHash } from "node:crypto";
import { buildScene, wrapText } from "./scene.js";
import { SUNSET, INK } from "../../src/sunset.js";

const SOURCE = "https://flows-bheng.vercel.app";

// Deterministic stand-ins for Excalidraw's random seeds: the same flow exported
// twice is the same bytes, which is what makes this testable.
const hash = (s) => createHash("sha1").update(String(s)).digest("hex");
const seedOf = (s) => parseInt(hash(s).slice(0, 8), 16);

// Blend a #hex toward white. Excalidraw has no alpha on backgroundColor, so the
// card's 8% tint (AwsNode.jsx:219) has to be baked into an opaque colour.
function tint(hex, a = 0.08) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c * a + 255 * (1 - a));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

// Excalidraw drops any element missing one of these, silently and with no
// error - so every element is built through here.
function el(type, id, props) {
  return {
    id, type, x: 0, y: 0, width: 0, height: 0, angle: 0,
    strokeColor: INK, backgroundColor: "transparent", fillStyle: "solid",
    strokeWidth: 1, strokeStyle: "solid",
    // roughness 0 is the whole difference between an architecture diagram and a
    // sketch. Never raise it.
    roughness: 0, opacity: 100,
    groupIds: [], frameId: null, roundness: null,
    seed: seedOf(id), version: 1, versionNonce: seedOf(`${id}:nonce`),
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
    ...props,
  };
}

function text(id, t, props) {
  return el("text", id, {
    text: t, originalText: t, fontFamily: 2, textAlign: "center", verticalAlign: "top",
    containerId: null, lineHeight: 1.25, autoResize: true, baseline: props.fontSize || 16,
    ...props,
  });
}

export function renderExcalidraw(rawNodes, rawEdges) {
  const scene = buildScene(rawNodes, rawEdges);
  const elements = [];
  const files = {};

  for (const n of scene.nodes) {
    const gid = `g-${n.id}`;
    const rectId = `r-${n.id}`;
    const ink = n.sunset ? SUNSET.ink : INK;
    const bound = [];

    // The icon sits in the upper block; the two text lines share the bottom.
    const box = Math.max(24, Math.min(n.w - 48, n.h - 76));
    const iconY = n.y + Math.round((n.h - 60 - box) / 2) + 6;

    // The card goes in first: Excalidraw z-orders by array index, so anything
    // pushed after this paints on top of it.
    // The card as the format panel left it. Excalidraw has its own vocabulary
    // for two of these: a rounded corner is `roundness`, not a radius in px,
    // and a dash is a named strokeStyle rather than a dasharray - so the panel's
    // values are translated, never passed through.
    const st = n.style || {};
    elements.push(el("rectangle", rectId, {
      x: n.x, y: n.y, width: n.w, height: n.h,
      strokeColor: n.color,
      backgroundColor: n.sunset ? SUNSET.tint : st.bg ? st.bg : tint(n.color),
      strokeWidth: st.bw || 1,
      strokeStyle: st.bs || "solid",
      roundness: st.radius ? { type: 3 } : null,
      opacity: st.opacity == null ? 100 : st.opacity,
      groupIds: [gid], boundElements: bound,
    }));

    if (n.iconDataUri) {
      const fileId = hash(n.iconDataUri);
      if (!files[fileId]) {
        const mime = /^data:([^;,]+)/.exec(n.iconDataUri);
        files[fileId] = {
          mimeType: mime ? mime[1] : "image/svg+xml",
          id: fileId,
          dataURL: n.iconDataUri,
          created: 1,
          lastRetrieved: 1,
        };
      }
      elements.push(el("image", `i-${n.id}`, {
        x: n.x + Math.round((n.w - box) / 2), y: iconY, width: box, height: box,
        groupIds: [gid], fileId, status: "saved", scale: [1, 1], crop: null,
        // Excalidraw cannot greyscale an image, so a decommissioned logo is
        // dimmed instead and the red X below carries the rest of the meaning.
        opacity: n.sunset ? 40 : st.opacity == null ? 100 : st.opacity,
      }));
    }

    // Excalidraw ships 3 font families by number: 1 hand-drawn, 2 Helvetica,
    // 3 Cascadia. The panel's sans and serif both land on 2 - Excalidraw has no
    // serif, and falling back to the hand-drawn face would turn an architecture
    // diagram into a sketch, which is the one thing this writer never does.
    const fontFamily = st.font === "mono" ? 3 : 2;
    const textAlign = st.align || "center";
    // A text element that resizes to its content has nothing to align INSIDE,
    // so an alignment is only real once the box is pinned to the card width.
    const alignable = st.align ? { autoResize: false } : {};
    const size = st.fs ? Math.round(st.fs * 1.33) : 16;
    elements.push(text(`t-${n.id}`, n.label, {
      x: n.x + 8, y: n.y + n.h - 50, width: n.w - 16, height: 20,
      fontSize: size, fontFamily, textAlign, opacity: st.opacity == null ? 100 : st.opacity,
      strokeColor: ink, groupIds: [gid], ...alignable,
    }));
    if (n.sub) {
      elements.push(text(`s-${n.id}`, n.sub, {
        x: n.x + 8, y: n.y + n.h - 28, width: n.w - 16, height: 16,
        fontSize: Math.round(size * 0.75), fontFamily, textAlign,
        opacity: st.opacity == null ? 100 : st.opacity,
        strokeColor: n.sunset ? SUNSET.ink : "#6b7280", groupIds: [gid], ...alignable,
      }));
    }

    // Everything the card hangs below it, in canvas order: the i badge's info as
    // a muted line, then the note in its own bordered box - the same box the
    // canvas draws (AwsNode.jsx:40). Both sit OUTSIDE the group: either one can
    // be taller than the gap to the next row, and grouping would make every drag
    // move a block the owner did not mean to move.
    let below = n.y + n.h + 6;
    if (n.info) {
      // ~5.6px per character is Helvetica at 10px, so this many fit the card.
      const lines = wrapText(n.info, Math.max(12, Math.floor(n.w / 5.6)));
      elements.push(text(`n-${n.id}`, lines.join("\n"), {
        x: n.x, y: below, width: n.w, height: lines.length * 13,
        fontSize: 10, strokeColor: "#9ca3af", autoResize: false,
      }));
      below += lines.length * 13 + 6;
    }
    if (n.note) {
      // 6px of padding each side (NOTE_BOX), so the text measures against the
      // inner width. 14px a line is the canvas's 10px x 1.4 line height.
      const lines = wrapText(n.note, Math.max(10, Math.floor((n.w - 14) / 5.2)));
      const h = lines.length * 14 + 8;
      elements.push(el("rectangle", `nb-${n.id}`, {
        x: n.x, y: below, width: n.w, height: h,
        strokeColor: "#111111", backgroundColor: "#ffffff",
      }));
      elements.push(text(`nt-${n.id}`, lines.join("\n"), {
        x: n.x + 6, y: below + 4, width: n.w - 12, height: lines.length * 14,
        fontSize: 10, textAlign: "left", strokeColor: "#111111",
        lineHeight: 1.4, autoResize: false,
      }));
    }

    if (n.sunset) {
      const cx = n.x + n.w / 2, cy = iconY + box / 2, r = box / 3;
      for (const [k, dx] of [["a", 1], ["b", -1]]) {
        elements.push(el("line", `x${k}-${n.id}`, {
          x: cx - r * dx, y: cy - r, width: r * 2, height: r * 2,
          points: [[0, 0], [r * 2 * dx, r * 2]],
          lastCommittedPoint: null, strokeColor: SUNSET.x, strokeWidth: 2, groupIds: [gid],
        }));
      }
    }
  }

  const rectOf = Object.fromEntries(elements.filter((e) => e.type === "rectangle").map((e) => [e.id, e]));

  scene.edges.forEach((e, i) => {
    const a = scene.nodes.find((n) => n.id === e.source);
    const b = scene.nodes.find((n) => n.id === e.target);
    const id = `e-${i}-${e.source}-${e.target}`;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const es = e.style || {};
    const stroke = e.sunset ? SUNSET.border : es.stroke || INK;

    const arrow = el("arrow", id, {
      x: ax, y: ay, width: Math.abs(bx - ax), height: Math.abs(by - ay),
      strokeColor: stroke, points: [[0, 0], [bx - ax, by - ay]], lastCommittedPoint: null,
      strokeWidth: es.bw || 1,
      strokeStyle: es.bs || "solid",
      opacity: es.opacity == null ? 100 : es.opacity,
      // focus 0 + a small gap lets Excalidraw route the line itself, which is
      // why none of the canvas's own attach-point maths is reproduced here.
      startBinding: { elementId: `r-${e.source}`, focus: 0, gap: 4 },
      endBinding: { elementId: `r-${e.target}`, focus: 0, gap: 4 },
      startArrowhead: null, endArrowhead: "arrow",
      // Excalidraw has the same 3: an elbow arrow, a rounded one and a sharp
      // straight one. "step" is the canvas default, so it maps to the elbow.
      elbowed: (es.arrow || "step") === "step",
      roundness: es.arrow === "curved" ? { type: 2 } : null,
      boundElements: null,
    });

    for (const rid of [`r-${e.source}`, `r-${e.target}`]) {
      rectOf[rid].boundElements.push({ id, type: "arrow" });
    }

    if (e.label) {
      const tid = `el-${i}`;
      arrow.boundElements = [{ id: tid, type: "text" }];
      elements.push(arrow);
      // The box has to fit the words. A fixed width clipped every label longer
      // than a few characters - "cache miss / route" came out as "ache miss /
      // route", chopped at BOTH ends because the text is centred in the box.
      // ~6.2px per character is Helvetica at 12px.
      const lw = Math.ceil(e.label.length * 6.2) + 8;
      elements.push(text(tid, e.label, {
        x: (ax + bx) / 2 - lw / 2, y: (ay + by) / 2 - 8, width: lw, height: 16,
        fontSize: 12, strokeColor: stroke, containerId: id, verticalAlign: "middle",
      }));
      return;
    }
    elements.push(arrow);
  });

  return {
    type: "excalidraw",
    version: 2,
    source: SOURCE,
    elements,
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files,
  };
}
