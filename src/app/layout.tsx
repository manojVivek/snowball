import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Container } from '@/components/elements/container'
import { Main } from '@/components/elements/main'
import { SnowballLogo } from '@/components/icons/snowball-logo'

export const metadata: Metadata = {
  title: 'Snowball - Reinvest Your Dividends Smartly',
  description:
    'A privacy-first tool to calculate how to reinvest your dividends. Upload your Zerodha Tax P&L report and get buy recommendations.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light only" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* Minimal Header */}
        <header className="py-4 sm:py-6">
          <Container>
            <a href="/" className="flex items-center justify-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity">
              <SnowballLogo className="size-8 sm:size-10 rounded-lg" />
              <h1 className="font-display text-xl sm:text-2xl tracking-tight text-olive-950 dark:text-white">
                Snowball<span className="text-olive-400">.</span>
              </h1>
            </a>
          </Container>
        </header>

        {/* Main Content */}
        <Main className="flex-1">{children}</Main>

        {/* Minimal Footer */}
        <footer className="py-6 sm:py-8 border-t border-olive-950/5 dark:border-white/5">
          <Container>
            <div className="text-center text-xs sm:text-sm text-olive-600 dark:text-olive-400 space-y-2">
              <p>Your dividend data is processed entirely in your browser. Only stock symbols are sent to fetch prices.</p>
              <p className="text-olive-400">
                © 2025 Snowball · Made by{' '}
                <a
                  href="https://manojvivek.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-olive-600 dark:hover:text-olive-300 transition-colors"
                >
                  Manoj Vivek
                </a>
                {' '}·{' '}
                <a
                  href="https://github.com/manojVivek/snowball"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-olive-600 dark:hover:text-olive-300 transition-colors"
                >
                  GitHub
                </a>
              </p>
            </div>
          </Container>
        </footer>

        {/* Kite Publisher Script for direct order placement */}
        <Script src="https://kite.trade/publisher.js?v=3" strategy="lazyOnload" />

        {/* Umami Analytics - anonymous pageview tracking */}
        <Script
          defer
          src="https://umami.responsively.app/script.js"
          data-website-id="fdc3184c-3a70-484c-9359-cf02c7eac6a7"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
