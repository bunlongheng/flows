// A diagram made for a repo (a README, a PR, a repo audit) lists under the
// gallery's Linked tab, not under My Diagrams, so the daily list stays the
// owner's own work. It says so with a "linked" tag and names the repo it
// serves, owner/name, so its card can prove where it is used with a GitHub
// link. Both come from the caller (linked: true, repo: "owner/name") or from
// the title, since every audit and README pass names its diagram
// "owner/repo - ...".
export const REPO_TITLE = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(\s|:|$)/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function isLinkedTitle(title) {
  return REPO_TITLE.test(String(title || "").trim());
}

// "owner/name" off a repo title, else null.
export function repoFromTitle(title) {
  const m = REPO_TITLE.exec(String(title || "").trim());
  return m ? m[1] : null;
}

// A caller's repo, "owner/name" only (no URL, no path), else null.
export function cleanRepo(repo) {
  const r = String(repo || "").trim();
  return REPO.test(r) && r.length <= 200 ? r : null;
}

// Tags for a new flow: its source (API or MCP), plus "linked" when asked for,
// when a repo is named, or when the title says so. linked: false keeps a
// repo-titled flow out.
export function creationTags(source, title, linked, repo) {
  const isLinked = linked === true || (linked !== false && (Boolean(repo) || isLinkedTitle(title)));
  return isLinked ? [source, "linked"] : [source];
}
