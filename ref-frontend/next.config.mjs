import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  async headers() {
    return [
      {
        // Google Sign-In (GSI) uses window.postMessage between the OAuth popup
        // and this page. Next.js dev server auto-sets COOP: same-origin which
        // blocks that channel. same-origin-allow-popups permits it while still
        // isolating the page from unrelated cross-origin windows.
        source: '/signin',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  
  // CRITICAL: Generate unique build ID for cache busting
  generateBuildId: async () => {
    // Use timestamp + random for guaranteed unique builds
    return `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  },
  
  // Ensure assets are self-contained
  assetPrefix: process.env.ASSET_PREFIX || '',
  
  // Compress output
  compress: true,
  
  // Production optimizations
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
