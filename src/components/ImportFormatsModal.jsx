import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'

// ─── Import Formats Modal ──────────────────────────────────────────────────

export default function ImportFormatsModal({ open, onClose, copiedLabel, onCopy }) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  // Move focus into the dialog when it opens, and restore it to whatever
  // triggered the open once the dialog closes.
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      dialogRef.current?.querySelector(FOCUSABLE_SELECTOR)?.focus()
    } else {
      previousFocusRef.current?.focus?.()
    }
  }, [open])

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return
    const focusables = dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR)
    if (!focusables || !focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
      <div onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} ref={dialogRef} role="dialog" aria-modal="true" style={{ background: '#ffffff', borderRadius: 16, padding: '28px 32px', width: 560, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1c1e21', margin: 0 }}>Create a diagram</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#8a8d91', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: '#65676b', margin: '0 0 20px', lineHeight: 1.6 }}>Just ask an AI agent, paste a Mermaid graph, or POST the API. Every node must be a real service (the create step rejects unknown ids).</p>
        {[
          { label: 'Ask an AI agent', tag: 'MCP', tagColor: '#16a34a', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', code: `"Create a flow for a URL shortener"\n\nAny MCP agent uses the flows server:\n  list_services         valid node keys\n  get_diagram_schema    the { title, nodes, edges } shape\n  create_flow           builds it, returns the URL` },
          { label: 'Paste Mermaid', tag: 'Cmd+V', tagColor: '#6366f1', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2', code: `graph LR\n  user[User] --> apigw[API Gateway]\n  apigw --> lambda[Lambda]\n  lambda --> dynamo[DynamoDB]` },
          { label: 'HTTP API', tag: 'Bearer', tagColor: '#0ea5e9', icon: 'M4 17l6-6-6-6M12 19h8', code: `curl -X POST /api/ai/flows \\\n  -H "Authorization: Bearer $SECRET" \\\n  -d '{"title":"URL Shortener",\n       "nodes":[{"id":"user"},{"id":"apigw"},{"id":"lambda"}],\n       "edges":[{"source":"user","target":"apigw"},\n                {"source":"apigw","target":"lambda"}]}'` },
        ].map(({ label, tag, tagColor, icon, code }) => (
          <div key={label} style={{ marginBottom: 16, border: `1px solid ${tagColor}33`, borderRadius: 12, overflow: 'hidden', background: '#ffffff', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
            {/* Panel header: icon + title + tag, Copy on the right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: `${tagColor}12`, borderBottom: `1px solid ${tagColor}22` }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: tagColor, flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1e21' }}>{label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: tagColor, background: `${tagColor}1c`, borderRadius: 5, padding: '2px 7px' }}>{tag}</span>
              <button
                onClick={() => onCopy(label, code)}
                style={{ marginLeft: 'auto', background: copiedLabel === label ? tagColor : '#ffffff', border: `1px solid ${tagColor}44`, borderRadius: 6, padding: '3px 11px', fontSize: 11, fontWeight: 600, color: copiedLabel === label ? '#ffffff' : tagColor, cursor: 'pointer', transition: 'all 0.15s' }}
              >{copiedLabel === label ? 'Copied!' : 'Copy'}</button>
            </div>
            <pre style={{ margin: 0, padding: '12px 14px', background: '#fbfcfe', fontSize: 11, color: '#1c1e21', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre' }}>{code}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}
