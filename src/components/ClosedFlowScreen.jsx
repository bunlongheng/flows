// What a ?id= or ?name= link lands on when the flow cannot be opened. Family
// style with SignInScreen: the same radial ground and frosted card. The picture
// is the app's own language: a 3 node flow whose last hop does not arrive. A
// live edge reaches Flows, then a dotted one stops at a red mark short of the
// flow itself. The words say why, and the 1 button is the way past it.
//
// status: the HTTP status the flow fetch returned, or 'network' when nothing
// answered. 404 is also what a private flow returns to anyone but its owner,
// so a signed-out visitor is told to sign in; a signed-in owner is told it is
// gone, since a private flow of theirs would have opened.

const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"

function copyFor(status, signedIn) {
  if (status === 404 && !signedIn) return {
    kind: 'private',
    title: 'This flow is private',
    body: 'Or it was deleted. If it is yours, sign in and this link opens.',
    node: 'Private',
  }
  if (status === 404) return {
    kind: 'gone',
    title: 'Flow not found',
    body: '',
    node: 'Deleted',
  }
  return {
    kind: 'down',
    title: 'Flows could not be reached',
    body: 'The API did not answer, so the flow could not load. Reload to try again.',
    node: 'API',
  }
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

// The 3 node flow. Nodes are the app's card idiom (white, rounded, brand dot,
// mono label); the unreachable one is the app's sunset idiom: silver, red X.
function BrokenFlow({ node, kind }) {
  const W = 352, H = 72, y = 36
  const nodes = [
    { x: 8, w: 84, label: 'You', c: '#3b82f6' },
    { x: 126, w: 84, label: 'Flows', c: '#7c3aed' },
    { x: 248, w: 104, label: node, c: '#9aa3b2', off: true },
  ]
  return (
    <svg className="cf-flow" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true" style={{ display: 'block', maxWidth: W, margin: '0 auto', overflow: 'visible' }}>
      {/* live hop: marching dashes, like the canvas */}
      <line className="cf-live" x1={92} y1={y} x2={126} y2={y} stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 5" />
      {/* dead hop: dotted, and it stops at a red mark before the node */}
      <line className="cf-dead" x1={210} y1={y} x2={224} y2={y} stroke="#c0c6d1" strokeWidth="2" strokeLinecap="round" strokeDasharray="1.5 5" />
      <g className="cf-mark" transform={`translate(234 ${y})`}>
        <circle r="8" fill="#fff" stroke={kind === 'down' ? '#f97316' : '#ef4444'} strokeWidth="1.5" />
        <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke={kind === 'down' ? '#f97316' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" />
      </g>
      {nodes.map((n, i) => (
        <g key={n.label} className="cf-node" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
          <rect x={n.x} y={y - 18} width={n.w} height={36} rx="10"
            fill={n.off ? '#eef0f3' : '#ffffff'} stroke={n.off ? '#d3d7de' : `${n.c}66`} strokeWidth="1.5"
            strokeDasharray={n.off ? '4 3' : undefined} />
          {n.off ? (
            <g transform={`translate(${n.x + 20} ${y})`} fill="none" stroke="#9aa3b2" strokeWidth="1.6" strokeLinecap="round">
              {kind === 'down'
                ? <><circle r="5.5" /><path d="M-2.2 0h4.4M0 -2.2v4.4" /></>
                : <><rect x="-4.5" y="-1.5" width="9" height="7" rx="1.6" /><path d="M-2.6 -1.5v-1.8a2.6 2.6 0 0 1 5.2 0v1.8" /></>}
            </g>
          ) : (
            <circle cx={n.x + 20} cy={y} r="5.5" fill={n.c} />
          )}
          <text x={n.x + 34} y={y + 4} fontSize="12.5" fontWeight="600" fontFamily={MONO} fill={n.off ? '#8a91a0' : '#334155'}>{n.label}</text>
        </g>
      ))}
    </svg>
  )
}

const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
)
const TrashIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
  </svg>
)
const ReloadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
  </svg>
)

const BTN = {
  flex: '1 1 220px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
  height: 56, padding: '0 22px', borderRadius: 12, fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
  cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
}
const DARK = { ...BTN, background: '#16181d', color: '#fff', border: '1px solid #16181d' }
const LIGHT = { ...BTN, background: '#f5f6f9', color: '#111827', border: '1px solid #e3e6ec' }

// The picture is the owner's mockup: You -> Flows -> a red X, then a trash can
// with the papers in it. The API-down case keeps the drawn 3 node flow, since
// nothing was thrown away there.
export default function ClosedFlowScreen({ status, signedIn, onBack, onOpenTrash }) {
  const c = copyFor(status, signedIn)
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', background: 'radial-gradient(120% 120% at 50% 0%, #f9fbfd 0%, #f2f5fa 60%, #eaeef6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', textAlign: 'center' }}>
      <style>{`
        @keyframes cfMarch { to { stroke-dashoffset: -20; } }
        @keyframes cfCardIn { from { opacity: 0; transform: translateY(18px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes cfPop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes cfMark { 0% { opacity: 0; transform: translate(234px, 36px) scale(0.4); } 100% { opacity: 1; transform: translate(234px, 36px) scale(1); } }
        @keyframes cfFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .cf-card { animation: cfCardIn 0.55s cubic-bezier(.2,.8,.2,1) both; }
        .cf-art { animation: cfFloat 5s ease-in-out 0.6s infinite; }
        .cf-live { animation: cfMarch 0.9s linear infinite; }
        .cf-node { transform-box: fill-box; transform-origin: center; animation: cfPop 0.45s cubic-bezier(.2,.8,.2,1) both; }
        .cf-mark { animation: cfMark 0.4s cubic-bezier(.2,.8,.2,1) 0.55s both; }
        .cf-btn { transition: transform .12s ease, box-shadow .12s ease, background .12s ease; }
        .cf-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(20,30,60,0.14); }
        @media (prefers-reduced-motion: reduce) {
          .cf-card, .cf-art, .cf-live, .cf-node, .cf-mark { animation: none !important; opacity: 1 !important; }
        }
        @media (max-width: 520px) { .cf-title { font-size: 34px !important; } }
      `}</style>

      <div className="cf-card" role="alert" style={{ width: 920, maxWidth: '100%', boxSizing: 'border-box', background: '#fdfdfd', borderRadius: 28, padding: 'clamp(24px, 5vw, 56px) clamp(18px, 5vw, 64px) clamp(28px, 5vw, 64px)', boxShadow: '0 40px 90px rgba(30,45,90,0.12), 0 2px 6px rgba(30,45,90,0.04)' }}>
        {c.kind === 'down'
          ? <div style={{ padding: '40px 0 8px' }}><BrokenFlow node={c.node} kind={c.kind} /></div>
          : <img className="cf-art" src="/img/flow-not-found.webp" alt="" width="800" height="370"
              style={{ display: 'block', width: '100%', maxWidth: 800, height: 'auto', margin: '0 auto', WebkitMaskImage: 'radial-gradient(75% 85% at 50% 50%, #000 70%, transparent 100%)', maskImage: 'radial-gradient(75% 85% at 50% 50%, #000 70%, transparent 100%)' }} />}

        <h1 className="cf-title" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1, color: '#0b0f1a', margin: '28px 0 0' }}>{c.title}</h1>
        {c.body && <p style={{ fontSize: 15, color: '#6b7280', margin: '12px auto 0', maxWidth: 520, lineHeight: 1.55 }}>{c.body}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20, maxWidth: 680, margin: '36px auto 0' }}>
          {c.kind === 'private' && (
            <a href="/api/auth/login" className="cf-btn" style={DARK}><GoogleG /> Sign in and open it</a>
          )}
          {c.kind === 'down' && (
            <button type="button" className="cf-btn" onClick={() => window.location.reload()} style={DARK}><ReloadIcon /> Reload</button>
          )}
          <button type="button" className="cf-btn" onClick={onBack} style={c.kind === 'gone' ? DARK : LIGHT}><GridIcon /> Back to gallery</button>
          {c.kind === 'gone' && onOpenTrash && (
            <button type="button" className="cf-btn" onClick={onOpenTrash} style={LIGHT}><TrashIcon /> Open trash</button>
          )}
        </div>
      </div>
    </div>
  )
}
