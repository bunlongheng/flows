import { Component } from 'react'

// Without this, any throw while rendering unmounts the whole app and the visitor
// is left on a blank white page with no way to tell what happened (#614).
// A stale chunk (a tab opened before a deploy) reloads once by itself; anything
// else shows a reload card and is reported to the server log.
const STALE_CHUNK = /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i
const RELOADED = 'flows-chunk-reload'

function reportCrash(error) {
  try {
    const body = JSON.stringify({
      message: String(error?.message || error).slice(0, 500),
      stack: String(error?.stack || '').slice(0, 2000),
      url: location.href.slice(0, 300),
    })
    navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))
  } catch { /* reporting must never throw */ }
}

function reloadOnceForStaleChunk(error) {
  if (!STALE_CHUNK.test(String(error?.message || error))) return false
  try {
    const last = Number(sessionStorage.getItem(RELOADED) || 0)
    if (Date.now() - last < 30000) return false
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch { return false }
  location.reload()
  return true
}

export default class CrashGuard extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    if (!reloadOnceForStaleChunk(error)) reportCrash(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>This diagram did not load</div>
          <div style={{ fontSize: 15, opacity: 0.75, marginBottom: 20 }}>Reload the page to try again.</div>
          <button onClick={() => location.reload()} style={{ fontSize: 16, padding: '10px 22px', borderRadius: 10, border: 0, background: '#ff9900', color: '#111', fontWeight: 600, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
