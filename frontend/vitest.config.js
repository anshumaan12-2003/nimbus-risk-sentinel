import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(process.env.API_URL || 'http://127.0.0.1:8000') },
  test: { include: ['src/**/*.test.{js,jsx}'], environment: 'jsdom', setupFiles: ['./src/__tests__/setup.js'], css: false, testTimeout: 20000 },
})
