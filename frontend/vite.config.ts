import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend and AEO API URLs for dev proxy (default: local services)
const BACKEND_TARGET = process.env.VITE_PROXY_BACKEND || 'http://localhost:3004'
const AEO_API_TARGET = process.env.VITE_PROXY_AEO_API || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**']
    },
    proxy: {
      '/aeo': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        timeout: 600000,
        proxyTimeout: 600000
      },
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        timeout: 600000,
        proxyTimeout: 600000
      },
      '/crawl': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        timeout: 600000,
        proxyTimeout: 600000
      },
      '/events': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        timeout: 0,
        ws: false,
        headers: {
          Connection: 'keep-alive',
          Accept: 'text/event-stream'
        },
      },
      '/queue': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/aeo-api': {
        target: AEO_API_TARGET,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/aeo-api/, '/api'),
        timeout: 600000,
        proxyTimeout: 600000
      },
      '/aeo-health': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/aeo-health/, '/health'),
        timeout: 60000,
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
})
