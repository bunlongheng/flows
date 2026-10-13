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
html,body{height:100%;background:linear-gradient(160deg,#f7f8fb 0%,#e9ecf3 100%);color:#1c1e21;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.room{min-height:100%;display:flex;align-items:center;justify-content:center;padding:32px 16px}
.glass{position:relative;width:max-content;min-width:min(440px,calc(100vw - 32px));max-width:min(760px,calc(100vw - 32px));padding:40px 40px 32px;border-radius:22px;text-align:center;
  background:rgba(255,255,255,0.86);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);
  box-shadow:0 24px 70px rgba(30,45,90,0.18),0 0 0 1px rgba(30,45,90,0.06),inset 0 1px 0 rgba(255,255,255,0.9)}
.logo{display:block;margin:0 auto 18px;width:60px;height:60px;border-radius:16px;box-shadow:0 8px 22px rgba(28,30,33,0.28)}
.caption{font-size:13.5px;color:#6b7280;margin-top:8px;line-height:1.5}
.name{font-size:27px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.alert{margin:18px 0 0;font-size:13.5px;font-weight:600;color:#d92d20;animation:shake 0.4s ease-in-out}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
.alert.hidden{visibility:hidden;animation:none}
.entry{margin-top:12px;display:flex;background:#fff;border:1px solid #e2e6ee;border-radius:12px;padding:0 14px;box-shadow:0 2px 8px rgba(20,30,60,0.06);transition:box-shadow .15s,border-color .15s}
.entry:focus-within{border-color:#6366f1;box-shadow:0 0 0 4px rgba(99,102,241,0.2)}
/* type=text + text-security masks input WITHOUT being a password field, so
   LastPass/1Password never attach their autofill icon. */
.entry input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#1f2937;font-size:16px;font-weight:600;font-family:inherit;letter-spacing:0.2em;text-align:center;padding:12px 0;-webkit-text-security:disc;text-security:disc}
.entry input::placeholder{color:#9aa3b2;font-weight:400;letter-spacing:0.02em}
.blur{position:fixed;inset:-60px;background:#fff url("${bg || ""}") center/contain no-repeat;filter:blur(22px) saturate(1.1);z-index:0}
.veil{position:fixed;inset:0;background:rgba(255,255,255,0.45);z-index:0}
.has-blur .room{position:relative;z-index:1}
html.has-blur,html.has-blur body{background:#f5f6f8}
</style>
</head><body>
${bg ? `<div class="blur" aria-hidden="true"></div><div class="veil" aria-hidden="true"></div>` : ""}
<div class="room">
<form class="glass" method="POST" action="${esc(action)}">
  <img class="logo" src="/icon.png" alt="Flows" width="60" height="60">
  <div class="name">${esc(title)}</div>
  <div class="caption">Protected diagram</div>
  ${alert}

  <div class="entry">
    <input name="passcode" type="text" autofocus autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" required placeholder="Passcode">
  </div>
</form>
</div>
</body></html>`;
}
