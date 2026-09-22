// One service, one logo - everywhere.
//
// A node may bring its own icon, and that flexibility quietly wrecked the
// diagrams: Thryv ended up with 5 different logos across 17 nodes, UBS with 5
// (one of them Thryv's, so it rendered the wrong company), and a dozen services
// sat on 1KB rasters that go soft the moment they are drawn at 46px.
//
// The cause is precedence. findService checks the node's own `icon` FIRST, so
// whatever an agent happened to paste beats the crisp file already in
// public/brand. This picks ONE canonical icon per service and points every node
// at it, preferring, in order:
//
//   1. a bucket path (/brand/*, /icons/*)  - versioned, crisp, shared
//   2. an inline SVG                        - resolution independent
//   3. the LARGEST raster                   - least bad of what we have
//
//   node scripts/audit-icons.mjs          report only
//   node scripts/audit-icons.mjs --fix    point every node at the canonical one
//
// A service whose best available icon is still a small raster is reported as
// NEEDS A REAL LOGO rather than quietly blessed - that is a human's job, and
// pretending otherwise is how the blurry ones survived this long.

import "dotenv/config";
import pg from "pg";

const FIX = process.argv.includes("--fix");
const SMALL_RASTER = 4000; // bytes; below this a logo is visibly soft at 46px

/** Group by the first two words of the label, so "Recurly v3 API" and
 *  "Recurly v2 XML API" are one service, but "Tray - Service router" and
 *  "Tray - Marketplace" stay distinct enough to keep their own art. */
const identity = (n) =>
  String(n.label || n.id || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").slice(0, 2).join(" ");

function describe(icon) {
  if (!icon) return { kind: "none", rank: 0, bytes: 0 };
  if (icon.startsWith("/")) return { kind: "bucket", rank: 3, bytes: Infinity };
  if (icon.startsWith("data:image/svg")) return { kind: "inline svg", rank: 2, bytes: Infinity };
  const bytes = Math.round(icon.length * 0.75);
  return { kind: `raster ${Math.round(bytes / 1024)}KB`, rank: 1, bytes };
}

/**
 * A bucket path is only trustworthy if the FILE is actually this service.
 *
 * UBS had /brand/thryv-bc.svg stored on it, so "prefer the bucket" would have
 * locked all 5 UBS nodes to Thryv's logo forever - a wrong-company bug baked in
 * by the very tool meant to fix the icons. A bucket path is accepted only when
 * its filename shares a word with the service name; otherwise it is discarded
 * and the service falls through to its next best icon.
 */
function bucketMatchesService(icon, service) {
  const file = icon.split("/").pop().replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  const fileWords = file.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const svcWords = service.split(" ").filter((w) => w.length > 2);
  if (!fileWords.length || !svcWords.length) return false;
  return svcWords.some((s) => fileWords.some((f) => f === s || f.startsWith(s) || s.startsWith(f)));
}

/** The best icon among everything this service is currently using. */
function canonical(icons, service) {
  const scored = icons
    .map((i) => ({ icon: i, ...describe(i) }))
    .filter((c) => c.kind !== "bucket" || bucketMatchesService(c.icon, service));
  if (!scored.length) return null;
  return scored.sort((a, b) => b.rank - a.rank || b.bytes - a.bytes)[0];
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
  try {
    const { rows } = await pool.query(
      "SELECT id, slug, nodes FROM flows WHERE deleted_at IS NULL ORDER BY created_at",
    );

    // Pass 1: what does each service currently use?
    const use = new Map();
    for (const r of rows) {
      for (const n of r.nodes || []) {
        const k = identity(n);
        if (!k || !n.icon) continue;
        if (!use.has(k)) use.set(k, new Set());
        use.get(k).add(n.icon);
      }
    }

    const chosen = new Map();
    const inconsistent = [], needsLogo = [];
    for (const [k, set] of use) {
      const best = canonical([...set], k);
      if (!best) continue;   // every candidate was another service's logo
      chosen.set(k, best.icon);
      if (set.size > 1) inconsistent.push({ k, count: set.size, kind: best.kind });
      if (best.rank === 1 && best.bytes < SMALL_RASTER) needsLogo.push({ k, kind: best.kind });
    }

    // Pass 2: point every node at the chosen one.
    let changed = 0, touchedRows = 0;
    for (const r of rows) {
      let touched = false;
      const next = (r.nodes || []).map((n) => {
        const k = identity(n);
        const want = chosen.get(k);
        if (!want || !n.icon || n.icon === want) return n;
        changed++; touched = true;
        return { ...n, icon: want };
      });
      if (touched && FIX) {
        touchedRows++;
        await pool.query("UPDATE flows SET nodes = $1::jsonb, updated_at = now() WHERE id = $2",
          [JSON.stringify(next), r.id]);
      }
    }

    console.log(`  diagrams ${rows.length}   services carrying an icon ${use.size}`);
    console.log(`  INCONSISTENT (same service, different logos): ${inconsistent.length}`);
    console.log(`  nodes ${FIX ? "repointed" : "that would be repointed"}: ${changed}${FIX ? `   rows written: ${touchedRows}` : ""}`);

    if (inconsistent.length) {
      console.log("\n  service                 logos  canonical");
      for (const i of inconsistent.sort((a, b) => b.count - a.count)) {
        console.log(`  ${i.k.padEnd(23)} ${String(i.count).padStart(5)}  ${i.kind}`);
      }
    }
    if (needsLogo.length) {
      console.log(`\n  NEEDS A REAL LOGO - the best we hold is still soft at 46px (${needsLogo.length}):`);
      for (const n of needsLogo) console.log(`  ${n.k.padEnd(23)} ${n.kind}`);
      console.log("\n  Drop a crisp SVG in public/brand/<name>.svg and add a services.js entry;");
      console.log("  it then becomes the canonical icon for every node of that service.");
    }
    if (!FIX && changed) console.log("\n  Re-run with --fix to apply.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
