// No 2 lines on 1 track (owner rule 2026-10-09: "NEVER let lines overlap").
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
import { findOverlaps } from "../lib/overlaps.js";

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
  const svg = renderDiagramSvg(r.nodes || [], r.edges || [], { viewState: r.view_state });
  const hits = findOverlaps(svg);
  if (!hits.length) continue;
  bad++;
  console.log(`${r.id}  ${r.title}`);
  for (const h of hits) console.log(`  lines ${h.a + 1} and ${h.b + 1} share ${h.len} px`);
}
console.log(`${rows.length} flows, ${bad} with overlapping lines`);
process.exit(bad ? 1 : 0);
