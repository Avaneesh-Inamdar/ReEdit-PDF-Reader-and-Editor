#!/usr/bin/env node
// WHY: bundle Tesseract assets locally so OCR works offline with no CDN dependency (spec §1)
const fs = require('fs')
const path = require('path')
const https = require('https')

const ENG_URL = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata'
// fallback mirror
const ENG_URL_FALLBACK = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata'

const targets = [
  path.join(__dirname, '..', 'public', 'tessdata'),
  path.join(__dirname, '..', 'src', 'renderer', 'public', 'tessdata'),
]

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        file.close(); fs.unlinkSync(dest)
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(dest) } catch {}
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    })
    req.on('error', (e) => { try { file.close(); fs.unlinkSync(dest) } catch {}; reject(e) })
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')) })
  })
}

function copyLocalAssets() {
  const copies = [
    { src: path.join(__dirname, '..', 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'), dstName: 'worker.min.js' },
    { src: path.join(__dirname, '..', 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm.js'), dstName: 'tesseract-core.wasm.js' },
    { src: path.join(__dirname, '..', 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm'), dstName: 'tesseract-core.wasm' },
  ]
  for (const dir of targets) {
    ensureDir(dir)
    for (const { src, dstName } of copies) {
      if (fs.existsSync(src)) {
        const dst = path.join(dir, dstName)
        try { fs.copyFileSync(src, dst); console.log(`copied ${dstName} -> ${dir}`) } catch (e) { console.warn(`copy failed ${src}: ${e.message}`) }
      } else {
        console.warn(`missing local asset ${src}`)
      }
    }
  }
}

async function fetchEng(dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500000) {
    console.log(`eng.traineddata already exists at ${dest} (${fs.statSync(dest).size} bytes) — skipping download`)
    return true
  }
  for (const url of [ENG_URL, ENG_URL_FALLBACK]) {
    try {
      console.log(`fetching eng.traineddata from ${url} -> ${dest}`)
      await download(url, dest)
      if (fs.existsSync(dest) && fs.statSync(dest).size > 500000) {
        console.log(`downloaded eng.traineddata ${fs.statSync(dest).size} bytes`)
        return true
      }
    } catch (e) {
      console.warn(`download failed from ${url}: ${e.message}`)
    }
  }
  return false
}

async function main() {
  copyLocalAssets()
  let okAny = false
  for (const dir of targets) {
    ensureDir(dir)
    const dest = path.join(dir, 'eng.traineddata')
    const ok = await fetchEng(dest)
    if (ok) okAny = true
    else console.warn(`Failed to fetch eng.traineddata for ${dir} — offline OCR will be degraded until file is present. Place eng.traineddata manually from https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata`)
  }
  if (!okAny) console.warn('No eng.traineddata fetched — run again with network or manually copy file.')
  else console.log('tessdata setup complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
