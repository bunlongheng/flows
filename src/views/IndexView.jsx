import { useEffect, useRef } from 'react'
import { Toast } from '../components/Toast'
import { DiagramCard } from '../components/DiagramCard'
import { AIThinkingOverlay } from '../components/AIThinkingOverlay'
import ImportFormatsModal from '../components/ImportFormatsModal'
import { usePullToRefresh } from '../usePullToRefresh'
import { Footer } from '../components/Footer'

const GITHUB_AVATAR = 'https://avatars.githubusercontent.com/u/11523064?v=4'
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'

// ─── Index (gallery) view ───────────────────────────────────────────────────

export function IndexView({
  toast, showToastMsg,
  search, setSearch,
  user, canAI, isDemo, listError,
  galleryTab, setGalleryTab,
  scope, setScope, scopeCounts,
  showMenu, setShowMenu, menuRef,
  showDocs, setShowDocs,
  copiedLabel, onCopyFormat,
  filtered, onRefresh,
  onOpen, onViewCode, onDeleteDiagram,
  signOut,
  showAIPrompt, setShowAIPrompt,
  aiPrompt, setAiPrompt, aiThinking, aiInputRef, submitAI,
  codeDiagram, setCodeDiagram, codeCopied, setCodeCopied,
}) {
  const aiDialogRef = useRef(null)
  const aiPreviousFocusRef = useRef(null)
  const { distance: pullDist, refreshing } = usePullToRefresh(onRefresh)

  function openAIPrompt() {
    aiPreviousFocusRef.current = document.activeElement
    setShowAIPrompt(true)
  }

  // Restore focus to whatever triggered the AI prompt dialog once it closes.
  // (Focus is moved into the dialog's textarea by the existing effect in App.jsx.)
  useEffect(() => {
    if (!showAIPrompt) aiPreviousFocusRef.current?.focus?.()
  }, [showAIPrompt])

  function handleAIDialogKeyDown(e) {
    if (e.key !== 'Tab') return
    const focusables = aiDialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR)
    if (!focusables || !focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <Toast message={toast.message} visible={toast.visible} />
      <style>{`
        @keyframes sd-spin { to { transform: rotate(360deg); } }
        /* One gallery grid for BOTH the owner index and /demo, so they look the
           same: 4 desktop, 3 on laptop, 2 on iPad portrait + phone. */
        .sd-grid-demo { grid-template-columns: repeat(4, 1fr) !important; }
        @media (max-width: 1280px) { .sd-grid-demo { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (max-width: 1024px) { .sd-grid-demo { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 480px) { .sd-grid-demo { grid-template-columns: 1fr !important; } }
        @media (max-width: 640px) {
          .sd-header { padding: 0 16px !important; }
          /* The inner bar kept its own 32px, so the logo sat 48px in while the
             cards started at 16px. Same gutter as .sd-main now. */
          .sd-header-inner { padding: 0 !important; gap: 12px !important; }
          /* An app mark at 28px reads like a favicon on a phone. */
          .sd-app-logo { width: 40px !important; height: 40px !important; border-radius: 11px !important; }
          .sd-search-wrap { flex: 1 !important; width: auto !important; }
          .sd-search-wrap input { width: 100% !important; }
          .sd-main { padding: 16px 16px 100px !important; }
        }
      `}</style>

      {/* Pull-to-refresh spinner (iPad: drag down at the top of the list) */}
      {(pullDist > 0 || refreshing) && (
        <div style={{
          position: 'fixed', top: 56, left: 0, right: 0, display: 'flex', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 9,
          transform: `translateY(${Math.max(0, (refreshing ? 70 : pullDist) - 20)}px)`,
          transition: refreshing || pullDist === 0 ? 'transform 0.2s ease' : 'none',
        }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#ffffff', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth={2.4} strokeLinecap="round"
              style={{
                transformOrigin: '50% 50%',
                animation: refreshing ? 'sd-spin 0.7s linear infinite' : 'none',
                transform: refreshing ? 'none' : `rotate(${pullDist * 2.6}deg)`,
                opacity: refreshing ? 1 : Math.min(1, pullDist / 70),
              }}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sd-header" style={{ background: '#ffffff', borderBottom: '1px solid #e4e6e8', height: 56, paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box', position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="sd-header-inner" style={{ maxWidth: 1600, margin: '0 auto', padding: '0 32px', height: '100%', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <img className="sd-app-logo" src="/icon-96.png" width={28} height={28} alt="" style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1c1e21', letterSpacing: '-0.01em' }}>Flows</span>
            {isDemo && <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eaf2ff', borderRadius: 999, padding: '3px 9px' }}>Demos</span>}
          </div>

          {/* Search - owner only, hidden on the public demo page */}
          {!isDemo && (
            <div className="sd-search-wrap" style={{ position: 'relative', width: 260 }}>
              <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8a8d91' }} width={13} height={13} viewBox="0 0 20 20" fill="none">
                <circle cx={9} cy={9} r={6} stroke="currentColor" strokeWidth={1.8} />
                <path d="M14 14l3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                style={{ width: '100%', padding: '7px 14px 7px 32px', boxSizing: 'border-box', border: '1px solid #e4e6e8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#1c1e21', background: '#f4f5f7' }} />
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Demos / My Diagrams tab toggle - owner only, top-right button group,
              same header row (no new row). Public /demo never shows it. */}
          {!isDemo && canAI && (
            <div style={{ display: 'inline-flex', background: '#f0f1f3', borderRadius: 9, padding: 3, flexShrink: 0 }}>
              {[['mine', 'My Diagrams'], ['demos', 'Demos']].map(([key, label]) => (
                <button key={key} onClick={() => setGalleryTab(key)}
                  style={{
                    padding: '6px 13px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                    border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: galleryTab === key ? '#ffffff' : 'transparent',
                    color: galleryTab === key ? '#1c1e21' : '#8a8d91',
                    boxShadow: galleryTab === key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    transition: 'background 0.15s, color 0.15s',
                  }}>{label}</button>
              ))}
            </div>
          )}

          {/* Work vs personal. Owner's own diagrams only - the demo roster is
              neither, so the filter would just be noise there. */}
          {!isDemo && canAI && galleryTab !== 'demos' && (
            <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0, marginRight: 8 }}>
              {[['all', 'All'], ['work', 'Work'], ['personal', 'Personal']].map(([key, label]) => (
                <button key={key} onClick={() => setScope(key)}
                  title={`${scopeCounts?.[key] ?? 0} diagram${(scopeCounts?.[key] ?? 0) === 1 ? '' : 's'}`}
                  style={{
                    padding: '5px 11px', fontSize: 12, fontWeight: scope === key ? 700 : 500,
                    fontFamily: 'inherit', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${scope === key ? '#1c1e21' : '#e4e6e8'}`,
                    background: scope === key ? '#1c1e21' : '#fff',
                    color: scope === key ? '#fff' : '#65676b',
                    transition: 'all 0.12s',
                  }}>
                  {label}
                  <span style={{ marginLeft: 6, opacity: 0.65, fontWeight: 600 }}>{scopeCounts?.[key] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          {/* Avatar / Menu - owner only */}
          {!isDemo && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowMenu(v => !v)}
              style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', border: showMenu ? '2px solid #1c1e21' : '2px solid #e4e6e8', cursor: 'pointer', padding: 0, background: '#e4e6e8', transition: 'border-color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1e21', userSelect: 'none' }}>B</span>
              <img src={GITHUB_AVATAR} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            </button>
            {showMenu && (
              <div style={{ position: 'absolute', top: 42, right: 0, width: 210, background: '#ffffff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid #e4e6e8', overflow: 'hidden', zIndex: 50 }}>
                <div style={{ padding: '14px 16px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1c1e21' }}>{user ? 'Bunlong Heng' : 'Flows'}</div>
                  <div style={{ fontSize: 11, color: '#8a8d91', marginTop: 3 }}>{user ? user.email : 'Not signed in'}</div>
                </div>
                <div style={{ height: 1, background: '#f0f1f3' }} />
                <button onClick={() => { setShowDocs(true); setShowMenu(false); }}
                  style={{ width: '100%', padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1c1e21', fontFamily: 'inherit', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ fontSize: 14 }}>＋</span> Create a diagram
                </button>
                {canAI && (
                  <button onClick={() => { openAIPrompt(); setShowMenu(false); }}
                    style={{ width: '100%', padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1c1e21', fontFamily: 'inherit', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ fontSize: 14 }}>✦</span> Generate with AI
                  </button>
                )}
                <div style={{ height: 1, background: '#f0f1f3' }} />
                {user ? (
                  <button onClick={() => { signOut(); setShowMenu(false); }}
                    style={{ width: '100%', padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#dc2626', fontFamily: 'inherit', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ fontSize: 14 }}>↪</span> Sign out
                  </button>
                ) : (
                  <a href="/api/auth/login"
                    style={{ width: '100%', padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1c1e21', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', boxSizing: 'border-box' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f4f5f7')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ fontSize: 14 }}>🔑</span> Sign in with Google
                  </a>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="sd-main" style={{ padding: isDemo ? '32px 32px 60px' : '32px 32px 100px', maxWidth: 1600, margin: '0 auto', width: '100%', boxSizing: 'border-box', flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ position: 'fixed', inset: 0, top: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: '#f4f5f7' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#e4e6e8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
            </div>
            <p style={{ fontSize: 14, color: '#1c1e21', fontWeight: 600, margin: 0 }}>{search ? 'No diagrams found' : 'No diagrams yet'}</p>
            <p style={{ fontSize: 13, color: '#8a8d91', marginTop: 6 }}>{search ? 'Try a different search' : 'Paste Mermaid code to get started'}</p>
          </div>
        )}

        {/* An unreachable API used to look exactly like "you have 1 diagram":
            it fell through to the bundled sample and said nothing. Now it says
            so, and the sample below carries no delete button. */}
        {listError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            padding: '11px 14px', borderRadius: 10,
            background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
            fontSize: 13, fontWeight: 600,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Could not reach the API, so your saved diagrams are not listed. The sample below is bundled with the app, not saved.</span>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="sd-grid sd-grid-demo" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {filtered.map(d => (
              <DiagramCard
                key={d.id}
                diagram={d.data}
                title={d.title}
                updatedAt={d.updatedAt}
                tags={d.tags}
                showBrand
                difficulty={d.difficulty}
                onOpen={() => onOpen(d)}
                onViewCode={canAI ? () => onViewCode(d) : undefined}
                onDelete={canAI && !d.sample ? () => onDeleteDiagram(d.id) : undefined}
                isPrivate={canAI && d.is_public === false}
              />
            ))}
          </div>
        )}
      </main>

      {/* Public footer - demo landing only, pinned so it's always visible */}
      {isDemo && <Footer fixed />}

      {/* ── FAB ── */}
      {canAI && (
        <button onClick={openAIPrompt} title="Generate with AI"
          style={{ position: 'fixed', bottom: 'calc(32px + env(safe-area-inset-bottom))', right: 32, width: 52, height: 52, borderRadius: '50%', background: '#1c1e21', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: 'none', cursor: 'pointer', fontSize: 24, color: '#fff', transition: 'transform 0.15s, box-shadow 0.15s', zIndex: 5 }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(0,0,0,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)' }}
        >✦</button>
      )}

      {/* ── AI Prompt Modal ── */}
      {aiThinking && <AIThinkingOverlay />}
      {showAIPrompt && !aiThinking && (
        <div onClick={() => setShowAIPrompt(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)' }}>
          <div onClick={e => e.stopPropagation()} onKeyDown={handleAIDialogKeyDown} ref={aiDialogRef} role="dialog" aria-modal="true" style={{ background: '#ffffff', borderRadius: 20, padding: '32px 32px 28px', width: 520, boxShadow: '0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1c1e21', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1c1e21', margin: 0 }}>Generate with AI</h3>
                <p style={{ fontSize: 12, color: '#8a8d91', margin: 0 }}>Describe your system and Claude will build the diagram</p>
              </div>
            </div>
            <textarea
              ref={aiInputRef}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAI(); if (e.key === 'Escape') setShowAIPrompt(false); }}
              placeholder='e.g. "Netflix streaming architecture with CDN, load balancer, microservices, and caching layers"'
              rows={4}
              style={{ width: '100%', padding: '12px 14px', fontSize: 14, border: '1.5px solid #e4e6e8', borderRadius: 12, fontFamily: 'inherit', resize: 'none', color: '#1c1e21', background: '#f8f9fa', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
            <p style={{ fontSize: 11, color: '#bcc0c4', margin: '8px 0 20px' }}>Cmd + Enter to generate</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAIPrompt(false)} style={{ padding: '10px 20px', border: '1px solid #e4e6e8', borderRadius: 10, background: '#f4f5f7', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#65676b' }}>Cancel</button>
              <button onClick={submitAI} disabled={!aiPrompt.trim() || aiThinking} style={{ padding: '10px 24px', background: aiPrompt.trim() ? '#1c1e21' : '#e4e6e8', color: aiPrompt.trim() ? '#fff' : '#8a8d91', border: 'none', borderRadius: 10, cursor: aiPrompt.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'background 0.15s' }}>
                {aiThinking ? 'Generating...' : 'Generate ✦'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Formats Modal ── */}
      <ImportFormatsModal
        open={showDocs}
        onClose={() => setShowDocs(false)}
        copiedLabel={copiedLabel}
        onCopy={onCopyFormat}
      />

      {/* ── Code slide-in panel ── */}
      {codeDiagram && (
        <div onClick={() => { setCodeDiagram(null); setCodeCopied(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 420, maxWidth: '90vw',
            background: '#ffffff', boxShadow: '8px 0 32px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column',
            animation: 'sd-slide-left 0.2s ease-out',
          }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e4e6e8', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1e21', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{codeDiagram.title}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(codeDiagram.data, null, 2)).then(() => {
                    setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000)
                  }).catch(() => showToastMsg('Copy failed'))
                }}
                style={{ background: codeCopied ? '#22c55e' : '#f4f5f7', border: '1px solid #e4e6e8', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: codeCopied ? '#fff' : '#65676b', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
              >{codeCopied ? 'Copied!' : 'Copy'}</button>
              <button onClick={() => { setCodeDiagram(null); setCodeCopied(false); }} aria-label="Close" style={{ background: 'none', border: 'none', color: '#8a8d91', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
              <pre style={{
                margin: 0, padding: '16px 20px', fontSize: 12, lineHeight: 1.75, color: '#1c1e21',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{JSON.stringify(codeDiagram.data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
