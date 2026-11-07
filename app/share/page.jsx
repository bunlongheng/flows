import AppClient from '../AppClient.jsx'
import { designMetadata } from '../share-metadata.js'

// A shared link (/?id=<uuid> or /?name=<slug>) lands here through the rewrite
// in next.config.mjs, so the bare home page can stay static while a shared
// design still gets its own card. The browser keeps the /?id= URL.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }) {
  return designMetadata(searchParams, '/')
}

export default function Page() {
  return <AppClient />
}
