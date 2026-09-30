import db from "./db.js";

// The history behind a flow. The rows are written by the flow_versions_keep
// trigger (db/migrations/20260926000000_flow_versions.sql) on every content or
// layout change, so this file only ever reads them, and restores one.
//
// Every function takes the owner's user id and answers null when the flow is
// not theirs, is in trash, or the version is not the flow's - callers turn that
// into a 404 and never learn which.

const SUMMARY = `id, kind, reason, saved_at, title,
  jsonb_array_length(COALESCE(nodes, '[]'::jsonb)) AS node_count,
  jsonb_array_length(COALESCE(edges, '[]'::jsonb)) AS edge_count`;

async function owned(flowId, owner) {
  const { rows } = await db.query(
    "SELECT id, locked, edit_locked FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [flowId, owner],
  );
  return rows[0] || null;
}

// Newest first. A summary per version: when, what kind, why, and how big.
export async function listVersions(flowId, owner, limit = 50) {
  if (!(await owned(flowId, owner))) return null;
  const { rows } = await db.query(
    `SELECT ${SUMMARY} FROM flow_versions WHERE flow_id = $1 ORDER BY saved_at DESC LIMIT $2`,
    [flowId, Math.min(50, Math.max(1, Number(limit) || 50))],
  );
  return rows;
}

// One version in full - the nodes and edges a canvas can draw as a preview.
export async function getVersion(flowId, owner, versionId) {
  if (!(await owned(flowId, owner))) return null;
  const { rows } = await db.query(
    `SELECT ${SUMMARY}, nodes, edges, pattern, description, view_state
       FROM flow_versions WHERE id = $1 AND flow_id = $2`,
    [versionId, flowId],
  );
  return rows[0] || null;
}

// Put a version back as the live diagram. The write goes through the same
// trigger as every other, so the state being replaced is kept as a new version
// and a restore can itself be undone. A locked diagram refuses: { locked: true }.
// Which lock: the owner's own restore (the app, the HTTP route) answers to
// the delete lock as it always has; an agent's restore ({ agent: true }, the
// MCP server) is an edit and answers to the edit lock.
export async function restoreVersion(flowId, owner, versionId, { agent = false } = {}) {
  const flow = await owned(flowId, owner);
  if (!flow) return null;
  if (agent ? flow.edit_locked : flow.locked) return { locked: true, edit_locked: !!flow.edit_locked };
  const { rows: found } = await db.query(
    "SELECT nodes, edges, title, pattern, description, view_state, saved_at FROM flow_versions WHERE id = $1 AND flow_id = $2",
    [versionId, flowId],
  );
  const v = found[0];
  if (!v) return null;
  const when = new Date(v.saved_at).toISOString();
  await db.query(
    `UPDATE flows SET title = $2, nodes = $3::jsonb, edges = $4::jsonb, pattern = $5, description = $6,
       view_state = $7::jsonb, update_reason = $8, thumbnail = NULL, updated_at = now()
     WHERE id = $1`,
    [flowId, v.title, JSON.stringify(v.nodes), JSON.stringify(v.edges), v.pattern, v.description,
     v.view_state == null ? null : JSON.stringify(v.view_state), `Restored the version saved ${when}`],
  );
  return { restored: versionId, saved_at: v.saved_at, title: v.title };
}
