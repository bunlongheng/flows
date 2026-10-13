import { useEffect, useRef, useState } from 'react'

// The moment after a right passcode (the unlock route lands on /?id=...&reveal=1):
// the diagram starts frosted, the frost wipes away top to bottom over 3 s, and
// 1000 single-pixel fireflies scatter across the page while it does. Runs once,
// then removes itself and the ?reveal flag. Reduced motion skips straight to the diagram.
const DURATION = 3000
const COUNT = 1000

export function UnlockReveal({ ready }) {
  const [on, setOn] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('reveal') === '1'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  })
  const veil = useRef(null)
  const canvas = useRef(null)

  // Drop the flag at once, so a reload or a copied link never replays it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reveal') !== '1') return
    const url = new URL(window.location.href)
    url.searchParams.delete('reveal')
    window.history.replaceState(window.history.state, '', url)
  }, [])

  useEffect(() => {
    if (!on || !ready) return undefined
    const cv = canvas.current, ctx = cv.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth, H = window.innerHeight
    cv.width = W * dpr; cv.height = H * dpr
    ctx.scale(dpr, dpr)
    // Each firefly: a spot, a drift, its own twinkle, and a warm or white glow.
    const flies = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60 - 10,
      tw: Math.random() * Math.PI * 2, sp: 4 + Math.random() * 8,
      c: Math.random() < 0.7 ? '255,236,150' : '255,255,255',
    }))
    const t0 = performance.now()
    let raf = 0
    const frame = now => {
      const t = Math.min(1, (now - t0) / DURATION)
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      // The frost's top edge, sliding from above the page to below it.
      const edge = -20 + ease * 140
      const mask = `linear-gradient(to bottom, transparent ${edge}%, #000 ${edge + 20}%)`
      if (veil.current) { veil.current.style.maskImage = mask; veil.current.style.webkitMaskImage = mask }
      ctx.clearRect(0, 0, W, H)
      const dt = 1 / 60, front = (edge + 10) / 100 * H
      for (const f of flies) {
        f.x += f.vx * dt; f.y += f.vy * dt
        // Brightest right at the moving front, so the light rides the reveal.
        const near = Math.max(0, 1 - Math.abs(f.y - front) / (H * 0.35))
        const a = (0.25 + 0.75 * near) * (0.55 + 0.45 * Math.sin(f.tw + now / 1000 * f.sp)) * (t < 0.85 ? 1 : (1 - t) / 0.15)
        if (a <= 0.02) continue
        ctx.fillStyle = `rgba(${f.c},${(a * 0.25).toFixed(3)})`
        ctx.fillRect(f.x - 1.5, f.y - 1.5, 4, 4)
        ctx.fillStyle = `rgba(${f.c},${a.toFixed(3)})`
        ctx.fillRect(f.x, f.y, 1, 1)
      }
      if (t < 1) raf = requestAnimationFrame(frame)
      else setOn(false)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [on, ready])

  if (!on) return null
  return (
    <div aria-hidden="true" data-testid="unlock-reveal" style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      <div ref={veil} style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(22px) saturate(1.1)', WebkitBackdropFilter: 'blur(22px) saturate(1.1)', background: 'rgba(15,15,15,0.28)' }} />
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen' }} />
    </div>
  )
}
