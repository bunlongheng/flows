import { cleanLanes } from "../src/lanes.js";
import { cleanView, cleanFonts, cleanStart, cleanLayout, cleanLevel, CURRENT_DEFAULT } from "../src/view-state.js";

// What a NEW diagram stores in view_state: its lanes plus the cleaned opening
// view, with every default left out. Used by the API create, the MCP create and
// the render-only paths, so all of them clean a view the same way.
export const storeView = (view, lanes) => {
  const v = cleanView(view);
  const l = cleanLanes(Array.isArray(lanes) ? lanes : []);
  const out = { ...(l.length ? { lanes: l } : {}), ...(v.panels.length ? { panels: v.panels } : {}), ...(v.badge ? { badge: v.badge } : {}) };
  for (const k of ["start", "current", "sizing", "fonts", "layout", "level"]) if (v[k]) out[k] = v[k];
  return out;
};

// What the MCP update_flow merges into an existing view_state: only the keys the
// caller sent. `keys` are the ones to clear first, so a sent key is replaced
// whole and an empty lanes list removes them.
export const viewPatch = (view, lanes) => {
  const patch = {}, keys = [];
  if (lanes) { keys.push("lanes"); const l = cleanLanes(lanes); if (l.length) patch.lanes = l; }
  const set = (k, v) => { keys.push(k); Object.assign(patch, v); };
  if (view?.panels) set("panels", { panels: view.panels });
  if (view?.badge) set("badge", { badge: view.badge });
  if (view?.current) set("current", { current: { ...CURRENT_DEFAULT, ...view.current } });
  if (view?.sizing) set("sizing", { sizing: view.sizing });
  if (view?.fonts) set("fonts", cleanFonts(view.fonts));
  if (view?.start) set("start", cleanStart(view.start));
  if (view?.layout) set("layout", cleanLayout(view.layout));
  if (view?.level) set("level", cleanLevel(view.level));
  return { patch, keys };
};
