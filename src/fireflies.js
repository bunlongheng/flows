// A deleted diagram does not just disappear - it comes apart into fireflies
// that drift up and blink out, the same swarm Sequences and Drops scatter.
// No canvas and no snapshot of the card: the specks are not a picture of what
// was deleted, only the fact that it left.

const rand = n => (Math.random() * 2 - 1) * n

export function fireflies(el) {
  if (!el) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const box = el.getBoundingClientRect()
  if (!box.width || !box.height) return

  const field = document.createElement('div')
  field.className = 'ff-field'
  field.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`

  // Fewer and larger than ash - a firefly reads as a point of light, not dust.
  const count = Math.min(70, Math.max(18, Math.round((box.width * box.height) / 1900)))
  for (let n = 0; n < count; n++) {
    const bit = document.createElement('i')
    // A few burn greener, the way a real swarm is never one colour.
    if (Math.random() < 0.3) bit.className = 'ff-green'
    const size = 2 + Math.round(Math.random() * 2)
    bit.style.cssText =
      `left:${Math.random() * box.width}px;top:${Math.random() * box.height}px;` +
      `width:${size}px;height:${size}px;` +
      `--dx:${rand(120)}px;--dy:${-70 - Math.random() * 230}px;` +
      `--rot:${rand(28)}deg;` +
      `animation-delay:${(Math.random() * 0.5).toFixed(2)}s;` +
      `animation-duration:${(2.4 + Math.random() * 1.6).toFixed(2)}s`
    field.append(bit)
  }

  document.body.append(field)
  window.setTimeout(() => field.remove(), 4500)
}
