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
html,body{height:100%;background:linear-gradient(160deg,#f7f8fb 0%,#eceef5 100%);color:#0f172a;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.room{min-height:100%;display:flex;align-items:center;justify-content:center;padding:32px 16px}
/* Optical glass bubble: the diagram shows THROUGH the card. A thin white
   base, a diagonal reflection, a pearl interior, colour at the perimeter, an
   iridescent conic rim drawn only on the border, inset rims for thickness,
   and edge flares embedded under the content. The middle stays readable. */
.glass{position:relative;width:max-content;min-width:min(440px,calc(100vw - 32px));max-width:min(760px,calc(100vw - 32px));padding:40px;border-radius:36px;text-align:center;isolation:isolate;overflow:hidden;
  background:
    linear-gradient(118deg,rgba(255,255,255,0) 30%,rgba(255,255,255,0.42) 44%,rgba(255,255,255,0) 58%),
    radial-gradient(120% 90% at 50% 40%,rgba(255,255,255,0.28) 0%,rgba(250,248,255,0.1) 60%,rgba(240,236,255,0) 100%),
    radial-gradient(60% 40% at 0% 0%,rgba(255,200,185,0.2) 0%,rgba(255,200,185,0) 100%),
    radial-gradient(60% 40% at 100% 100%,rgba(185,170,255,0.22) 0%,rgba(185,170,255,0) 100%),
    radial-gradient(45% 35% at 0% 100%,rgba(170,225,245,0.16) 0%,rgba(170,225,245,0) 100%),
    linear-gradient(160deg,rgba(255,255,255,0.34) 0%,rgba(255,255,255,0.22) 100%);
  -webkit-backdrop-filter:blur(14px) saturate(180%);backdrop-filter:blur(14px) saturate(180%);
  box-shadow:
    0 40px 90px -24px rgba(50,60,110,0.26),0 6px 18px -6px rgba(50,60,110,0.08),
    inset 0 2px 0 rgba(255,255,255,0.95),inset 2px 0 0 rgba(255,255,255,0.7),
    inset 0 -2px 0 rgba(190,175,255,0.35),inset -2px 0 0 rgba(200,190,255,0.25),
    inset 0 0 0 1px rgba(255,255,255,0.5);
  animation:rise .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
/* iridescent bubble rim: conic gradient masked to a 1.5px ring */
.glass::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;z-index:3;
  background:conic-gradient(from 210deg at 50% 50%,
    rgba(255,200,215,0.95) 0deg,rgba(255,228,215,0.8) 40deg,rgba(255,255,255,0.95) 80deg,
    rgba(200,235,255,0.85) 130deg,rgba(170,225,245,0.9) 170deg,rgba(255,255,255,0.9) 210deg,
    rgba(205,190,255,0.95) 260deg,rgba(225,205,255,0.9) 300deg,rgba(255,200,215,0.95) 360deg);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}
/* inner edge: the glass has thickness, the top-left catches the light */
.glass::after{content:"";position:absolute;inset:5px;border-radius:31px;pointer-events:none;z-index:3;
  box-shadow:inset 1px 1.5px 0 rgba(255,255,255,0.95),inset -1px -1.5px 0 rgba(190,180,255,0.3)}
/* flares live under the content, pinned to the edges */
.flare{position:absolute;pointer-events:none;z-index:0;border-radius:50%;filter:blur(10px)}
.f1{top:-40px;left:-40px;width:200px;height:140px;background:radial-gradient(closest-side,rgba(255,205,190,0.5),rgba(255,205,190,0))}
.f2{top:14px;left:26px;width:120px;height:14px;border-radius:999px;filter:blur(4px);transform:rotate(-28deg);background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.95),rgba(255,255,255,0))}
.f3{top:10px;left:40px;width:10px;height:10px;filter:blur(1.5px);background:rgba(255,255,255,1);box-shadow:0 0 10px 3px rgba(255,255,255,0.8)}
.f4{top:-30px;right:-20px;width:160px;height:90px;background:radial-gradient(closest-side,rgba(255,255,255,0.6),rgba(255,255,255,0))}
.f5{bottom:-40px;left:-40px;width:170px;height:120px;background:radial-gradient(closest-side,rgba(165,225,245,0.4),rgba(165,225,245,0))}
.f6{bottom:-50px;right:-50px;width:230px;height:160px;background:radial-gradient(closest-side,rgba(180,165,255,0.5),rgba(180,165,255,0))}
.f7{bottom:12px;right:22px;width:120px;height:120px;border-radius:50%;filter:blur(2px);border:2px solid rgba(255,255,255,0);border-right-color:rgba(255,255,255,0.75);border-bottom-color:rgba(255,255,255,0.55);transform:rotate(-20deg);background:none}
.glass>*:not(.flare){position:relative;z-index:1}
.logo{display:block;margin:0 auto 20px;width:76px;height:76px;border-radius:20px;box-shadow:0 10px 26px rgba(28,30,33,0.3),inset 0 0 0 1px rgba(255,255,255,0.3)}
.caption{font-size:14px;color:#5b6475;margin-top:8px;line-height:1.5}
.name{font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.025em;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 0 rgba(255,255,255,0.6)}
.alert{margin:18px 0 -6px;font-size:13.5px;font-weight:600;color:#d92d20;animation:shake 0.4s ease-in-out}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
.alert.hidden{visibility:hidden;animation:none}
/* glass input: see-through, recessed, glossy top edge */
.entry{margin-top:28px;height:64px;display:flex;align-items:center;gap:10px;padding:0 8px 0 20px;border-radius:20px;
  background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,rgba(255,255,255,0.32) 100%);
  -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  border:1px solid rgba(255,255,255,0.9);
  box-shadow:inset 0 1.5px 0 rgba(255,255,255,1),inset 0 -1px 0 rgba(200,190,255,0.25),inset 0 6px 14px -8px rgba(80,70,150,0.14),0 10px 30px -12px rgba(90,80,170,0.22),0 0 0 1px rgba(120,110,200,0.06);
  transition:box-shadow .15s}
.entry:focus-within{box-shadow:inset 0 1.5px 0 rgba(255,255,255,1),inset 0 -1px 0 rgba(200,190,255,0.25),inset 0 6px 14px -8px rgba(80,70,150,0.14),0 10px 30px -12px rgba(90,80,170,0.3),0 0 0 4px rgba(129,140,248,0.26)}
.entry svg.lock{flex:none;width:22px;height:22px;color:#5b6475}
/* type=text + text-security masks input WITHOUT being a password field, so
   LastPass/1Password never attach their autofill icon. */
.entry input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#1f2937;font-size:18px;font-weight:600;font-family:inherit;letter-spacing:0.18em;padding:0;-webkit-text-security:disc;text-security:disc}
.entry input::placeholder{color:#7c8596;font-weight:400;letter-spacing:0.01em}
/* glass bubble button */
.go{flex:none;width:48px;height:48px;border:1px solid rgba(255,255,255,0.55);border-radius:50%;cursor:pointer;display:grid;place-items:center;color:#fff;position:relative;overflow:hidden;
  background:linear-gradient(150deg,#b4b2ff 0%,#8f8bf4 60%,#8580ee 100%);
  box-shadow:0 10px 20px -6px rgba(110,100,230,0.6),inset 0 1.5px 0 rgba(255,255,255,0.8),inset 0 -2px 4px rgba(90,80,200,0.35);transition:transform .12s,box-shadow .12s}
.go::before{content:"";position:absolute;left:14%;top:8%;width:62%;height:40%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,255,255,0));pointer-events:none}
.go:hover{transform:translateY(-1px);box-shadow:0 12px 24px -6px rgba(110,100,230,0.7),inset 0 1.5px 0 rgba(255,255,255,0.8),inset 0 -2px 4px rgba(90,80,200,0.35)}
.go:active{transform:translateY(0) scale(0.97)}
.go:focus-visible{outline:3px solid rgba(129,140,248,0.6);outline-offset:2px}
.go svg{width:20px;height:20px;position:relative}
.blur{position:fixed;inset:-60px;background:#fff url("${bg || ""}") center/contain no-repeat;filter:blur(22px) saturate(1.1);z-index:0}
.veil{position:fixed;inset:0;background:rgba(255,255,255,0.2);z-index:0}
.has-blur .room{position:relative;z-index:1}
html.has-blur,html.has-blur body{background:#f5f6f8}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .glass{background:rgba(255,255,255,0.9)}.entry{background:rgba(255,255,255,0.95)}}
@media (prefers-reduced-motion:reduce){.glass,.alert,.go{animation:none;transition:none}}
</style>
</head><body>
${bg ? `<div class="blur" aria-hidden="true"></div><div class="veil" aria-hidden="true"></div>` : ""}
<div class="room">
<form class="glass" method="POST" action="${esc(action)}">
  <span class="flare f1" aria-hidden="true"></span><span class="flare f2" aria-hidden="true"></span><span class="flare f3" aria-hidden="true"></span>
  <span class="flare f4" aria-hidden="true"></span><span class="flare f5" aria-hidden="true"></span><span class="flare f6" aria-hidden="true"></span><span class="flare f7" aria-hidden="true"></span>
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
