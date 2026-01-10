import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    watch:{
      ignored: ['**/storage/**', '**/dist/**', '**/node_modules/**']
    },
    proxy: {
      '/aeo': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/api': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/crawl': {
        target: `${process.env.PUBLIC_IP}:3004`,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
      },
      '/events': {
        target: `${process.env.PUBLIC_IP}:3004`,
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
        timeout: 60000,
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
