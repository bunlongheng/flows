// The passcode lock screen, ported from Stickies (app/api/stickies/public/raw/
// route.ts gatePage). A right passcode goes straight to the flow, which plays
// its own reveal (src/components/UnlockReveal.jsx).
// Pure HTML builders: no React, no DB.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">`;

/** Liquid glass lock: a white frosted card with the title, 1 masked field,
 *  Enter submits. With a `backdrop` (a tiny PNG data URI of the diagram) the
 *  card sits on that diagram, blurred past reading, instead of a plain wash. */
export function gatePage({ action, title, bad, backdrop }) {
  const bg = typeof backdrop === "string" && backdrop.startsWith("data:image/png;base64,") ? backdrop : null;
  const alert = bad ? `<div class="alert" role="alert">Wrong passcode</div>` : `<div class="alert hidden">&nbsp;</div>`;
  return `<!DOCTYPE html><html lang="en"${bg ? ` class="has-blur"` : ""}><head>
${HEAD}
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:linear-gradient(160deg,#f7f8fb 0%,#eceef5 100%);color:#1c1e21;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.room{min-height:100%;display:flex;align-items:center;justify-content:center;padding:32px 16px}
/* liquid glass: the diagram shows through, a prismatic rim catches the light */
.glass{position:relative;width:max-content;min-width:min(480px,calc(100vw - 32px));max-width:min(760px,calc(100vw - 32px));padding:44px 44px 36px;border-radius:32px;text-align:center;isolation:isolate;
  background:linear-gradient(135deg,rgba(255,255,255,0.62) 0%,rgba(255,255,255,0.34) 55%,rgba(255,255,255,0.5) 100%);
  -webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);
  box-shadow:0 30px 80px -20px rgba(60,70,120,0.22),0 2px 6px rgba(60,70,120,0.06),inset 0 1px 0 rgba(255,255,255,0.95),inset 0 0 0 1px rgba(255,255,255,0.45)}
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;z-index:1;
  background:linear-gradient(135deg,rgba(255,178,150,0.9) 0%,rgba(255,230,210,0.35) 18%,rgba(255,255,255,0.5) 45%,rgba(190,170,255,0.3) 70%,rgba(140,190,255,0.85) 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}
.glass::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(42% 32% at 4% 6%,rgba(255,190,170,0.3) 0%,rgba(255,190,170,0) 70%),radial-gradient(40% 32% at 97% 96%,rgba(170,150,255,0.3) 0%,rgba(170,150,255,0) 70%),radial-gradient(30% 25% at 96% 6%,rgba(150,215,255,0.18) 0%,rgba(150,215,255,0) 70%)}
.logo{display:block;margin:0 auto 20px;width:76px;height:76px;border-radius:20px;box-shadow:0 10px 26px rgba(28,30,33,0.3),inset 0 0 0 1px rgba(255,255,255,0.3)}
.caption{font-size:14px;color:#6b7280;margin-top:8px;line-height:1.5}
.name{font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.alert{margin:18px 0 -6px;font-size:13.5px;font-weight:600;color:#d92d20;animation:shake 0.4s ease-in-out}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
.alert.hidden{visibility:hidden;animation:none}
.entry{margin-top:30px;display:flex;align-items:center;gap:10px;padding:6px 6px 6px 20px;border-radius:999px;
  background:rgba(255,255,255,0.55);border:1px solid rgba(255,255,255,0.9);
  box-shadow:inset 0 1px 1px rgba(255,255,255,0.9),0 12px 34px -8px rgba(110,100,200,0.22),0 0 0 1px rgba(120,110,200,0.08);transition:box-shadow .15s}
.entry:focus-within{box-shadow:inset 0 1px 1px rgba(255,255,255,0.9),0 12px 34px -8px rgba(110,100,200,0.3),0 0 0 4px rgba(129,140,248,0.28)}
.entry svg.lock{flex:none;width:22px;height:22px;color:#6b7280}
/* type=text + text-security masks input WITHOUT being a password field, so
   LastPass/1Password never attach their autofill icon. */
.entry input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#1f2937;font-size:18px;font-weight:600;font-family:inherit;letter-spacing:0.18em;padding:12px 0;-webkit-text-security:disc;text-security:disc}
.entry input::placeholder{color:#8b93a5;font-weight:400;letter-spacing:0.01em}
.go{flex:none;width:48px;height:48px;border:0;border-radius:50%;cursor:pointer;display:grid;place-items:center;color:#fff;
  background:linear-gradient(145deg,#a5a8ff 0%,#8f8bf4 100%);box-shadow:0 8px 18px -6px rgba(110,100,230,0.6),inset 0 1px 0 rgba(255,255,255,0.5);transition:transform .12s,box-shadow .12s}
.go:hover{transform:translateY(-1px);box-shadow:0 10px 22px -6px rgba(110,100,230,0.7),inset 0 1px 0 rgba(255,255,255,0.5)}
.go:active{transform:translateY(0) scale(0.97)}
.go:focus-visible{outline:3px solid rgba(129,140,248,0.6);outline-offset:2px}
.go svg{width:20px;height:20px}
.blur{position:fixed;inset:-60px;background:#fff url("${bg || ""}") center/contain no-repeat;filter:blur(22px) saturate(1.1);z-index:0}
.veil{position:fixed;inset:0;background:rgba(255,255,255,0.4);z-index:0}
.has-blur .room{position:relative;z-index:1}
html.has-blur,html.has-blur body{background:#f5f6f8}
@media (prefers-reduced-motion:reduce){.alert,.go{animation:none;transition:none}}
</style>
</head><body>
${bg ? `<div class="blur" aria-hidden="true"></div><div class="veil" aria-hidden="true"></div>` : ""}
<div class="room">
<form class="glass" method="POST" action="${esc(action)}">
  <img class="logo" src="/icon.png" alt="Flows" width="76" height="76">
  <div class="name">${esc(title)}</div>
  <div class="caption">Protected diagram</div>
  ${alert}

  <div class="entry">
    <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>
    <input name="passcode" type="text" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" required placeholder="Passcode" aria-label="Passcode">
    <button class="go" type="submit" aria-label="Open diagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
  </div>
</form>
</div>
</body></html>`;
}
