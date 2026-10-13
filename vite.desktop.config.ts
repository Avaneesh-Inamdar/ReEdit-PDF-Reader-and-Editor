import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: resolve('out/tauri'), emptyOutDir: true }
})
