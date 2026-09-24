import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// API_PROXY_TARGET: Docker Compose + Playwright; VITE_API_URL kept for older setups
const API_TARGET = process.env.API_PROXY_TARGET || process.env.VITE_API_URL || 'http://127.0.0.1:8001'
// A browser tab closing mid-socket is normal; don't print a stack trace for it.
const quietWs = { target: API_TARGET.replace(/^http/, 'ws'), ws: true, changeOrigin: true,
  configure: (proxy) => proxy.on('error', () => {}) }

// Vendor chunks, each listing its library's own dependencies. Groups don't absorb anything else:
// by default Rolldown pulls every dependency of a matched module into the group, so the charts group
// took React and clsx (shared with the whole app) and every page downloaded the 116 KB charts chunk.
const pkg = (names) => new RegExp(`node_modules[\\\\/](${names})[\\\\/]`)
const VENDOR_CHUNKS = [
  ['react', pkg('react|react-dom|scheduler|react-router|react-router-dom|cookie')],
  ['data', pkg('@tanstack[\\\\/](react-query|query-core)|axios|zustand')],
  ['motion', pkg('motion|framer-motion|motion-dom|motion-utils')],
  ['charts', pkg('recharts|victory-vendor|d3-[^\\\\/]+|internmap|es-toolkit|@reduxjs[\\\\/]toolkit|redux|redux-thunk|reselect|immer|react-redux|decimal\\.js-light|eventemitter3|tiny-invariant')],
  ['markdown', pkg('react-markdown|remark-[^\\\\/]+|rehype-[^\\\\/]+|micromark[^\\\\/]*|mdast-[^\\\\/]+|hast-[^\\\\/]+|hastscript|unist-[^\\\\/]+|unified|vfile[^\\\\/]*|bail|trough|devlop|property-information|space-separated-tokens|comma-separated-tokens|zwitch|decode-named-character-reference|character-entities[^\\\\/]*|html-url-attributes|estree-util-[^\\\\/]+|ccount|longest-streak|trim-lines|is-plain-obj|style-to-js|style-to-object|inline-style-parser|@ungap[\\\\/]structured-clone')],
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: app code changes don't invalidate the browser's cached React/charts.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: VENDOR_CHUNKS.map(([name, test], i) => ({ name, test, priority: VENDOR_CHUNKS.length - i })),
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
