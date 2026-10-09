import { cpSync, mkdirSync } from 'node:fs'
const root = 'src/renderer/public/pdfjs'
mkdirSync(root, { recursive: true })
for (const name of ['cmaps', 'standard_fonts']) cpSync(`node_modules/pdfjs-dist/${name}`, `${root}/${name}`, { recursive: true })
