// Fail-fast validation of the env vars the API needs in production. Imported by
// next.config.mjs so a misconfigured PRODUCTION build throws and FAILS the Vercel
// deploy instead of silently shipping a dead API. Mirrors diagrams' lib/env.ts.
//
// Only enforced on real production builds (VERCEL_ENV==="production"). Local dev,
// CI, and Vercel preview deploys are intentionally lenient.

const REQUIRED_IN_PRODUCTION = [
  "FLOWS_API_SECRET",
  "DATABASE_URL",
  "OWNER_USER_ID",
  // Google owner sign-in (gates the AI generate feature in prod).
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AUTH_SECRET",
  "OWNER_EMAIL",
];

export function validateEnv() {
  if (process.env.VERCEL_ENV !== "production") return;

  // The dev auth bypass must never be enabled in production - it would open the
  // admin-only routes. Fail the build rather than ship that foot-gun.
  if (process.env.LOCAL_DEV === "true") {
    throw new Error("[env] LOCAL_DEV must not be set in production - it enables the dev auth bypass.");
  }

  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required production env var(s): ${missing.join(", ")}. ` +
        `Set them in Vercel (Production) before deploying - the artifact API will not work without these.`,
    );
  }
}

validateEnv();
