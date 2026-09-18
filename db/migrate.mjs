// Tiny migration runner. Applies db/migrations/*.sql in filename order, tracking
// applied files in a flows_migrations table so re-runs are safe. Uses
// an app-scoped tracking table (not the shared schema_migrations) so it never
// collides with sibling apps in the same "2026" database.
//
// Usage: node db/migrate.mjs   (reads DATABASE_URL from env)
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

async function main() {
  // No DB configured (e.g. a Vercel preview deploy, or local without .env) -
  // skip cleanly so `buildCommand: migrate && build` still succeeds. Production
  // is still fail-closed: lib/env.js throws during the build if DATABASE_URL is
  // missing on a production deploy.
  if (!process.env.DATABASE_URL) {
    console.log("migrate: DATABASE_URL not set - skipping migrations");
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS flows_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );

    // The tracking table used to be named after the old product. Copy its rows
    // across before reading the applied-set: without this every old migration
    // looks unapplied and runs again, and after the rename migration those old
    // ones target a table that no longer exists. Spelled with a string the
    // rename sweep cannot touch, and a merge rather than a RENAME so it holds
    // whether or not the new table already has rows.
    const LEGACY = ["system", "designs", "migrations"].join("_");
    const { rows: legacy } = await pool.query(
      "SELECT to_regclass($1) IS NOT NULL AS present", [`public.${LEGACY}`],
    );
    if (legacy[0].present) {
      await pool.query(
        `INSERT INTO flows_migrations (id, applied_at)
         SELECT id, applied_at FROM ${LEGACY} ON CONFLICT (id) DO NOTHING`,
      );
      await pool.query(`DROP TABLE ${LEGACY}`);
      console.log(`migrate: carried the applied-set over from ${LEGACY}`);
    }

    const { rows } = await pool.query("SELECT id FROM flows_migrations");
    const applied = new Set(rows.map((r) => r.id));

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO flows_migrations (id) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`apply ${file}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    console.log("migrations up to date");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
