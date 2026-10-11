// Every card whose border fights its own tile (lib/logo-color.js tileColor).
// Must print 0, like check:overlaps. --fix writes the tile colour onto them,
// snapshotting each flow into flow_versions first.
//
//   npm run check:colors          report, exit 1 on any clash
//   npm run check:colors -- --fix correct them

import "dotenv/config";
import pg from "pg";
import { tileColor, clashes } from "../lib/logo-color.js";

const FIX = process.argv.includes("--fix");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
let bad = 0;
try {
  const { rows } = await pool.query(
    "SELECT id, title, nodes, edges, pattern, description, view_state FROM flows WHERE deleted_at IS NULL ORDER BY created_at",
  );
  for (const r of rows) {
    const found = [];
    const next = await Promise.all((r.nodes || []).map(async (n) => {
      const tile = n?.icon && n.color ? await tileColor(n.icon) : null;
      if (!clashes(n?.color, tile)) return n;
      found.push(`${n.label || n.id} ${n.color} -> ${tile}`);
      return { ...n, color: tile };
    }));
    if (!found.length) continue;
    bad += found.length;
    console.log(`${r.title}\n  ${found.join("\n  ")}`);
    if (!FIX) continue;
    await pool.query(
      "INSERT INTO flow_versions (flow_id, title, nodes, edges, pattern, description, view_state, reason, kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'layout')",
      [r.id, r.title, JSON.stringify(r.nodes), JSON.stringify(r.edges), r.pattern, r.description, r.view_state, "before border matches tile"],
    );
    await pool.query("UPDATE flows SET nodes = $1::jsonb, updated_at = now() WHERE id = $2", [JSON.stringify(next), r.id]);
  }
  console.log(`${bad} border${bad === 1 ? "" : "s"} fighting ${bad === 1 ? "its" : "their"} tile${FIX && bad ? " (fixed)" : ""}`);
  if (bad && !FIX) process.exitCode = 1;
} finally {
  await pool.end();
}
