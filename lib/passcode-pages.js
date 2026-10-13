// The passcode lock screen and the "access granted" beat, ported verbatim
// from Stickies (app/api/stickies/public/raw/route.ts gatePage and
// lib/share-pages.ts) so a locked share looks the same in both apps.
// Pure HTML builders: no React, no DB.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">`;

/** The black safe: title on the LCD, 1 masked field, Enter submits. With a
 *  `backdrop` (a tiny PNG data URI of the diagram) the safe sits on that
 *  diagram, blurred past reading, instead of a black room. */
export function gatePage({ action, title, bad, backdrop }) {
  const bg = typeof backdrop === "string" && backdrop.startsWith("data:image/png;base64,") ? backdrop : null;
  const alert = bad ? `<div class="alert">ACCESS DENIED</div>` : `<div class="alert hidden">&nbsp;</div>`;
  return `<!DOCTYPE html><html lang="en"${bg ? ` class="has-blur"` : ""}><head>
${HEAD}
<title>SAFE // ${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:radial-gradient(ellipse at 50% 30%,#181818 0%,#000 80%);color:#bdbdbd;font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.room{min-height:100%;display:flex;align-items:center;justify-content:center;padding:32px 20px;perspective:1400px}
.safe{position:relative;width:100%;max-width:420px;padding:38px 30px 34px;border-radius:22px;
  background:linear-gradient(145deg,#1c1c1c 0%,#0e0e0e 35%,#050505 100%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.07),
    inset 0 -1px 0 rgba(0,0,0,0.7),
    inset 0 0 0 1px rgba(255,255,255,0.025),
    0 1px 0 rgba(255,255,255,0.04),
    0 30px 60px -20px rgba(0,0,0,0.95),
    0 80px 120px -40px rgba(0,0,0,0.8);
  transform:rotateX(2deg);
}
/* brushed metal sheen */
.safe::before{content:"";position:absolute;inset:0;border-radius:22px;pointer-events:none;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,0.014) 0,rgba(255,255,255,0.014) 1px,transparent 1px,transparent 3px);
  mix-blend-mode:overlay;}
.rivet{position:absolute;width:9px;height:9px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#3a3a3a 0%,#0c0c0c 70%,#000 100%);
  box-shadow:inset 0 0.5px 1px rgba(255,255,255,0.18),0 1px 2px rgba(0,0,0,0.9);}
.rivet.tl{top:12px;left:12px}.rivet.tr{top:12px;right:12px}
.rivet.bl{bottom:12px;left:12px}.rivet.br{bottom:12px;right:12px}
.bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.brand{font-size:9px;letter-spacing:0.32em;color:#555;font-weight:700;font-family:ui-monospace,SFMono-Regular,monospace}
.brand b{color:#bdbdbd}
.status{display:flex;align-items:center;gap:8px;font-size:9px;letter-spacing:0.2em;color:#6c6c6c;font-family:ui-monospace,monospace;font-weight:700}
.led{width:9px;height:9px;border-radius:50%;display:inline-block;background:#fff;
  box-shadow:0 0 6px #fff,0 0 14px rgba(255,255,255,0.5),inset 0 -1px 1px rgba(0,0,0,0.3)}
.led-slow{animation:pulse 1.6s ease-in-out infinite}
.led-fast{animation:pulse 0.45s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
/* LCD display — black + white phosphor */
.lcd{
  background:linear-gradient(180deg,#0a0a0a 0%,#020202 100%);
  border:1px solid #1a1a1a;
  border-radius:8px;
  padding:18px 18px 16px;
  margin-bottom:22px;
  box-shadow:inset 0 2px 8px rgba(0,0,0,0.9),inset 0 0 0 1px rgba(0,0,0,0.4),0 1px 0 rgba(255,255,255,0.04);
  font-family:ui-monospace,'SF Mono',Menlo,monospace;
  position:relative;
}
.lcd::after{content:"";position:absolute;inset:0;border-radius:8px;pointer-events:none;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,0.22) 0,rgba(0,0,0,0.22) 1px,transparent 1px,transparent 2px);}
.lcd .label{font-size:9px;letter-spacing:0.32em;color:#5a5a5a;font-weight:700;margin-bottom:6px}
.lcd .name{font-size:14px;color:#f4f4f4;text-shadow:0 0 8px rgba(255,255,255,0.18);font-weight:600;word-break:break-word;line-height:1.4}
.alert{margin:-6px 0 16px;font-size:10px;letter-spacing:0.3em;color:#fff;font-weight:700;text-align:center;font-family:ui-monospace,monospace;text-shadow:0 0 10px rgba(255,255,255,0.7);animation:flash 0.5s ease-in-out 3}
@keyframes flash{0%,100%{opacity:1}50%{opacity:0.25}}
.alert.hidden{visibility:hidden;animation:none}
.entry{
  display:flex;align-items:center;
  background:linear-gradient(180deg,#0a0a0a 0%,#020202 100%);
  border:1px solid #1a1a1a;border-radius:10px;
  padding:6px 16px;
  box-shadow:inset 0 2px 6px rgba(0,0,0,0.9),0 1px 0 rgba(255,255,255,0.03);
}
/* type=text + text-security masks input WITHOUT being a password field, so
   LastPass/1Password never attach their autofill icon. */
.entry input{flex:1;background:transparent;border:0;outline:0;color:#fff;font-size:16px;font-family:ui-monospace,monospace;letter-spacing:0.25em;padding:10px 0;text-shadow:0 0 4px rgba(255,255,255,0.3);-webkit-text-security:disc;text-security:disc}
.entry input::placeholder{color:#3a3a3a;letter-spacing:0.15em;font-size:12px}
.meta{margin-top:18px;display:flex;align-items:center;justify-content:space-between;font-size:9px;letter-spacing:0.25em;color:#3a3a3a;font-family:ui-monospace,monospace;font-weight:600}
.blur{position:fixed;inset:-60px;background:#fff url("${bg || ""}") center/contain no-repeat;filter:blur(22px) saturate(1.15);z-index:0}
.veil{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(15,15,15,0.18) 0%,rgba(15,15,15,0.42) 100%);z-index:0}
.has-blur .room{position:relative;z-index:1}
html.has-blur,html.has-blur body{background:#f5f6f8}
.meta .dot{width:4px;height:4px;border-radius:50%;background:#3a3a3a;display:inline-block;margin:0 8px;vertical-align:middle}
</style>
</head><body>
${bg ? `<div class="blur" aria-hidden="true"></div><div class="veil" aria-hidden="true"></div>` : ""}
<div class="room">
<form class="safe" method="POST" action="${esc(action)}">
  <span class="rivet tl"></span><span class="rivet tr"></span>
  <span class="rivet bl"></span><span class="rivet br"></span>

  <div class="lcd">
    <div class="label">CONTENTS</div>
    <div class="name">${esc(title)}</div>
  </div>

  ${alert}

  <div class="entry">
    <input name="passcode" type="text" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" required placeholder="passcode">
  </div>
</form>
</div>
</body></html>`;
}

/** Radar sweep, SCANNING FILE -> ACCESS GRANTED, then on to the flow. The
 *  script carries the CSP nonce: Flows forbids inline script without one. */
export function unlockedPage({ target, nonce }) {
  const veil = "#ffffff";
  return `<!DOCTYPE html><html lang="en"><head>
${HEAD}
<title>ACCESS GRANTED</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;-webkit-font-smoothing:antialiased}
body{background:radial-gradient(ellipse at 50% 30%,#181818 0%,#000 80%);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.scene{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
  animation:appear .28s ease-out both,dissolve .48s ease-in 1.42s forwards}
@keyframes appear{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes dissolve{to{opacity:0;filter:blur(18px);transform:scale(1.04)}}
.veil{position:fixed;inset:0;background:${veil};opacity:0;pointer-events:none;animation:veil .55s ease-in 1.4s forwards}
@keyframes veil{to{opacity:1}}
/* radar dish: rings + crosshair etched into dark glass */
.radar{position:relative;width:46vmin;height:46vmin;max-width:340px;max-height:340px;border-radius:50%;overflow:hidden;
  background:
    repeating-radial-gradient(circle at 50% 50%,rgba(74,201,143,.16) 0 1px,transparent 1px 25%),
    linear-gradient(rgba(74,201,143,.16),rgba(74,201,143,.16)) 50% 0/1px 100% no-repeat,
    linear-gradient(rgba(74,201,143,.16),rgba(74,201,143,.16)) 0 50%/100% 1px no-repeat,
    radial-gradient(circle at 50% 50%,#0f1512 0%,#070908 70%,#000 100%);
  box-shadow:0 0 0 1px rgba(74,201,143,.22),0 0 40px rgba(74,201,143,.12),inset 0 0 40px rgba(0,0,0,.8)}
/* the beam: a thin bright edge with a long fading trail behind it */
.sweep{position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(from 0deg,rgba(74,201,143,0) 0deg,rgba(74,201,143,.05) 220deg,rgba(74,201,143,.28) 330deg,rgba(120,255,190,.9) 359deg,rgba(74,201,143,0) 360deg);
  animation:sweep 1.25s linear .15s 1 forwards;transform:rotate(0deg)}
@keyframes sweep{to{transform:rotate(720deg)}}
.center{position:absolute;top:50%;left:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#4ac98f;box-shadow:0 0 10px #4ac98f}
/* blips light up as the beam passes, then linger */
.blip{position:absolute;width:7px;height:7px;margin:-3.5px;border-radius:50%;background:#7dffbe;opacity:0;
  box-shadow:0 0 10px 2px rgba(125,255,190,.8);animation:blip 1.1s ease-out forwards}
.b1{top:32%;left:64%;animation-delay:.42s}.b2{top:66%;left:40%;animation-delay:.68s}.b3{top:44%;left:26%;animation-delay:.94s}
@keyframes blip{0%{opacity:0;transform:scale(.4)}15%{opacity:1;transform:scale(1.4)}100%{opacity:.75;transform:scale(1)}}
/* LCD readout under the dish */
.lcd{position:relative;height:18px;width:46vmin;max-width:340px;text-align:center;font-size:12px;letter-spacing:.34em;font-weight:700}
.lcd span{position:absolute;inset:0;white-space:nowrap}
.scan{color:rgba(74,201,143,.75);animation:scanTxt 1.2s steps(1) forwards}
@keyframes scanTxt{0%{opacity:1}100%{opacity:0}}
.ok{color:#7dffbe;text-shadow:0 0 12px rgba(125,255,190,.8);opacity:0;animation:okTxt .3s ease-out 1.2s forwards}
@keyframes okTxt{to{opacity:1}}
.scan i{font-style:normal;animation:dots 1.2s steps(4) infinite}
@keyframes dots{0%{content:""}}
@media (prefers-reduced-motion:reduce){.scene,.sweep,.blip,.veil,.scan,.ok{animation-duration:.01ms;animation-delay:0s}}
</style>
</head><body>
<div class="scene">
  <div class="radar">
    <div class="sweep"></div>
    <span class="blip b1"></span><span class="blip b2"></span><span class="blip b3"></span>
    <span class="center"></span>
  </div>
  <div class="lcd"><span class="scan">SCANNING FILE</span><span class="ok">ACCESS GRANTED</span></div>
</div>
<div class="veil"></div>
<script${nonce ? ` nonce="${esc(nonce)}"` : ""}>
(function(){
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      var ctx = new AC();
      var beep = function(freq, start, dur){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = freq;
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + start + 0.01);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
      };
      beep(523.25, 0.42, 0.06); beep(523.25, 0.68, 0.06); beep(523.25, 0.94, 0.06); beep(987.77, 1.2, 0.26);
    }
  } catch(e){}
  setTimeout(function(){ window.location.replace(${JSON.stringify(target)}); }, 1950);
})();
</script>
</body></html>`;
}
