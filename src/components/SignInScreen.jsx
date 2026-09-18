// Signed-out landing. Family style (mindmaps/diagrams/stickies): a centered card
// with logo + title + one-line tagline + "Continue with Google", over an animated
// decorative motif of the app's own thing. Here the motif is a live architecture
// graph that wires itself together on load - service nodes pop in and edges draw
// between them, then the whole scene drifts gently. Self-contained (no CDN fonts:
// the strict CSP blocks them), aria-hidden decoration, prefers-reduced-motion safe.

// A small, plausible architecture laid out on a 1200x760 canvas. Nodes sit around
// the edges so their connecting lines cross behind the centered card (depth).

// Vite exposed IS_DEV; Next replaces process.env.NODE_ENV at build
// time, so this compiles to a constant in the client bundle exactly the same way.
const IS_DEV = process.env.NODE_ENV !== 'production'

const NODES = [
  { id: "user", label: "User", x: 120, y: 120, c: "#3b82f6" },
  { id: "cf", label: "CloudFront", x: 330, y: 90, c: "#8C4FFF" },
  { id: "waf", label: "WAF", x: 120, y: 300, c: "#ef4444" },
  { id: "apigw", label: "API Gateway", x: 340, y: 300, c: "#a855f7" },
  { id: "lambda", label: "Lambda", x: 560, y: 200, c: "#f97316" },
  { id: "dynamo", label: "DynamoDB", x: 560, y: 420, c: "#dc2626" },
  { id: "sqs", label: "SQS", x: 850, y: 120, c: "#f59e0b" },
  { id: "kinesis", label: "Kinesis", x: 1050, y: 230, c: "#6366f1" },
  { id: "s3", label: "S3", x: 850, y: 340, c: "#16a34a" },
  { id: "rds", label: "Aurora", x: 1050, y: 470, c: "#1d4ed8" },
  { id: "cache", label: "ElastiCache", x: 640, y: 620, c: "#ef4444" },
  { id: "cw", label: "CloudWatch", x: 300, y: 560, c: "#ec4899" },
];
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EDGES = [
  ["user", "cf"], ["user", "waf"], ["cf", "apigw"], ["waf", "apigw"],
  ["apigw", "lambda"], ["lambda", "dynamo"], ["lambda", "sqs"], ["sqs", "kinesis"],
  ["lambda", "s3"], ["dynamo", "rds"], ["lambda", "cache"], ["apigw", "cw"],
  ["kinesis", "s3"], ["dynamo", "cache"],
];

const NODE_W = 128;
const NODE_H = 40;

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function SignInScreen({ devBypass, loading }) {
  const W = 1200, H = 760;
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "radial-gradient(120% 120% at 50% 0%, #ffffff 0%, #f1f4f9 55%, #e7ecf5 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes siDraw { from { stroke-dashoffset: 640; } to { stroke-dashoffset: 0; } }
        @keyframes siPop  { from { opacity: 0; transform: scale(0.72); } to { opacity: 1; transform: scale(1); } }
        @keyframes siDrift { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-10px,0); } }
        @keyframes siCardIn { from { opacity: 0; transform: translateY(20px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes siPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        .si-edge { stroke-dasharray: 640; animation: siDraw 1.1s ease forwards; }
        .si-node { transform-box: fill-box; transform-origin: center; animation: siPop 0.5s cubic-bezier(.2,.8,.2,1) both; }
        .si-scene { animation: siDrift 9s ease-in-out infinite; }
        .si-card { animation: siCardIn 0.6s cubic-bezier(.2,.8,.2,1) both; }
        .si-btn { transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
        .si-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(20,30,60,0.14); border-color: #c7cede; }
        .si-dot { animation: siPulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .si-edge, .si-node, .si-scene, .si-card, .si-dot { animation: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; }
        }
      `}</style>

      {/* Decorative live architecture graph */}
      <svg aria-hidden="true" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <g className="si-scene" opacity="0.4">
          {EDGES.map(([a, b], i) => {
            const na = NODES[NI[a]], nb = NODES[NI[b]];
            return (
              <line key={i} className="si-edge"
                x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                stroke="#9aa7bd" strokeWidth="1.5" strokeLinecap="round"
                style={{ animationDelay: `${0.15 + i * 0.06}s` }} />
            );
          })}
          {NODES.map((n, i) => (
            <g key={n.id} className="si-node" style={{ animationDelay: `${0.5 + i * 0.07}s` }}>
              <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx="10"
                fill="#ffffff" stroke={`${n.c}55`} strokeWidth="1.5" />
              <circle className="si-dot" cx={n.x - NODE_W / 2 + 20} cy={n.y} r="6" fill={n.c}
                style={{ animationDelay: `${i * 0.2}s` }} />
              <text x={n.x - NODE_W / 2 + 36} y={n.y + 4} fontSize="13" fontWeight="600"
                fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fill="#334155">{n.label}</text>
            </g>
          ))}
        </g>
      </svg>

      {/* Sign-in card (hidden during the brief auth check so an authed owner
          never flashes the sign-in card - they just see the graph splash). */}
      {!loading && (
      <div className="si-card" style={{ position: "relative", width: 380, maxWidth: "calc(100vw - 32px)", background: "rgba(255,255,255,0.86)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 22, padding: "40px 36px 32px", boxShadow: "0 24px 70px rgba(30,45,90,0.18), 0 0 0 1px rgba(30,45,90,0.06)", textAlign: "center" }}>
        {/* Real app icon (the brand mark, same as favicon / PWA icon) */}
        <img src="/icon.png" alt="Flows" width={60} height={60}
          style={{ display: "block", margin: "0 auto 18px", borderRadius: 16, boxShadow: "0 8px 22px rgba(28,30,33,0.28)" }} />

        <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.03em", color: "#111827", margin: 0 }}>Flows</h1>
        <p style={{ fontSize: 13.5, color: "#6b7280", margin: "8px 0 26px", lineHeight: 1.5 }}>
          Sign in to design, save, and share<br />AWS &amp; GCP architecture diagrams.
        </p>

        <a href="/api/auth/login" className="si-btn"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "12px 0", fontSize: 14, fontWeight: 600, borderRadius: 12, background: "#ffffff", color: "#1f2937", border: "1px solid #e2e6ee", cursor: "pointer", textDecoration: "none", boxShadow: "0 2px 8px rgba(20,30,60,0.06)" }}>
          <GoogleG /> Continue with Google
        </a>

        <p style={{ fontSize: 11.5, color: "#9aa3b2", margin: "18px 0 0" }}>
          Owner access only. AI generation stays private.
        </p>

        {/* Public demo gallery - browse without an account, matching the diagrams app. */}
        <a href="/demo"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 16, fontSize: 13.5, fontWeight: 600, color: "#7c3aed", textDecoration: "none" }}>
          View live demo &rarr;
        </a>

        {IS_DEV && (
          <button onClick={devBypass}
            style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "#6366f1", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Continue without signing in (dev)
          </button>
        )}
      </div>
      )}
    </div>
  );
}
