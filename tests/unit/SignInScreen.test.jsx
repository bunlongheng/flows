// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, it, expect, vi } from 'vitest'
import SignInScreen from '../../src/components/SignInScreen.jsx'

afterEach(cleanup)

describe('SignInScreen', () => {
  it('renders the title, Google button, and the self-drawing architecture graph', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Flows')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    const nodes = document.querySelectorAll('.si-node')
    expect(nodes.length).toBe(12)
  })

  it('hides the card in loading mode (shows only the architecture graph)', () => {
    render(<SignInScreen loading />)
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.si-node').length).toBe(12)
  })

  it('offers a dev bypass that fires the callback', async () => {
    const onBypass = vi.fn()
    render(<SignInScreen devBypass={onBypass} />)
    const btn = screen.getByText(/Continue without signing in/i)
    await userEvent.setup().click(btn)
    expect(onBypass).toHaveBeenCalledOnce()
  })
})
