// How wide a left-hand panel may be dragged: never narrower than the Copy row,
// never past 80 percent of the window.
export const PANEL_MIN = 240
export function clampWidth(w, winW) {
  return Math.min(Math.round(winW * 0.8), Math.max(PANEL_MIN, Math.round(w)))
}
