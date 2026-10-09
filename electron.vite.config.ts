import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts'), pdfEngineWorker: resolve('src/main/pdfEngineWorker.ts') },
        external: ['electron-store', 'mupdf', '@signpdf/signpdf', '@signpdf/placeholder-pdf-lib', '@signpdf/signer-p12', 'pdf-lib', 'docx']
      }
    }
  },
  preload: {},
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
    worker: {
      format: 'es'
    }
  }
})
