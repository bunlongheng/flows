import { verifySession, readCookie } from "../auth-session.js";
import { isLocal } from "../is-local.js";

// GET /api/auth/me -> { authenticated, email? } from the signed session cookie.
//
// A local request needs no cookie. Every owner-gated route already accepts it
// (authorizeOwner takes isLocal first), so answering "not signed in" here only
// made the app show a sign-in form it did not need: the owner clicked through
// Google to reach an API that was open to them all along. isLocal is the same
// peer-socket check as everywhere else and is off on Vercel, so this says
// nothing new about who may write - it just stops lying to the UI.
export default async function authMe(req, res) {
  const s = verifySession(readCookie(req, "sd_session"));
  const OWNER = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (OWNER && isLocal(req)) {
    return res.status(200).json({ authenticated: true, email: OWNER, local: true });
  }
  if (s && OWNER && s.email && s.email.toLowerCase() === OWNER) {
    return res.status(200).json({ authenticated: true, email: s.email });
  }
  return res.status(200).json({ authenticated: false });
}
