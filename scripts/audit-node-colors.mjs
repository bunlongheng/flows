// Every node is drawn in ONE colour: the box tint, its border, the dotted edge
// leaving it and the dot travelling that edge. That colour must be the primary
// colour of the node's own logo - a Chrome node is Chrome blue, a terminal is
// terminal green. This checks all of them and, with --fix, corrects the rows.
//
// Why a row can be wrong: findService prefers an explicit `color` on the node
// over the one read from the logo. A row created before the logo-derived colour
// existed, or by an agent that guessed, keeps that stored colour forever and
// silently out-votes its own icon.
//
//   node scripts/audit-node-colors.mjs          report only
//   node scripts/audit-node-colors.mjs --fix    correct the mismatches
//
// Reuses src/iconColor.js and src/services.js so the audit and the app can
// never disagree about what a colour should be.

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { colorFromIcon } from "../src/iconColor.js";
import { findService } from "../src/services.js";
import { colorFromRaster, bytesOfDataUri } from "./icon-color-raster.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const FIX = process.argv.includes("--fix");

/** The dominant colour of an icon referenced by same-origin path. */
function colorFromPath(icon) {
  if (typeof icon !== "string" || !icon.startsWith("/")) return null;
  const file = path.join(PUBLIC, icon.replace(/^\/+/, "").split("?")[0]);
  if (!existsSync(file) || !file.endsWith(".svg")) return null;
  const svg = readFileSync(file, "utf8");
  // Same rule as colorFromIcon, applied to a file rather than a data URI.
  return colorFromIcon(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

/**
 * How many distinct SATURATED colours a logo uses. This decides whether the
 * logo is allowed to overrule a curated colour.
 *
 * The rule the owner stated is "if the icon has THE primary colour green, the
 * box is green" - which only holds when the logo has one. Three kinds do not:
 *   - monochrome marks (SEC EDGAR is a grey glyph, Thryv ships a black
 *     wordmark) state no brand colour at all, and forcing one makes the box
 *     black when the brand is orange.
 *   - multi-colour marks (PM2's gradient, 7 colours) have no single answer,
 *     and picking the most frequent gave purple for a blue brand.
 *   - a logo with no hex at all, drawn in currentColor.
 * In all three the stored colour is a human's decision and wins.
 */
function vividCount(icon) {
  const svg = svgTextOf(icon);
  if (!svg) return -1;
  const seen = new Set();
  for (const m of svg.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const h = m[1].toLowerCase();
    if (h === "ffffff") continue;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4), 16);
    if (Math.max(r, g, b) - Math.min(r, g, b) >= 18) seen.add(h);
  }
  return seen.size;
}

/** The SVG text behind an icon, inline or by path. */
function svgTextOf(icon) {
  if (typeof icon !== "string" || !icon) return null;
  if (icon.startsWith("data:image/svg+xml;base64,")) {
    try { return Buffer.from(icon.split(",")[1], "base64").toString("utf8"); } catch { return null; }
  }
  if (icon.startsWith("/")) {
    const f = path.join(PUBLIC, icon.replace(/^\/+/, "").split("?")[0]);
    if (existsSync(f) && f.endsWith(".svg")) return readFileSync(f, "utf8");
  }
  return null;
}

/**
 * What the logo says this node's colour should be, or null when it cannot say.
 * SVG first, then raster - 92 of 460 nodes carry a PNG or JPEG icon, and an
 * SVG-only reader called those clean while a yellow Recurly tile sat in a
 * purple box.
 */
async function truthColor(node) {
  const fromSvg = colorFromIcon(node.icon) || colorFromPath(node.icon);
  if (fromSvg) return fromSvg;
  const inline = bytesOfDataUri(node.icon);
  if (inline) { try { return await colorFromRaster(inline); } catch { return null; } }
  if (typeof node.icon === "string" && node.icon.startsWith("/")) {
    const f = path.join(PUBLIC, node.icon.replace(/^\/+/, "").split("?")[0]);
    if (existsSync(f) && !f.endsWith(".svg")) {
      try { return await colorFromRaster(readFileSync(f)); } catch { return null; }
    }
  }
  return null;
}

/** What the app actually draws today. */
function renderedColor(node) {
  return findService(node)?.color || "#6b7280";
}

const norm = (c) => (typeof c === "string" ? c.trim().toLowerCase() : c);

const rgb = (h) => {
  const x = String(h).replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
};

/**
 * Perceptual distance, 0 to ~255. The green channel is weighted heaviest
 * because the eye is most sensitive to it.
 *
 * A stored colour only gets rewritten when the difference is VISIBLE. Auth0 is
 * stored #EB5424 and its tile samples as #ed5524 - the same orange, and the
 * stored one is the exact brand hex while the sample is an average of a
 * bucket. Rewriting those is churn that makes the data slightly less accurate.
 * Recurly stored purple against a yellow tile is the case worth fixing.
 */
function perceptualDistance(a, b) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2) / 3;
}
const VISIBLE = 28;

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  try {
    const { rows } = await pool.query(
      "SELECT id, title, slug, nodes FROM flows WHERE deleted_at IS NULL ORDER BY created_at",
    );

    let checked = 0, wrong = 0, fixed = 0, noTruth = 0, closeEnough = 0;
    const report = [];
    const ambiguous = [];

    for (const row of rows) {
      const nodes = Array.isArray(row.nodes) ? row.nodes : [];
      let touched = false;
      const next = await Promise.all(nodes.map(async (n) => {
        checked++;
        const truth = await truthColor(n);
        if (!truth) { noTruth++; return n; }          // catalog key, or a logo with no colour
        const drawn = renderedColor(n);
        if (norm(drawn) === norm(truth)) return n;
        const dist = perceptualDistance(drawn, truth);
        if (dist < VISIBLE) { closeEnough++; return n; }

        // Only an unambiguous logo overrules a stored colour. See vividCount.
        // A raster icon is exempt: colorFromRaster already returns the single
        // dominant tile colour, or null when no colour covers enough of it.
        const raster = /^data:image\/(png|jpe?g|webp);/i.test(n.icon || "")
          || (typeof n.icon === "string" && n.icon.startsWith("/") && !n.icon.endsWith(".svg"));
        const vivids = raster ? 1 : vividCount(n.icon);
        if (vivids !== 1) {
          ambiguous.push({ slug: row.slug, label: n.label || n.id, drawn, truth, vivids });
          return n;
        }
        wrong++;
        report.push({ slug: row.slug, id: n.id, label: n.label || n.id, drawn, truth, stored: n.color ?? null });
        if (!FIX) return n;
        touched = true; fixed++;
        return { ...n, color: truth };
      }));
      if (touched) {
        await pool.query("UPDATE flows SET nodes = $1::jsonb, updated_at = now() WHERE id = $2",
          [JSON.stringify(next), row.id]);
      }
    }

    // ── Pass 2: one icon, one colour, exactly ────────────────────────────
    // The visible-difference threshold protects an exact brand hex from being
    // churned, but it also let two nodes of the SAME service keep two similar
    // oranges - Thryv rendered #f97316 in one diagram and #FE5100 in another,
    // and one Integry was green while the rest were blue. The owner's rule is
    // that a given logo always draws the same colour, so after the per-node
    // check every node sharing an icon is forced onto one value: the colour the
    // logo states, or failing that the one most nodes already use.
    const byIcon = new Map();
    for (const r of rows) {
      for (const n of r.nodes || []) {
        if (!n.icon) continue;
        if (!byIcon.has(n.icon)) byIcon.set(n.icon, []);
        byIcon.get(n.icon).push(n);
      }
    }
    // MAJORITY wins, not the icon-derived colour. Deriving would undo the
    // careful part above: Linode's mark samples as its darkest green and PM2's
    // gradient as purple for a blue brand, and those were deliberately left on
    // their curated hex. What is actually broken is the ODD ONE OUT - a single
    // green Integry among blue ones - so the fix is to move the minority onto
    // what the rest of the group already uses. The icon colour only decides a
    // genuine tie.
    const iconColour = new Map();
    for (const [icon, group] of byIcon) {
      const tally = new Map();
      for (const n of group) {
        const c = renderedColor(n);
        tally.set(norm(c), { c, n: (tally.get(norm(c))?.n || 0) + 1 });
      }
      const ranked = [...tally.values()].sort((a, b) => b.n - a.n);
      const tied = ranked.length > 1 && ranked[0].n === ranked[1].n;
      iconColour.set(icon, tied ? ((await truthColor(group[0])) || ranked[0].c) : ranked[0].c);
    }

    let unified = 0;
    const unifiedList = [];
    for (const r of rows) {
      let touched = false;
      const next = (r.nodes || []).map((n) => {
        if (!n.icon) return n;
        const want = iconColour.get(n.icon);
        if (!want || norm(renderedColor(n)) === norm(want)) return n;
        unified++;
        unifiedList.push({ label: n.label || n.id, from: renderedColor(n), to: want });
        if (!FIX) return n;
        touched = true;
        return { ...n, color: want };
      });
      if (touched) {
        await pool.query("UPDATE flows SET nodes = $1::jsonb, updated_at = now() WHERE id = $2",
          [JSON.stringify(next), r.id]);
      }
    }

    console.log(`  diagrams ${rows.length}   nodes ${checked}   logo states a colour for ${checked - noTruth}`);
    console.log(`  same to the eye, left as the curated hex: ${closeEnough}`);
    console.log(`  VISIBLY WRONG: ${wrong}${FIX ? `   FIXED: ${fixed}` : ""}`);
    console.log(`  SAME ICON, DIFFERENT COLOUR: ${unified}${FIX ? " (unified)" : ""}`);
    for (const u of unifiedList.slice(0, 12)) {
      console.log(`    ${String(u.label).slice(0, 26).padEnd(27)} ${u.from} -> ${u.to}`);
    }
    if (report.length) {
      console.log(`\n  ${"diagram".padEnd(34)} ${"node".padEnd(20)} ${"drawn".padEnd(9)} -> ${"logo".padEnd(9)} stored`);
      for (const r of report.slice(0, 60)) {
        console.log(`  ${String(r.slug).slice(0, 33).padEnd(34)} ${String(r.label).slice(0, 19).padEnd(20)} ${String(r.drawn).padEnd(9)} -> ${String(r.truth).padEnd(9)} ${r.stored ?? "-"}`);
      }
      if (report.length > 60) console.log(`  ... and ${report.length - 60} more`);
    }
    if (ambiguous.length) {
      console.log(`\n  LEFT ALONE - the logo is monochrome or multi-colour, so the stored colour stands (${ambiguous.length}):`);
      for (const a of ambiguous) {
        console.log(`  ${String(a.slug).slice(0, 33).padEnd(34)} ${String(a.label).slice(0, 19).padEnd(20)} keeps ${a.drawn}  (logo offered ${a.truth}, ${a.vivids} vivid colour${a.vivids === 1 ? "" : "s"})`);
      }
    }
    if (!FIX && wrong) {
      console.log("\n  Re-run with --fix to write the logo's colour onto these nodes.");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
