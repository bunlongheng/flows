'use client'

import dynamic from 'next/dynamic'
import CrashGuard from '../src/components/CrashGuard.jsx'

// The canvas is a browser thing end to end - React Flow measures real DOM nodes,
// and the app reads window.location to decide which view it is on. There is
// nothing to server-render, and trying threw "window is not defined" on every
// request. Rendering it client-side only is the honest description of what it is.
//
// The parts that MUST be server-rendered - the share card's title and image -
// are metadata, and generateMetadata handles those independently of this.
//
// While the bundle downloads (a slow phone can take seconds) the visitor sees
// a "Loading diagram" line, never a bare blank page. That line is server-rendered,
// so it shows even when a chunk fails and no app JavaScript runs at all (#614).
const App = dynamic(() => import('../src/App.jsx'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeContent: 'center', gap: 14, textAlign: 'center', fontSize: 15 }}>
      <div style={{ opacity: 0.6 }}>Loading diagram...</div>
      {/* href="" is this same URL: a reload that works with no JavaScript */}
      <a href="" className="sd-slow-hint" style={{ color: '#1c1e21' }}>Taking too long? Reload</a>
    </div>
  ),
})

export default function AppClient() {
  return <CrashGuard><App /></CrashGuard>
}
