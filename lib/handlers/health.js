import db from "../db.js";

// Liveness + readiness probe for the prod monitor and post-deploy smoke test.
// Verifies the two things that actually break the artifact API: the Bearer
// secret + owner id being configured, and DB reachability. 503 if anything is
// wrong so a monitor goes RED. Mirrors diagrams' app/api/health/route.ts.
export default async function health(req, res) {
  const checks = {
    api_secret: Boolean(process.env.FLOWS_API_SECRET?.trim()),
    owner_user_id: Boolean(process.env.OWNER_USER_ID?.trim()),
    google_oauth: Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()),
    auth_secret: Boolean(process.env.AUTH_SECRET?.trim()),
    owner_email: Boolean(process.env.OWNER_EMAIL?.trim()),
    database: false,
  };

  try {
    await db.query("SELECT 1");
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const ok = Object.values(checks).every(Boolean);
  return res.status(ok ? 200 : 503).json({ ok, checks });
}
