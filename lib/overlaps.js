// Lines lying on top of each other in a rendered diagram: 2 straight legs of 2
// different lines on the same track (under 4 px apart) running alongside each
// other for more than 20 px. A trunk member that starts or stops ON another
// line (the bus, a shared stem) is joined to it by design and does not count.
// Used by scripts/check-overlaps.mjs and the routing tests.

const legsOf = (d) => {
  const segs = [];
  let cur = null, first = null;
  for (const m of d.matchAll(/([MLQC])([^MLQC]+)/g)) {
    const n = m[2].match(/-?[\d.]+/g).map(Number), p = { x: n[n.length - 2], y: n[n.length - 1] };
    if (!first) first = p;
    if (m[1] === "L" && cur) segs.push({ x1: cur.x, y1: cur.y, x2: p.x, y2: p.y });
    cur = p;
  }
  return { segs, ends: [first, cur] };
};

const onSeg = (p, s) => Math.abs(s.x1 - s.x2) < 0.5
  ? Math.abs(p.x - s.x1) < 1 && p.y >= Math.min(s.y1, s.y2) - 1 && p.y <= Math.max(s.y1, s.y2) + 1
  : Math.abs(p.y - s.y1) < 1 && p.x >= Math.min(s.x1, s.x2) - 1 && p.x <= Math.max(s.x1, s.x2) + 1;

// [{ a, b, len }] for every overlapping pair of paths, a and b the path index.
export function findOverlaps(svg) {
  const lines = [...String(svg).matchAll(/<path[^>]*\sd="(M[^"]+)"/g)].map((m) => legsOf(m[1]));
  const joined = (a, b) => [[a, b], [b, a]].some(([x, y]) => lines[x].ends.some((p) => p && lines[y].segs.some((s) => onSeg(p, s))));
  const out = new Map();
  for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
    for (const s of lines[a].segs) for (const t of lines[b].segs) {
      for (const [ax, o] of [["y", "x"], ["x", "y"]]) {
        if (Math.abs(s[ax + "1"] - s[ax + "2"]) > 0.5 || Math.abs(t[ax + "1"] - t[ax + "2"]) > 0.5 || Math.abs(s[ax + "1"] - t[ax + "1"]) >= 4) continue;
        const len = Math.min(Math.max(s[o + "1"], s[o + "2"]), Math.max(t[o + "1"], t[o + "2"]))
          - Math.max(Math.min(s[o + "1"], s[o + "2"]), Math.min(t[o + "1"], t[o + "2"]));
        if (len > 20 && !joined(a, b)) out.set(`${a}/${b}`, { a, b, len: Math.max(Math.round(len), out.get(`${a}/${b}`)?.len || 0) });
      }
    }
  }
  return [...out.values()];
}
