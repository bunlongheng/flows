// Ported from vercel.json. Next serves the UI and the API from ONE process, so
// the Express server (serve.mjs) and the two-process dev wrapper are gone.
// The CSP lives in middleware.js - it needs a per-request nonce.
/** @type {import('next').NextConfig} */
import { readFileSync } from "node:fs";
// Fail-fast prod env check. It self-runs on import; this used to hang off
// vite.config.js, which the Next port deleted, so nothing ran it for a day.
import "./lib/env.js";
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // resvg is a native module - it must not be bundled into the server chunk.
  serverExternalPackages: ["@resvg/resvg-js", "pg"],
  // The app was renamed from "system-design" to "flows" and the public API moved
  // with it. These keep every previously documented URL working. 308 (not 301)
  // so POST/PATCH/DELETE keep their method and body through the redirect.
  async redirects() {
    return [
      { source: "/api/ai/system-designs", destination: "/api/ai/flows", permanent: true },
      { source: "/api/ai/system-designs/:path*", destination: "/api/ai/flows/:path*", permanent: true },
      { source: "/api/system-designs", destination: "/api/flows", permanent: true },
      { source: "/api/system-designs/:path*", destination: "/api/flows/:path*", permanent: true },
    ];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Robots-Tag", value: "index, follow" },
      ],
    }];
  },
};
