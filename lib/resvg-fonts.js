import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import fontData from "./font-data.js";

// resvg only takes font PATHS, and a serverless function has neither system
// fonts nor a readable repo. So the bytes ride along in font-data.js and get
// written to the writable tmpdir once per cold start - after that it is a
// no-op and the paths are reused.
//
// Shared by the OG card and the animated GIF: the GIF renders a dozen frames
// per request, so writing the fonts once and reusing the paths matters more
// here than it ever did for a single card.
let fontPaths = null;

export function fonts() {
  if (fontPaths) return fontPaths;
  const dir = path.join(os.tmpdir(), "sd-fonts");
  mkdirSync(dir, { recursive: true });
  fontPaths = Object.entries(fontData).map(([name, b64]) => {
    const p = path.join(dir, name);
    if (!existsSync(p)) writeFileSync(p, Buffer.from(b64, "base64"));
    return p;
  });
  return fontPaths;
}

/** The font block every Resvg call in this app uses. */
export function fontOpts() {
  return { fontFiles: fonts(), defaultFontFamily: "Roboto", loadSystemFonts: false };
}
