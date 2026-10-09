import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: { proxy: { '/api': 'http://127.0.0.1:3001', '/socket.io': { target: 'http://127.0.0.1:3001', ws: true } } },
  build: { chunkSizeWarningLimit: 650 },
  plugins: [react()],
})
