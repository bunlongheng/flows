// A diagram made for a repo (a README, a PR, a repo audit) lists under the
// gallery's Linked tab, not under My Diagrams, so the daily list stays the
// owner's own work. It says so with a "linked" tag: passed as linked: true by
// the caller, or read off the title, since every audit and README pass names
// its diagram "owner/repo - ...".
export const REPO_TITLE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\s|:|$)/;

export function isLinkedTitle(title) {
  return REPO_TITLE.test(String(title || "").trim());
}

// Tags for a new flow: its source (API or MCP), plus "linked" when asked for
// or when the title says so. linked: false keeps a repo-titled flow out.
export function creationTags(source, title, linked) {
  const isLinked = linked === true || (linked !== false && isLinkedTitle(title));
  return isLinked ? [source, "linked"] : [source];
}
