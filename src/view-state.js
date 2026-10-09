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
export const PANELS = ["steps", "share", "code", "notes-off"];
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
// "control speed of current 1 2 3 4 5 x, control amount 5 10 20 50 100").
// Amount is a total, not a per-line count: the same number reads the same on a
// 6 line flow and on a 50 line map, which is the whole point - 1 dot a line put
// 41 of them on BC Integrations and the owner called it "a bit too much".
export const SPEEDS = [1, 2, 3, 4, 5];
export const AMOUNTS = [5, 10, 20, 50, 100];
export const CURRENT_DEFAULT = { speed: 1, amount: 10 };

/** The current's settings from a view_state, defaults filled in. Always both keys. */
export const currentOf = (v) => ({
  speed: SPEEDS.includes(v?.current?.speed) ? v.current.speed : CURRENT_DEFAULT.speed,
  amount: AMOUNTS.includes(v?.current?.amount) ? v.current.amount : CURRENT_DEFAULT.amount,
});

/**
 * `current` for storage, or nothing when it is the default - a row only carries
 * the key once the owner has moved off 1x/10, the same way `start` is omitted
 * until the pill is placed by hand.
 */
export const cleanCurrent = (v) => {
  const c = currentOf({ current: v });
  return c.speed === CURRENT_DEFAULT.speed && c.amount === CURRENT_DEFAULT.amount ? {} : { current: c };
};

/** The full canvas-state half of view_state, lanes excluded. */
export const cleanView = (v) => ({
  panels: cleanPanels(v?.panels),
  badge: cleanBadge(v?.badge),
  ...cleanStart(v?.start),
  ...cleanCurrent(v?.current),
});
