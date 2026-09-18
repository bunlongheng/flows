// "BC Integrations - Integry Decommission (SHAR-7027) v2.1" -> the part before the
// version suffix. Two titles sharing a base are the same diagram to a human, which
// is how create_flow spots an agent about to make a v2.3 of its own work.
//
// Lives here rather than in mcp/server.mjs so it can be tested: importing that
// module starts the MCP stdio server.
export function titleBase(t) {
  return String(t || "")
    .toLowerCase()
    // Only a TRAILING version token, and only one preceded by whitespace, so a
    // ticket number inside the name survives: "... (SHAR-7027) v2.1" loses the
    // "v2.1" and keeps the 7027, and "... (SHAR-7031)" never collides with it.
    .replace(/\s+v?\d+(\.\d+)*\s*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Too generic to accuse anything of being a duplicate.
export const MIN_BASE_LEN = 8;
