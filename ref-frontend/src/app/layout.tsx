import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { Toaster } from "sonner"
import "./globals.css"
import { StoreProvider } from "@/store/StoreProvider"

// Fonts removed to avoid Docker build timeout issues with Google Fonts API
// If needed, fonts can be loaded via CDN in production or self-hosted

export const metadata: Metadata = {
  title: "Contentlytics - Enterprise SEO & AEO Intelligence Platform",
  description:
    "Powerful web crawler with AI-powered SEO/AEO analysis. Discover every page, optimize for search engines and AI bots, generate Schema.org markup, and gain competitive intelligence.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans antialiased">
        <StoreProvider>
          <Suspense fallback={null}>
            {children}
          </Suspense>
          <Toaster richColors position="top-right" />
        </StoreProvider>
      </body>
    </html>
  )
}
