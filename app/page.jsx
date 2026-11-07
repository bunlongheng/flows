import AppClient from './AppClient.jsx'

// Static: prerendered at build time and served from the CDN, so a bot or an
// uptime probe hitting / costs no function. A shared link (/?id= or /?name=)
// is rewritten to /share, which renders the per-design card.
export default function Page() {
  return <AppClient />
}
