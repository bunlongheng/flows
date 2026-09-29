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
    elements.push(el("rectangle", rectId, {
      x: n.x, y: n.y, width: n.w, height: n.h,
      strokeColor: n.color, backgroundColor: n.sunset ? SUNSET.tint : tint(n.color),
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
        opacity: n.sunset ? 40 : 100,
      }));
    }

    elements.push(text(`t-${n.id}`, n.label, {
      x: n.x + 8, y: n.y + n.h - 50, width: n.w - 16, height: 20,
      fontSize: 16, strokeColor: ink, groupIds: [gid],
    }));
    if (n.sub) {
      elements.push(text(`s-${n.id}`, n.sub, {
        x: n.x + 8, y: n.y + n.h - 28, width: n.w - 16, height: 16,
        fontSize: 12, strokeColor: n.sunset ? SUNSET.ink : "#6b7280", groupIds: [gid],
      }));
    }

    // The i badge does not exist here, so what it hid is drawn under the card
    // in muted 10px. It sits OUTSIDE the group: the info belongs to the card but
    // a long one is taller than the gap to the next row, and grouping it would
    // make every drag move a block the owner did not mean to move.
    if (n.info) {
      // ~5.6px per character is Helvetica at 10px, so this many fit the card.
      const lines = wrapText(n.info, Math.max(12, Math.floor(n.w / 5.6)));
      elements.push(text(`n-${n.id}`, lines.join("\n"), {
        x: n.x, y: n.y + n.h + 6, width: n.w, height: lines.length * 13,
        fontSize: 10, strokeColor: "#9ca3af", autoResize: false,
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
    const stroke = e.sunset ? SUNSET.border : INK;

    const arrow = el("arrow", id, {
      x: ax, y: ay, width: Math.abs(bx - ax), height: Math.abs(by - ay),
      strokeColor: stroke, points: [[0, 0], [bx - ax, by - ay]], lastCommittedPoint: null,
      // focus 0 + a small gap lets Excalidraw route the line itself, which is
      // why none of the canvas's own attach-point maths is reproduced here.
      startBinding: { elementId: `r-${e.source}`, focus: 0, gap: 4 },
      endBinding: { elementId: `r-${e.target}`, focus: 0, gap: 4 },
      startArrowhead: null, endArrowhead: "arrow", elbowed: false,
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
