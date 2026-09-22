// Regenerate favicon.ico from the real brand mark (public/icon-512.png) and build
// a 1200x630 OG/Twitter share card. Run: node scripts/gen-icons.mjs
// Uses sharp from ~/Sites/bheng (not a repo dep) - dev-only asset generation.
import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(process.env.HOME + "/Sites/bheng/node_modules/sharp");
const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const SRC = join(pub, "icon-512.png");

// --- favicon.ico (PNG-in-ICO, sizes 16/32/48 - modern-browser compatible) ---
async function buildIco() {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((s) => sharp(SRC).resize(s, s).png().toBuffer())
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(sizes.length, 4); // image count
  const entries = [];
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);   // width
    e.writeUInt8(s >= 256 ? 0 : s, 1);   // height
    e.writeUInt8(0, 2);                  // palette
    e.writeUInt8(0, 3);                  // reserved
    e.writeUInt16LE(1, 4);               // color planes
    e.writeUInt16LE(32, 6);              // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);  // size of image data
    e.writeUInt32LE(offset, 12);         // offset
    offset += pngs[i].length;
    entries.push(e);
  });
  writeFileSync(join(pub, "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
  console.log("wrote favicon.ico (16/32/48 from icon-512.png)");
}

// --- OG / Twitter share card (1200x630, matches the live sign-in look) ---
async function buildOg() {
  const W = 1200, H = 630, TILE = 220;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="g" cx="50%" cy="0%" r="120%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="55%" stop-color="#f1f4f9"/>
        <stop offset="100%" stop-color="#e7ecf5"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="${W / 2}" y="440" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
      font-size="64" font-weight="800" letter-spacing="-2" fill="#111827">Flows</text>
    <text x="${W / 2}" y="492" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
      font-size="27" font-weight="500" fill="#6b7280">AWS &amp; GCP architecture diagrams</text>
  </svg>`);
  const tile = await sharp(SRC).resize(TILE, TILE).png().toBuffer();
  await sharp(bg)
    .composite([{ input: tile, top: 120, left: Math.round((W - TILE) / 2) }])
    .png()
    .toFile(join(pub, "og.png"));
  console.log("wrote og.png (1200x630 share card)");
}

await buildIco();
await buildOg();
