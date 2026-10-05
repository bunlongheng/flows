// Shared showcase footer - links to Bunlong's site + socials. Matches the house
// SocialFooter used across the sibling apps. Shown only on public surfaces
// (demo landing + a demoed diagram), never in the owner's working views.

// The signature that writes itself, the same file the portfolio plays in its
// About section. It is drawn on white, which is what this footer is, so it needs
// no mask. It writes once on load and again on hover; the poster is the finished
// word, which is all a reduced-motion reader ever sees.
const SIG = '/brand/bunlong-anim'


const LINKS = [
  {
    href: 'https://bunlongheng.com',
    label: 'Portfolio',
    fill: 'linear-gradient(135deg,#6c188e 0%,#a32279 100%)',
    icon: (
      <span aria-hidden="true" style={{ display: 'block', width: 14, height: 14, backgroundColor: 'currentColor', WebkitMaskImage: 'url(/bunlong-b.png)', maskImage: 'url(/bunlong-b.png)', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', WebkitMaskSize: 'contain', maskSize: 'contain' }} />
    ),
  },
  {
    href: 'https://github.com/bunlongheng',
    label: 'GitHub',
    fill: 'linear-gradient(135deg,#a32279 0%,#de246f 100%)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
    ),
  },
  {
    href: 'https://www.linkedin.com/in/bunlongheng',
    label: 'LinkedIn',
    fill: 'linear-gradient(135deg,#de246f 0%,#e73553 100%)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" /></svg>
    ),
  },
  {
    href: 'https://www.instagram.com/ibunlong',
    label: 'Instagram',
    fill: 'linear-gradient(135deg,#e73553 0%,#ef5e29 100%)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
    ),
  },
  {
    href: 'https://x.com/ibunlong',
    label: 'X',
    fill: 'linear-gradient(135deg,#ef5e29 0%,#f7912a 100%)',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
    ),
  },
]

export function Footer({ fixed = false }) {
  return (
    <footer style={{
      // 20px, the gutter the shared header's pill sits in, so the tiles end
      // exactly where the action button above them ends.
      borderTop: '1px solid #e6e8ee', background: '#ffffff', padding: '9px 20px',
      display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      ...(fixed ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, paddingBottom: 'calc(9px + env(safe-area-inset-bottom))' } : { marginTop: 'auto' }),
    }}>
      <style>{`
        /* Hover fills the tile and knocks the mark out in white. The 5 fills are
           consecutive steps of the signature's own ramp, violet at the first
           tile to orange at the last, each a short gradient the way the
           portfolio paints its pills. The glyphs are currentColor (the B is a
           mask of it), so 1 colour change flips every one of them. Nothing
           moves or grows. */
        .sf-ico{position:relative;overflow:hidden;width:30px;height:30px;border-radius:8px;
          display:flex;align-items:center;justify-content:center;
          color:#64748b;background:#ffffff;border:1px solid #e6e8ee;text-decoration:none;
          transition:border-color .4s ease}
        /* The colour pours in from the bottom over 1s and the white copy of the
           mark rides inside it, so the glyph turns white exactly as the level
           passes over it. No line on the surface, no second border: the tile
           keeps the 1 it always had. It drains in .3s. */
        .sf-liquid{position:absolute;left:0;right:0;bottom:0;height:0;overflow:hidden;
          background:var(--sf-fill);pointer-events:none;transition:height .3s ease}
        .sf-head{position:absolute;left:0;bottom:0;width:100%;height:28px;display:flex;align-items:center;justify-content:center;color:#ffffff}
        .sf-ico:hover{border-color:transparent;transition:border-color 1s ease}
        .sf-ico:hover .sf-liquid{height:100%;transition:height 1s cubic-bezier(.3,.05,.3,1)}
        @media (prefers-reduced-motion:reduce){
          .sf-liquid,.sf-ico:hover .sf-liquid{transition:none}
        }
        /* The signature is ink on white with no alpha, so it is multiplied into
           whatever it sits on: white leaves it exactly as drawn, and a tinted
           page keeps the ink instead of showing a white box around it. */
        .sf-sig{display:block;height:28px;width:auto;object-fit:contain;user-select:none;mix-blend-mode:multiply}
      `}</style>
      <span style={{ fontSize: 12.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
        Built by
        <a href="https://bunlongheng.com" target="_blank" rel="noopener noreferrer" aria-label="Bunlong"
          onMouseEnter={e => { const v = e.currentTarget.querySelector('video'); if (v) { v.currentTime = 0; v.play()?.catch(() => {}) } }}
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <video className="sf-sig" autoPlay muted playsInline preload="auto" aria-hidden="true" poster={`${SIG}-poster.webp`}>
            <source src={`${SIG}.mp4`} type="video/mp4" />
          </video>
        </a>
      </span>

      <div style={{ display: 'flex', gap: 8 }}>
        {LINKS.map(l => (
          <a key={l.label} className="sf-ico" href={l.href} target="_blank" rel="noopener noreferrer" title={l.label} aria-label={l.label}
            style={{ '--sf-fill': l.fill }}>
            {l.icon}
            <span className="sf-liquid" aria-hidden="true"><span className="sf-head">{l.icon}</span></span>
          </a>
        ))}
      </div>
    </footer>
  )
}
