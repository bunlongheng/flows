import { authorizeOwner, ownerId } from "../auth-owner.js";
import { listVersions, getVersion, restoreVersion } from "../versions.js";

// GET  /api/flows/:id/versions               -> newest first, summaries only
// GET  /api/flows/:id/versions/:vid          -> one version in full (preview)
// POST /api/flows/:id/versions/:vid/restore  -> put that version back
//
// Owner session only, like PATCH and DELETE on the flow: the Bearer key can
// create and read, it cannot rewrite. The MCP server restores through
// lib/versions.js directly, as it does every other write.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function flowVersions(req, res) {
  const id = req.query?.id || null;
  const vid = req.query?.vid || null;
  if (!id || !UUID.test(id) || (vid && !UUID.test(vid))) return res.status(400).json({ error: "Invalid id" });
  if (!(await authorizeOwner(req, { allowBearer: false }))) return res.status(401).json({ error: "Unauthorized" });
  const owner = ownerId();

  if (req.method === "GET" && !vid) {
    const versions = await listVersions(id, owner, req.query.limit);
    if (!versions) return res.status(404).json({ error: "Not found" });
    return res.status(200).json({ versions });
  }
  if (req.method === "GET") {
    const version = await getVersion(id, owner, vid);
    if (!version) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(version);
  }
  if (req.method === "POST" && vid) {
    const r = await restoreVersion(id, owner, vid);
    if (!r) return res.status(404).json({ error: "Not found" });
    if (r.locked) {
      return res.status(409).json({
        error: "This diagram is locked",
        detail: "It is embedded in a README or Confluence page. Unlock it first: PATCH { locked: false }.",
        locked: true,
      });
    }
    return res.status(200).json(r);
  }
  return res.status(405).json({ error: "Method not allowed" });
}
