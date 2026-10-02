// The code panel shows a diagram's JSON. An inline icon is a base64 data URI
// of a few thousand characters, so 1 icon buries the 4 lines around it that
// matter. The panel shows the head of every data URI and how long it is; Copy
// still takes the whole JSON, so this is for reading, never for saving.
const DATA_URI = /"(data:[^;"]+;base64,)([A-Za-z0-9+/=]{24})[A-Za-z0-9+/=]*"/g

export function previewCode(data) {
  return JSON.stringify(data, null, 2).replace(DATA_URI, (m, prefix, head) => `"${prefix}${head}... ${m.length - 2} chars"`)
}
