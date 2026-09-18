import '../src/index.css'

// The static head that index.html used to carry. Per-design title/description
// and the share card are set by each page's generateMetadata instead.
export const metadata = {
  metadataBase: new URL(process.env.FLOWS_APP_URL || 'https://flows-bheng.vercel.app'),
  title: 'Flows',
  description: 'Interactive AWS/GCP architecture diagram tool with an AI-callable artifact API.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/icon-180.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Flows' },
  openGraph: {
    type: 'website',
    siteName: 'Flows',
    title: 'Flows',
    description: 'Interactive AWS & GCP architecture diagram tool with an AI-callable artifact API.',
    url: '/',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flows',
    description: 'Interactive AWS & GCP architecture diagram tool with an AI-callable artifact API.',
    images: ['/og.png'],
  },
}

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1c1e21' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
