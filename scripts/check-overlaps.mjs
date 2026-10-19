// No 2 lines on 1 track and no tag on a tag (owner rule 2026-10-09: "NEVER let
// lines overlap", "dont allow overlap tags").
// Lines are routed when a diagram draws, never stored, so a routing fix reaches
// every row at once. This renders every live flow the way the export does and
// lists any pair of lines still lying on top of each other: a routing
// regression, or a layout too tight to hold 2 tracks (move the cards apart).
//
//   set -a; source .env; set +a; node scripts/check-overlaps.mjs
//
// Exits 1 when anything overlaps.
import pg from "pg";
import { renderDiagramSvg } from "../lib/render-svg.js";
import { findOverlaps, findTagOverlaps } from "../lib/overlaps.js";
import { levelsOf } from "../src/view-state.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
const { rows } = await pool.query(
  "SELECT id, title, nodes, edges, view_state FROM flows WHERE deleted_at IS NULL ORDER BY created_at",
);
await pool.end();

let bad = 0;
for (const r of rows) {
  // A C1..C4 diagram is drawn once per level, each with its own auto layout,
  // so every level is a diagram of its own here.
  const lv = levelsOf(r.nodes || []);
  const views = lv.length >= 2 ? lv.map((level) => ({ level, tag: ` C${level}` })) : [{ level: undefined, tag: "" }];
  const found = [];
  for (const { level, tag } of views) {
    const hits = findOverlaps(renderDiagramSvg(r.nodes || [], r.edges || [], { view: r.view_state, level }));
    // Tags with the Steps chips on, the widest a badge gets.
    const tags = findTagOverlaps(renderDiagramSvg(r.nodes || [], r.edges || [], { view: { ...(r.view_state || {}), panels: [...(r.view_state?.panels || []), "steps"] }, level }));
    for (const h of hits) found.push(`  lines ${h.a + 1} and ${h.b + 1} share ${h.len} px${tag}`);
    for (const t of tags) found.push(`  tags ${t.a + 1} and ${t.b + 1} overlap${tag}`);
  }
  if (!found.length) continue;
  bad++;
  console.log(`${r.id}  ${r.title}`);
  for (const line of found) console.log(line);
}
console.log(`${rows.length} flows, ${bad} with overlapping lines or tags`);
process.exit(bad ? 1 : 0);
