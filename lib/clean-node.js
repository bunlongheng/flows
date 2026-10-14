import { okColor } from "./validate-design.js";
import { cleanNote, cleanInfo, cleanTooltip } from "../src/note.js";
import { cleanTipColor } from "../src/sunset.js";
import { cleanStyle } from "../src/style.js";

// The branding, text, status and look keys of 1 node, as every door stores them:
// the API create, a PATCH that adds a node, and the MCP create. Position and
// size are not here - each door reads those its own way.
export const cleanNode = (n) => ({
  ...(typeof n.icon === "string" && n.icon ? { icon: n.icon } : {}),
  ...(typeof n.label === "string" && n.label ? { label: n.label } : {}),
  ...(okColor(n.color) ? { color: n.color } : {}),
  ...(typeof n.sub === "string" && n.sub ? { sub: n.sub } : {}),
  ...(cleanNote(n.note) ? { note: cleanNote(n.note) } : {}),
  ...(cleanInfo(n.info) ? { info: cleanInfo(n.info) } : {}),
  ...(n.sunset === true ? { sunset: true } : {}),
  ...(n.new === true ? { new: true } : {}),
  ...(n.cracked === false ? { cracked: false } : {}),
  ...(cleanTooltip(n.tooltip) ? { tooltip: cleanTooltip(n.tooltip) } : {}),
  ...(n.pinTooltip === true && cleanTooltip(n.tooltip) ? { pinTooltip: true } : {}),
  ...(cleanTipColor(n.tooltipColor) ? { tooltipColor: cleanTipColor(n.tooltipColor) } : {}),
  ...(n.iconFrame === true ? { iconFrame: true } : {}),
  ...(Number.isInteger(n.level) && n.level >= 1 && n.level <= 4 ? { level: n.level } : {}),
  ...(typeof n.image === "string" && n.image.startsWith("data:image/jpeg;base64,") ? { image: n.image } : {}),
  ...(cleanStyle(n.style, "node") ? { style: cleanStyle(n.style, "node") } : {}),
});
