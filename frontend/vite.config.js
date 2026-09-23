import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// API_PROXY_TARGET: Docker Compose + Playwright; VITE_API_URL kept for older setups
const API_TARGET = process.env.API_PROXY_TARGET || process.env.VITE_API_URL || 'http://127.0.0.1:8001'
// A browser tab closing mid-socket is normal; don't print a stack trace for it.
const quietWs = { target: API_TARGET.replace(/^http/, 'ws'), ws: true, changeOrigin: true,
  configure: (proxy) => proxy.on('error', () => {}) }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: app code changes don't invalidate the browser's cached React/charts
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'axios', 'zustand'],
          motion: ['motion/react'],
          charts: ['recharts'],
          markdown: ['react-markdown'],
        },
      },
    },
  },
  /*
    The UI talks to the API through this proxy (VITE_API_URL left empty), so the browser sees one
    origin: no CORS, and the refresh cookie can be SameSite=Strict + httpOnly.
    Docker Compose sets API_PROXY_TARGET=http://api:8000.
  */
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': quietWs,
    },
  },
  preview: {
    port: 3000,
    host: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': quietWs,
    },
  },
})
