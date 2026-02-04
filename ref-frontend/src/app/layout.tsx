import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import "./globals.css"
import { Dancing_Script, Caveat } from "next/font/google"
import { StoreProvider } from "@/store/StoreProvider"

// Commented out to avoid Docker build timeout issues
const dancingScript = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing-script",
  display: "swap",
})

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
})

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
      <body className="font-sans antialiased">
        <StoreProvider>
          <Suspense fallback={null}>
            {children}
          </Suspense>
        </StoreProvider>
      </body>
    </html>
  )
}
