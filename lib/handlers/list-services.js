import { SERVICES } from "../../src/services.js";

// GET /api/services -> the catalog an agent may use as a node id, so it never
// has to guess. Static per deploy, so it caches hard.
export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });
  const services = Object.entries(SERVICES).map(([id, s]) => ({ id, label: s.label, sub: s.sub }));
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return res.status(200).json({ count: services.length, services });
}
