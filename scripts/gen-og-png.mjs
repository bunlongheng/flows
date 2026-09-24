// Renders public/og.png, the site card a link previews as when it has no
// design of its own. Run after changing lib/render-og.js: node scripts/gen-og-png.mjs
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { renderSiteOgSvg, OG_W } from "../lib/render-og.js";
import { fontOpts } from "../lib/resvg-fonts.js";

const png = new Resvg(renderSiteOgSvg(), { fitTo: { mode: "width", value: OG_W }, font: fontOpts() }).render().asPng();
writeFileSync(new URL("../public/og.png", import.meta.url), png);
console.log(`public/og.png ${png.length} bytes`);
