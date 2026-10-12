const { app, dialog } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { resolve, join } = require('node:path')
const assert = require('node:assert/strict')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const out = resolve(process.env.READIT_144_OUTPUT || 'release/smoke-1.4.4')
mkdirSync(out, { recursive: true })
app.setPath('userData', join(out, 'profile-' + Date.now()))
let win,
  destination = null
const jobs = [],
  checks = [],
  errors = []
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
dialog.showSaveDialog = async () => ({ canceled: !destination, filePath: destination })
dialog.showMessageBox = async () => ({ response: 1 })
dialog.showErrorBox = (name, message) => errors.push(name + ': ' + message)
app.on('browser-window-created', (_, window) => {
  if (!win) win = window
  window.webContents.getPrintersAsync = async () => [
    { name: 'TestPrinter', displayName: 'Test printer', options: { 'printer-is-default': 'true' } }
  ]
  window.webContents.print = (options, callback) => {
    jobs.push(options)
    callback(true, '')
  }
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
})
require(
  process.env.READIT_144_APP
    ? resolve(process.env.READIT_144_APP, 'out/main/index.js')
    : '../out/main/index.js'
)
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (s) => win.webContents.executeJavaScript(s)
async function wait(s, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await js(s)) return
    await pause(75)
  }
  throw Error('Timed out: ' + s)
}
async function input(selector, value) {
  await js(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
}
async function open(bytes, name) {
  console.log('OPEN', name)
  writeFileSync(join(out, name), bytes)
  win.webContents.send('file:opened', {
    filePath: join(out, name),
    data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  })
  await wait('!!document.querySelector("#page-1 [data-pdf-run]")')
  await pause(150)
}
async function editRun(text) {
  await js(
    `(()=>{const e=[...document.querySelectorAll('#page-1 [data-pdf-run]')].find(e=>e.textContent.includes(${JSON.stringify(text)}));window.dispatchEvent(new CustomEvent('pdf:editRun',{detail:{page:1,run:e.pdfRun}}))})()`
  )
  await wait('!!document.querySelector("dialog textarea")')
}
async function apply(text, font) {
  await input('dialog textarea', text)
  if (font) await input('dialog select[aria-label="Replacement font"]', font)
  await js('document.querySelector("dialog button[type=submit]").click()')
}
async function capture(name) {
  await pause(200)
  writeFileSync(join(out, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function close() {
  win.webContents.send('file:closed')
  await wait('!document.querySelector("[data-pdf-viewer]")')
  await pause(400)
}
async function memory() {
  await win.webContents.debugger.sendCommand('HeapProfiler.collectGarbage')
  await pause(100)
  await win.webContents.debugger.sendCommand('HeapProfiler.collectGarbage')
  const heap = await win.webContents.debugger.sendCommand('Runtime.getHeapUsage'),
    dom = await win.webContents.debugger.sendCommand('Memory.getDOMCounters')
  return {
    heap: heap.usedSize,
    backing: heap.backingStorageSize,
    documents: dom.documents,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    fonts: await js('document.fonts.size'),
    processes: app.getAppMetrics().length
  }
}
app.whenReady().then(async () => {
  try {
    await wait('!!window.api && !!document.querySelector(".home-workspace")')
    const installed = await js('window.api.getSystemFonts()')
    assert.ok(installed.length > 0)
    assert.ok(
      (await js(
        `window.api.readSystemFont(${JSON.stringify(installed[0].id)}).then(data=>data.length)`
      )) > 1000
    )
    checks.push(
      'installed fonts are enumerated and actual bytes are accessible through the restricted font API'
    )
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    const face = await doc.embedFont(
      readFileSync('src/renderer/src/assets/fonts/lato-latin-400-normal.woff'),
      { subset: true }
    )
    doc
      .addPage([612, 792])
      .drawText('AB', { x: 70, y: 670, size: 19.5, font: face, color: rgb(0.7, 0.1, 0.1) })
    const original = await doc.save()
    await open(original, 'subset.pdf')
    await js('document.querySelector("[title=\\"Edit PDF\\"]").click()')
    await editRun('AB')
    await apply('C Привет Ω')
    await wait('document.querySelector("dialog [role=alert]").textContent.length>0')
    assert.equal(await js('!!document.querySelector("[data-edited-text]")'), false)
    await apply('C Привет Ω', 'bundled:Source Sans 3')
    await wait('!document.querySelector("dialog")')
    await wait('!!document.querySelector("[data-edited-text]")')
    await pause(350)
    destination = join(out, 'subset-corrected.pdf')
    win.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("subset-corrected.pdf")')
    const m = await import('mupdf'),
      saved = new m.PDFDocument(readFileSync(destination)),
      sp = saved.loadPage(0),
      st = sp.toStructuredText('')
    assert.ok(st.asText().includes('Привет Ω'), st.asText())
    const pix = sp.toPixmap([1, 0, 0, 1, 0, 0], m.ColorSpace.DeviceRGB, false, true)
    writeFileSync(join(out, 'adobe-font-outlines.png'), pix.asPNG())
    pix.destroy()
    st.destroy()
    sp.destroy()
    saved.destroy()
    checks.push(
      'missing subset glyphs are blocked before preview; selecting a full Adobe font saves real searchable Greek/Cyrillic outlines'
    )
    const fontCount = await js('document.fonts.size')
    for (let i = 0; i < 8; i++) {
      await js(
        'document.querySelector("[data-edited-text] text").dispatchEvent(new MouseEvent("click",{bubbles:true}))'
      )
      await wait('!!document.querySelector("dialog textarea")')
      await apply('C Привет Ω ' + i, 'bundled:Source Sans 3')
      await wait('!document.querySelector("dialog")')
    }
    await pause(450)
    assert.ok((await js('document.fonts.size')) <= fontCount + 1)
    checks.push('repeated font choices reuse preview faces rather than adding one face per edit')
    win.webContents.send('menu:action', 'find')
    await wait('!!document.querySelector("[aria-label=\\"Find in document\\"]")')
    await input('input[aria-label="Find in document"]', 'AB')
    await wait('document.body.innerText.includes("No matches")')
    await input('input[aria-label="Find in document"]', 'Привет')
    await wait('document.querySelectorAll(".search-highlight").length===1')
    await capture('find-edited-text')
    await js('document.querySelector("[title=\\"Close Find\\"]").click()')
    await wait('!document.querySelector(".search-highlight")')
    checks.push(
      'Find searches replacements, excludes deleted source text, highlights the replacement and clears on close'
    )
    const pages = await PDFDocument.create(),
      plain = await pages.embedFont(StandardFonts.Helvetica)
    for (let n = 1; n <= 3; n++)
      pages
        .addPage([612, 792])
        .drawText('Print page ' + n, { x: 60, y: 650, size: 24, font: plain })
    await close()
    await open(await pages.save(), 'print-pages.pdf')
    win.webContents.send('menu:action', 'print')
    await wait(
      '!!document.querySelector(".print-dialog") && !document.querySelector(".print-dialog .operation-primary").disabled'
    )
    await capture('print-dialog')
    await input('input[aria-label="Copies"]', '2')
    await js(
      '[...document.querySelectorAll(".print-settings label")].find(e=>e.textContent.trim()==="Page range").querySelector("input").click()'
    )
    await input('input[aria-label="Print page range"]', '2')
    await js(
      '[...document.querySelectorAll(".print-settings label")].find(e=>e.textContent.includes("Output")).querySelector("select").value="gray";[...document.querySelectorAll(".print-settings label")].find(e=>e.textContent.includes("Output")).querySelector("select").dispatchEvent(new Event("change",{bubbles:true}))'
    )
    await js('document.querySelector(".print-dialog .operation-primary").click()')
    await wait('!document.querySelector(".print-dialog")')
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].silent, true)
    assert.equal(jobs[0].copies, 2)
    assert.equal(jobs[0].color, false)
    assert.equal(jobs[0].deviceName, 'TestPrinter')
    checks.push(
      'custom print dialog passes copies, grayscale, selected printer and silent printing without a native options dialog'
    )
    await close()
    const png = await js(
      "(()=>{const c=document.createElement('canvas');c.width=1500;c.height=750;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1500,750);x.fillStyle='#444';x.font='54px Arial';x.fillText('SEARCHABLE OFFLINE ACCURACY',70,170);x.fillText('SECOND LINE REMAINS INTACT',70,310);return c.toDataURL('image/png').split(',')[1]})()"
    )
    const scan = await PDFDocument.create(),
      scanPage = scan.addPage([600, 450]),
      header = await scan.embedFont(StandardFonts.Helvetica),
      image = await scan.embedPng(Buffer.from(png, 'base64'))
    scanPage.drawText('Existing digital heading', { x: 35, y: 415, size: 12, font: header })
    scanPage.drawImage(image, { x: 20, y: 70, width: 560, height: 280 })
    await open(await scan.save(), 'mixed-scan.pdf')
    win.webContents.send('menu:action', 'ocr')
    await wait('!!document.querySelector(".ocr-workflow")')
    await capture('ocr-workflow')
    await js(
      '[...document.querySelectorAll(".ocr-workflow button")].find(b=>b.textContent.startsWith("Run OCR")).click()'
    )
    await wait('document.body.innerText.includes("OCR complete. Text is selectable")', 120000)
    await wait(
      '[...document.querySelectorAll("#page-1 [data-pdf-run]")].some(e=>e.textContent.includes("SEARCHABLE"))'
    )
    await js(
      '[...document.querySelectorAll(".ocr-workflow button")].find(b=>b.textContent==="Overwrite current file").click()'
    )
    await wait('document.body.innerText.includes("Current file overwritten")')
    const ocr = new m.PDFDocument(readFileSync(join(out, 'mixed-scan.pdf'))),
      op = ocr.loadPage(0),
      ot = op.toStructuredText(''),
      recognized = ot.asText()
    assert.ok(recognized.includes('SEARCHABLE OFFLINE ACCURACY'), recognized)
    assert.equal((recognized.match(/Existing digital heading/g) || []).length, 1)
    ot.destroy()
    op.destroy()
    ocr.destroy()
    checks.push(
      'accurate offline OCR recognizes a faint mixed image/text page without duplicating its native heading, and overwrite writes the current file'
    )
    await js(
      '[...document.querySelectorAll(".ocr-workflow button")].find(b=>b.textContent==="Edit recognized text").click()'
    )
    await editRun('OFFLINE')
    const line = await js('document.querySelector("dialog textarea").value')
    assert.ok(line.includes('SEARCHABLE') && line.includes('ACCURACY'), line)
    await apply('CORRECTED OFFLINE TEXT', 'bundled:Source Sans 3')
    await wait('!document.querySelector("dialog")')
    await pause(650)
    destination = join(out, 'scan-edited.pdf')
    win.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("scan-edited.pdf")')
    const edited = new m.PDFDocument(readFileSync(destination)),
      ep = edited.loadPage(0),
      et = ep.toStructuredText('')
    assert.ok(et.asText().includes('CORRECTED OFFLINE TEXT'), et.asText())
    assert.ok(!et.asText().includes('SEARCHABLE'))
    assert.ok(et.asText().includes('SECOND LINE REMAINS INTACT'))
    et.destroy()
    ep.destroy()
    edited.destroy()
    await capture('ocr-edit-line')
    checks.push(
      'OCR click editing groups a line, replaces its invisible text and removes the old scanned word pixels while keeping the neighboring line'
    )
    await close()
    win.webContents.debugger.attach('1.3')
    // Warm normal document, Find and print-preview paths before measuring a plateau.
    async function cycle(n) {
      await open(await pages.save(), 'memory-' + n + '.pdf')
      win.webContents.send('menu:action', 'find')
      await wait('!!document.querySelector("[aria-label=\\"Find in document\\"]")')
      await input('input[aria-label="Find in document"]', 'Print')
      await wait('document.body.innerText.includes("1 / 3")')
      await js('document.querySelector("[title=\\"Close Find\\"]").click()')
      win.webContents.send('menu:action', 'print')
      await wait('!!document.querySelector(".print-dialog")')
      await js('document.querySelector("[title=\\"Close print dialog\\"]").click()')
      await close()
    }
    for (let n = 0; n < 3; n++) await cycle(n)
    await pause(500)
    const baseline = await memory()
    for (let n = 3; n < 15; n++) await cycle(n)
    await pause(700)
    const after = await memory()
    assert.ok(after.heap - baseline.heap < 16 * 1024 * 1024, JSON.stringify({ baseline, after }))
    assert.ok(after.documents <= baseline.documents + 3, JSON.stringify({ baseline, after }))
    assert.ok(after.listeners <= baseline.listeners + 30, JSON.stringify({ baseline, after }))
    assert.ok(after.fonts <= baseline.fonts + 1, JSON.stringify({ baseline, after }))
    assert.ok(after.processes <= baseline.processes + 1, JSON.stringify({ baseline, after }))
    win.webContents.debugger.detach()
    checks.push(
      '12 repeated open/Find/print-preview/close cycles retain bounded heap, documents, listeners, font faces and processes after warm-up'
    )
    // Alt+F4 is intercepted as application close, never as the F4 sidebar shortcut.
    const closed = new Promise((resolve) => win.once('closed', resolve))
    win.focus()
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F4', modifiers: ['alt'] })
    await Promise.race([
      closed,
      pause(10000).then(() => {
        throw Error('Alt+F4 did not close the window')
      })
    ])
    checks.push('real Alt+F4 input closes the application window')
    assert.equal(errors.length, 0, errors.join('\n'))
    writeFileSync(
      join(out, 'result.json'),
      JSON.stringify(
        { passed: true, checks, memory: { baseline, after }, systemFontCount: installed.length },
        null,
        2
      )
    )
    console.log(
      JSON.stringify({
        passed: true,
        checks,
        memory: { baseline, after },
        systemFontCount: installed.length
      })
    )
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (win && !win.isDestroyed()) {
      await capture('failure')
      console.error(await js('document.body.innerText'))
    }
    writeFileSync(
      join(out, 'result.json'),
      JSON.stringify({ passed: false, error: String(error), checks, errors }, null, 2)
    )
    app.exit(1)
  }
})
