import { cleanSizing } from "./card-size.js";
// How a diagram OPENS: which reading aids are showing and how a step chip is
// painted. One module, for the same reason src/style.js is one module: the
// canvas writes this, the API validates it (PATCH view_state), the MCP declares
// it (update_flow view) and a create can carry it, and all 4 have to agree on
// exactly 1 list of legal values.
//
// Swimlanes also live in view_state but are configuration, not canvas state, so
// they keep their own validator in src/lanes.js and are merged separately.

// Panels are NOT mutually exclusive: Steps and Code can both be open, so the
// whole set is stored. "notes-off" is inverted ON PURPOSE - notes show by
// default, so an absent flag has to keep meaning "shown" for every row written
// before the toggle existed. A row saved before the Details panel was removed
// still carries "details"; it is not in this list, so it is dropped on the next
// save and nothing has to migrate.
// "arrows-off" and "legend-off" are inverted the same way: arrowheads and the
// legend show by default, the key is what hides them.
export const PANELS = ["steps", "share", "code", "notes-off", "arrows-off", "legend-off", "badge-x-off", "tags-above"];
export const BADGES = ["dark", "silver", "color", "plain"];

/** The panels of `v`, filtered to the legal set. Always an array. */
export const cleanPanels = (v) =>
  Array.isArray(v) ? PANELS.filter((x) => v.includes(x)) : [];

/** The badge style of `v`, or null when it is not one of the 4. */
export const cleanBadge = (v) => (BADGES.includes(v) ? v : null);

/**
 * The owner's hand-placed Start pill, rounded, or nothing. Omitted rather than
 * nulled when missing: the canvas sends the whole view_state each time, so
 * "absent" is what clears it.
 */
export const cleanStart = (v) =>
  v && Number.isFinite(v.x) && Number.isFinite(v.y)
    ? { start: { x: Math.round(v.x), y: Math.round(v.y) } }
    : {};

// The current: how fast it runs and how many small dots the WHOLE diagram
// carries. Presets only, because the panel offers presets (owner 2026-10-09:
// "control speed of current, control amount, control currents you know").
//
// Speed stops at 2x and goes DOWN to half, in half steps (owner, same day:
// "speed 2x max, pls do in between .5 1.5"): past 2x the dots are a blur and
// the diagram stops being readable, while 0.5x is the setting for watching a
// dense map. Amount runs 20 to 5000 (owner, same day: "add 1000, 2000 and
// 5000, remove 5, remove 10"), the top end for a big map that wants to look busy.
//
// Amount is a total, not a per-line count: the same number reads the same on a
// 6 line flow and on a 50 line map, which is the whole point - 1 dot a line put
// 41 of them on BC Integrations and the owner called it "a bit too much".
export const SPEEDS = [0.5, 1, 1.5, 2];
export const AMOUNTS = [20, 50, 100, 200, 500, 1000, 2000, 5000];
export const CURRENT_DEFAULT = { speed: 1, amount: 20 };

/** The current's settings from a view_state, defaults filled in. Always both keys. */
export const currentOf = (v) => ({
  speed: SPEEDS.includes(v?.current?.speed) ? v.current.speed : CURRENT_DEFAULT.speed,
  amount: AMOUNTS.includes(v?.current?.amount) ? v.current.amount : CURRENT_DEFAULT.amount,
});

/**
 * `current` for storage, or nothing when it is the default - a row only carries
 * the key once the owner has moved off 1x/20, the same way `start` is omitted
 * until the pill is placed by hand.
 */
export const cleanCurrent = (v) => {
  const c = currentOf({ current: v });
  return c.speed === CURRENT_DEFAULT.speed && c.amount === CURRENT_DEFAULT.amount ? {} : { current: c };
};

// Text sizes for the whole diagram, in px (owner 2026-10-13: "too small to
// read"): every card title and sub and every line tag. A card's own style.fs
// still wins for that card. Only a size off the default is stored.
export const FONT_DEFAULT = { title: 12, sub: 10, tag: 8.5 };
export const FONT_MIN = 8;
export const FONT_MAX = 22;

/** The diagram's text sizes from a view_state, defaults filled in. Always all 3 keys. */
export const fontsOf = (v) => Object.fromEntries(Object.entries(FONT_DEFAULT).map(([k, d]) => {
  const n = Number(v?.fonts?.[k]), [lo, hi] = [FONT_MIN, FONT_MAX];
  return [k, v?.fonts?.[k] != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 2) / 2)) : d];
}));

/** `fonts` for storage: only the sizes that differ from the default. */
export const cleanFonts = (v) => {
  const kept = Object.entries(fontsOf({ fonts: v })).filter(([k, n]) => n !== FONT_DEFAULT[k]);
  return kept.length ? { fonts: Object.fromEntries(kept) } : {};
};

// C4 levels (owner 2026-10-14): a card's `level` 1-4 is the first view it shows
// in. Cumulative: a C2 view draws every level 1 and 2 card. A node without a
// level is always drawn. The picker needs 2+ levels in the nodes.
export const LEVELS = [1, 2, 3, 4];
export const LEVEL_NAMES = { 1: 'Context', 2: 'Container', 3: 'Component', 4: 'Code' };
export const cleanLevel = (v) => LEVELS.includes(v) ? { level: v } : {};
export const levelsOf = (nodes) => LEVELS.filter((l) => (nodes || []).some((n) => n?.level === l));
export const levelOf = (v, nodes) => { const ls = levelsOf(nodes); if (ls.length < 2) return null; return ls.includes(v?.level) ? v.level : ls[0]; };
export const atLevel = (nodes, edges, level) => {
  if (level == null) return { nodes, edges };
  const kept = (nodes || []).filter((n) => !LEVELS.includes(n.level) || n.level <= level);
  const ids = new Set(kept.map((n) => n.id));
  const ok = (id) => String(id).startsWith('lane:') || ids.has(id);
  return { nodes: kept, edges: (edges || []).filter((e) => ok(e.source) && ok(e.target)) };
};

// Layout, per diagram (owner 2026-10-13, "like my sequences app"): box scales
// every card, gap and vgap spread the cards apart across and down so the tags
// have room. Drawn by the canvas and the exports; stored positions stay unscaled.
export const LAYOUT_DEFAULT = { box: 1, gap: 1, vgap: 1 };
export const LAYOUT_RANGE = { box: [0.6, 2], gap: [0.6, 3], vgap: [0.6, 3] };
export const layoutOf = (v) => Object.fromEntries(Object.entries(LAYOUT_DEFAULT).map(([k, d]) => {
  const n = Number(v?.layout?.[k]), [lo, hi] = LAYOUT_RANGE[k];
  return [k, v?.layout?.[k] != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 20) / 20)) : d];
}));
/** `layout` for storage: only the values that differ from the default. */
export const cleanLayout = (v) => {
  const kept = Object.entries(layoutOf({ layout: v })).filter(([k, n]) => n !== LAYOUT_DEFAULT[k]);
  return kept.length ? { layout: Object.fromEntries(kept) } : {};
};
/** A stored card at the diagram's layout: position spread, size scaled. */
export const laidOut = (pos, size, L) => ({
  position: pos ? { x: pos.x * L.gap, y: pos.y * L.vgap } : pos,
  size: size && L.box !== 1 ? { w: Math.round(size.w * L.box), h: Math.round(size.h * L.box) } : size,
});

/** The full canvas-state half of view_state, lanes excluded. */
export const cleanView = (v) => ({
  panels: cleanPanels(v?.panels),
  badge: cleanBadge(v?.badge),
  ...cleanStart(v?.start),
  ...cleanCurrent(v?.current),
  ...cleanSizing(v?.sizing),
  ...cleanFonts(v?.fonts),
  ...cleanLayout(v?.layout),
  ...cleanLevel(v?.level),
});
