import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    watch: {
      ignored: ['**/storage/**', '**/dist/**', '**/node_modules/**']
    },
    proxy: {
      '/aeo': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 600000,       // Increased to 10 minutes
        proxyTimeout: 600000   // Added proxy specific timeout
      },
      '/api': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 600000,       // Increased to 10 minutes
        proxyTimeout: 600000   // Added proxy specific timeout
      },
      '/crawl': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 600000,       // Increased to 10 minutes
        proxyTimeout: 600000   // Added proxy specific timeout
      },
      '/events': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 0,            // Keep 0 for SSE (infinite)
        ws: false,
        headers: {
          Connection: 'keep-alive',
          Accept: 'text/event-stream'
        },
      },
      '/queue': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/aeo-api': {
        target: `${process.env.PUBLIC_IP}:8000`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/aeo-api/, '/api'),
        timeout: 600000,       // Increased to 10 minutes
        proxyTimeout: 600000   // Added proxy specific timeout
      },
      '/aeo-health': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/aeo-health/, '/health'),
        timeout: 60000,
      }
    }
  },
  build: {
    outDir: 'dist-frontend',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
})