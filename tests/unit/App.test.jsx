// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import App from '../../src/App.jsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

// Mock the two mount fetches (/api/auth/me + /api/flows) so the
// sign-in gate can be exercised without a server.
function mockFetch(map) {
  global.fetch = vi.fn((url) => {
    const key = Object.keys(map).find(k => String(url).includes(k))
    const r = key ? map[key] : { status: 404, json: {} }
    return Promise.resolve({ ok: r.status < 400, status: r.status, json: () => Promise.resolve(r.json) })
  })
}

describe('App sign-in gate', () => {
  beforeEach(() => { window.history.replaceState({}, '', '/') })

  it('shows the sign-in screen when signed out, in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      mockFetch({
        '/api/auth/me': { status: 200, json: { authenticated: false } },
        '/api/flows': { status: 401, json: {} },
      })
      render(<App />)
      await waitFor(() => expect(screen.getByText('Continue with Google')).toBeInTheDocument())
    } finally { vi.unstubAllEnvs() }
  })

  // Google never sends a browser back to a local origin and the API trusts
  // localhost, so a local build skips the card and lands on the gallery.
  it('lands on the gallery signed out in a local build', async () => {
    mockFetch({
      '/api/auth/me': { status: 200, json: { authenticated: false } },
      '/api/flows': { status: 200, json: [] },
    })
    render(<App />)
    await waitFor(() => expect(screen.getByPlaceholderText(/Search/)).toBeInTheDocument())
    expect(screen.queryByText('Continue with Google')).toBeNull()
  })

  it('shows the gallery (not the sign-in card) when signed in', async () => {
    mockFetch({
      '/api/auth/me': { status: 200, json: { authenticated: true, email: 'owner@example.com' } },
      '/api/flows': { status: 200, json: [] },
    })
    render(<App />)
    await waitFor(() => expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument())
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument()
  })
})
