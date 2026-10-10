const { app, BrowserWindow, dialog } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const { PDFDocument } = require('pdf-lib')
const directory = resolve(process.env.READIT_141_OUTPUT || 'release/smoke-1.4.1')
mkdirSync(directory, { recursive: true })
app.setPath('userData', join(directory, 'profile-' + Date.now()))
let window,
  destination = null
const errors = [],
  checks = []
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
dialog.showSaveDialog = async () => ({ canceled: !destination, filePath: destination })
dialog.showMessageBox = async () => ({ response: 1 })
dialog.showErrorBox = (title, message) => errors.push(`${title}: ${message}`)
app.on('browser-window-created', (_, candidate) => {
  if (!window) {
    window = candidate
    candidate.webContents.on('console-message', (event) => console.log('renderer', event.message))
  }
})
require(
  process.env.READIT_141_APP
    ? resolve(process.env.READIT_141_APP, 'out/main/index.js')
    : '../out/main/index.js'
)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function wait(expression, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return
    await pause(100)
  }
  throw new Error('Timed out: ' + expression)
}
async function drag(start, end) {
  window.focus()
  window.webContents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 })
  await pause(70)
  window.webContents.sendInputEvent({ type: 'mouseMove', ...end, button: 'left' })
  await pause(70)
  window.webContents.sendInputEvent({ type: 'mouseUp', ...end, button: 'left', clickCount: 1 })
  await pause(120)
}
async function open(path, bytes) {
  window.webContents.send('file:opened', { filePath: path, data: bytes.slice().buffer })
  await wait('!!document.querySelector("#page-1 canvas")')
}
app.whenReady().then(async () => {
  try {
    await wait('!!window.api && document.body.innerText.includes("Home")')
    await window.webContents.executeJavaScript(
      'void (window.confirm=()=>false); void (window.alert=message=>{ window.__alert=message })'
    )
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([612, 792])
    for (const n of [8, 1, 9, 2, 10, 3, 7, 4, 6, 5])
      page.drawText(`Line ${String(n).padStart(2, '0')} selectable text${n===3 ? ' with a much longer neighboring line' : ''}`, {
        x: 72,
        y: 750 - n * 24,
        size: 14
      })
    const bytes = await pdf.save(),
      path = join(directory, 'ten-lines.pdf')
    writeFileSync(path, bytes)
    await open(path, bytes)
    await wait('document.querySelectorAll("#page-1 [data-pdf-run]").length===10')
    await pause(300)
    const point = async (line, offset, outside = false) =>
      window.webContents.executeJavaScript(
        `(() => { const span=Array.from(document.querySelectorAll('#page-1 [data-pdf-run]')).find(s=>s.textContent.startsWith('Line ${String(line).padStart(2, '0')} ')); const r=document.createRange(); r.setStart(span.firstChild,${offset}); r.collapse(true); const b=r.getBoundingClientRect(); return {x:Math.round(${outside ? 'span.getBoundingClientRect().right+140' : 'b.left'}),y:Math.round(b.top+b.height/2)} })()`
      )
    for (const [a, b, outside] of [
      [1, 2, false],
      [4, 6, false],
      [6, 4, false],
      [1, 2, true]
    ]) {
      const start = await point(a, 0),
        end = await point(b, b < a ? 0 : 23, outside)
      await drag(start, end)
      const selected = await window.webContents.executeJavaScript(
        'window.getSelection().toString()'
      )
      const low = Math.min(a, b),
        high = Math.max(a, b)
      for (let n = 1; n <= 10; n++)
        if (n < low || n > high)
          assert.ok(
            !selected.includes(`Line ${String(n).padStart(2, '0')}`),
            'Unrelated line selected: ' + selected
          )
      assert.ok(selected.includes(`Line ${String(low).padStart(2, '0')}`), selected)
      checks.push(`drag lines ${a} to ${b}${outside ? ' through blank space' : ''}`)
      await window.webContents.executeJavaScript('window.getSelection().removeAllRanges()')
      await pause(160)
    }
    // Seed a real recent entry through Save As, then exercise controls and reload.
    destination = join(directory, 'recent-entry.pdf')
    window.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("recent-entry.pdf")')
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.acrobat-tab')).find(b=>b.title==='Home').click()`
    )
    await wait(`!!document.querySelector('[aria-label="Star recent-entry.pdf"]')`)
    await window.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Star recent-entry.pdf"]').click()`
    )
    await wait(
      `document.querySelector('[aria-label="Unstar recent-entry.pdf"]')?.getAttribute('aria-pressed')==='true'`
    )
    assert.equal(
      await window.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Unstar recent-entry.pdf"] svg').getAttribute('fill')`
      ),
      'currentColor'
    )
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.home-sidebar-item')).find(b=>b.textContent.trim()==='Starred').click()`
    )
    await wait(`!!document.querySelector('[aria-label="Unstar recent-entry.pdf"]')`)
    checks.push('filled stars and Starred filter')
    window.webContents.reload()
    await wait(`!!document.querySelector('[aria-label="Unstar recent-entry.pdf"]')`)
    checks.push('star persists across reload')
    await window.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Remove recent-entry.pdf from recent files"]').click()`
    )
    await wait(
      `!document.querySelector('[aria-label="Remove recent-entry.pdf from recent files"]')`
    )
    assert.ok(existsSync(destination), 'Removing history must keep the PDF')
    assert.ok(
      !(await window.webContents.executeJavaScript('window.api.getRecentFiles()')).some(
        (f) => f.path === destination
      )
    )
    checks.push('remove history persists and keeps the file')
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.acrobat-tab')).find(b=>b.title==='Tools').click()`
    )
    const boxes = await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.tools-grid button')).map(b=>b.getBoundingClientRect().toJSON())`
    )
    assert.ok(
      boxes.length === 8 && Math.abs(boxes[0].top - boxes[1].top) < 2,
      'Tools should share a row'
    )
    checks.push('responsive tool grid')
    // Use actual local Tesseract against an image-only PDF, not simulated text.
    const png = await window.webContents.executeJavaScript(
      `(() => {const c=document.createElement('canvas');c.width=1200;c.height=600;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,600);x.fillStyle='black';x.font='48px Arial';x.fillText('SEARCHABLE OFFLINE DOCUMENT',80,140);x.fillText('Second line stays selectable.',80,240);return c.toDataURL('image/png').split(',')[1]})()`
    )
    const scan = await PDFDocument.create(),
      scanPage = scan.addPage([600, 300]),
      image = await scan.embedPng(Buffer.from(png, 'base64'))
    scanPage.drawImage(image, { x: 0, y: 0, width: 600, height: 300 })
    const scanned = await scan.save()
    await open(join(directory, 'scanned.pdf'), scanned)
    await wait(
      '!document.querySelector("#page-1 [data-pdf-run]") && !!document.querySelector("#page-1 canvas")'
    )
    window.webContents.send('menu:action', 'ocr')
    await wait(
      'Array.from(document.querySelectorAll("button")).some(b=>b.textContent.includes("Run OCR"))'
    )
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Run OCR')).click()`
    )
    await wait(
      `Array.from(document.querySelectorAll('#page-1 [data-pdf-run]')).some(s=>s.textContent.includes('SEARCHABLE'))`,
      120000
    )
    assert.equal(await window.webContents.executeJavaScript('window.__alert || null'), null)
    assert.equal(
      await window.webContents.executeJavaScript(
        'Array.from(document.querySelectorAll("#page-1 [data-pdf-run]")).filter(s=>s.textContent.trim()).length'
      ),
      7
    )
    checks.push('real offline OCR produces a single text layer')
    destination = join(directory, 'searchable.pdf')
    window.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("searchable.pdf")')
    const mupdf = await import('mupdf'),
      doc = new mupdf.PDFDocument(readFileSync(destination)),
      p = doc.loadPage(0),
      text = p.toStructuredText('')
    assert.ok(text.asText().includes('SEARCHABLE'))
    text.destroy()
    p.destroy()
    doc.destroy()
    checks.push('OCR save contains extractable text')
    await open(join(directory, 'reopened.pdf'), readFileSync(destination))
    await wait(
      `Array.from(document.querySelectorAll('#page-1 [data-pdf-run]')).some(s=>s.textContent.includes('SEARCHABLE'))`
    )
    checks.push('OCR saved copy reopens with selectable text')
    assert.deepEqual(errors, [])
    writeFileSync(join(directory, 'result.json'), JSON.stringify({ passed: true, checks }, null, 2))
    writeFileSync(
      join(directory, 'workspace.png'),
      (await window.webContents.capturePage()).toPNG()
    )
    console.log('1.4.1 regressions passed', checks)
    app.exit(0)
  } catch (error) {
    console.error(error)
    try {
      writeFileSync(
        join(directory, 'failure.png'),
        (await window.webContents.capturePage()).toPNG()
      )
      console.log(
        await window.webContents.executeJavaScript('document.body.innerText.slice(-2500)')
      )
    } catch {}
    writeFileSync(
      join(directory, 'result.json'),
      JSON.stringify({ passed: false, error: String(error), checks, errors }, null, 2)
    )
    app.exit(1)
  }
})
