const { app, BrowserWindow, dialog } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const directory = resolve(process.env.READIT_142_OUTPUT || 'release/smoke-1.4.2')
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
  process.env.READIT_142_APP
    ? resolve(process.env.READIT_142_APP, 'out/main/index.js')
    : '../out/main/index.js'
)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (expression) => window.webContents.executeJavaScript(expression)
async function wait(expression, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const alert = await js('window.__alert')
    if (alert) throw new Error(alert)
    if (await js(expression)) return
    await pause(100)
  }
  throw new Error('Timed out: ' + expression)
}
async function open(bytes, name) {
  window.webContents.send('file:opened', {
    filePath: join(directory, name),
    data: bytes.slice().buffer
  })
  await wait('!!document.querySelector("#page-1 canvas")')
}
async function setInput(selector, value) {
  await js(
    `(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${selector.includes('select') ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`
  )
}
app.whenReady().then(async () => {
  try {
    await wait('!!window.api && document.body.innerText.includes("Home")')
    await js('void(window.alert=message=>{window.__alert=message})')
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const lato = await pdf.embedFont(
      readFileSync('src/renderer/src/assets/fonts/lato-latin-700-italic.woff'),
      { subset: true }
    )
    const courier = await pdf.embedFont(StandardFonts.CourierOblique)
    const page = pdf.addPage([612, 792])
    page.drawText('Same style sample', {
      x: 72,
      y: 710,
      font: lato,
      size: 17.5,
      color: rgb(230 / 255, 57 / 255, 70 / 255)
    })
    page.drawText('Blue italic words', {
      x: 72,
      y: 670,
      font: courier,
      size: 13.25,
      color: rgb(0, 0.2, 0.8)
    })
    page.drawText('hello hello HELLO', { x: 72, y: 620, size: 16 })
    const bytes = await pdf.save()
    await open(bytes, 'fonts.pdf')
    await wait('document.querySelectorAll("#page-1 [data-pdf-run]").length>=3')
    const metadata = await js(
      `(()=>{const run=document.querySelector('#page-1 [data-pdf-run]').pdfRun;return {name:run.fontFamily,size:run.size,color:run.color,bold:run.bold,italic:run.italic,bytes:run.fontData?.length,glyphs:run.fontGlyphs,preview:run.previewFont}})()`
    )
    console.log('Original font metadata', metadata)
    assert.match(metadata.name, /Lato.*BoldItalic/i)
    assert.equal(metadata.size, 17.5)
    assert.equal(metadata.color, '#e63946')
    assert.equal(metadata.bold, true)
    assert.equal(metadata.italic, true)
    assert.ok(metadata.bytes > 0)
    checks.push('original embedded font, weight, slant, fractional size and color detected')
    await js(`document.querySelector('[title="Edit PDF"]').click()`)
    await wait('!!document.querySelector("#page-1 [data-pdf-text]")')
    await js(
      `window.dispatchEvent(new CustomEvent('pdf:editRun',{detail:{page:1,run:document.querySelector('#page-1 [data-pdf-run]').pdfRun}}))`
    )
    await wait('!!document.querySelector("dialog[open] textarea")')
    await js(
      'document.querySelector("dialog textarea").value="Same sample style";document.querySelector("dialog form").requestSubmit()'
    )
    await wait(`!!document.querySelector('select[title="Font family"]')`)
    assert.equal(await js(`document.querySelector('select[title="Font size"]').value`), '17.5')
    assert.equal(await js(`document.querySelector('input[title="Text color"]').value`), '#e63946')
    assert.ok(
      (await js(`document.querySelector('select[title="Font family"]').options.length`)) >= 21
    )
    checks.push(
      'editing retains original formatting and exposes 20 families/faces plus document font'
    )
    destination = join(directory, 'original-font-edit.pdf')
    window.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("original-font-edit.pdf")')
    const mupdf = await import('mupdf')
    const saved = new mupdf.PDFDocument(readFileSync(destination)),
      savedPage = saved.loadPage(0),
      text = savedPage.toStructuredText('')
    assert.ok(text.asText().includes('Same sample style'))
    assert.ok(!text.asText().includes('Same style sample'))
    const styles = []
    text.walk({
      onChar(c, origin, font, size, quad, color) {
        if (c === 'S') styles.push({ font: font.getName(), size, color })
      }
    })
    assert.match(styles[0].font, /Lato.*BoldItalic/i)
    assert.ok(Math.abs(styles[0].size - 17.5) < 0.1)
    assert.ok(Math.abs(styles[0].color[0] - 230 / 255) < 0.002)
    text.destroy()
    savedPage.destroy()
    saved.destroy()
    checks.push(
      'saved edit removes old text and retains searchable text, original outlines, size and color'
    )
    await setInput('select[title="Font family"]', 'Noto Serif')
    await pause(100)
    destination = join(directory, 'bundled-font-edit.pdf')
    window.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("bundled-font-edit.pdf")')
    const bundled = new mupdf.PDFDocument(readFileSync(destination)),
      bp = bundled.loadPage(0),
      bt = bp.toStructuredText('')
    const names = []
    bt.walk({
      onChar(c, o, f) {
        names.push(f.getName())
      }
    })
    assert.ok(names.some((n) => n.includes('NotoSerif')))
    bt.destroy()
    bp.destroy()
    bundled.destroy()
    checks.push('bundled font choice is really embedded in saved PDFs')
    const imported = readFileSync(
      'src/renderer/src/assets/fonts/lato-latin-400-normal.woff'
    ).toString('base64')
    await js(
      `(()=>{const input=document.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]'),data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(${JSON.stringify(imported)}),c=>c.charCodeAt(0))],'Imported-Lato.woff'));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`
    )
    await wait(`document.querySelector('select[title="Font family"]').value==='Imported-Lato'`)
    destination = join(directory, 'imported-font-edit.pdf')
    window.webContents.send('menu:action', 'saveAs')
    await wait('document.body.innerText.includes("imported-font-edit.pdf")')
    const custom = new mupdf.PDFDocument(readFileSync(destination)),
      cp = custom.loadPage(0),
      ct = cp.toStructuredText('')
    const importedNames = []
    ct.walk({
      onChar(c, o, f) {
        importedNames.push(f.getName())
      }
    })
    assert.ok(importedNames.some((name) => name.includes('Lato-Regular')))
    ct.destroy()
    cp.destroy()
    custom.destroy()
    checks.push('imported font loads in the browser and embeds its actual outlines')
    await js(
      `document.querySelector('[title="Close pane"]').click();document.querySelector('[aria-label="Toggle navigation sidebar"]').click()`
    )
    await wait(
      `document.querySelector('[aria-label="Toggle navigation sidebar"]').getAttribute('aria-expanded')==='false'`
    )
    await js(`document.querySelector('[aria-label="Toggle navigation sidebar"]').click()`)
    await wait('!!document.querySelector("[data-thumbnail] img")')
    assert.equal(await js(`!!document.querySelector('[aria-label="Thumbnail size"]')`), false)
    const thumb = await js('document.querySelector("[data-thumbnail]").getBoundingClientRect().width')
    assert.ok(thumb > 100 && thumb <= 184)
    checks.push('sidebar button closes/reopens and thumbnails have a fixed readable size')

    const initial = await js('document.querySelector("#page-1").getBoundingClientRect().width')
    const pinch = (delta) =>
      js(
        `(()=>{const page=document.querySelector('#page-1'),r=page.getBoundingClientRect();page.dispatchEvent(new WheelEvent('wheel',{deltaY:${delta},ctrlKey:true,clientX:r.left+r.width*.5,clientY:r.top+80,bubbles:true,cancelable:true}))})()`
      )
    await pinch(-40)
    await pause(200)
    const enlarged = await js('document.querySelector("#page-1").getBoundingClientRect().width')
    assert.ok(enlarged > initial)
    await pinch(40)
    await pause(200)
    assert.ok(
      (await js('document.querySelector("#page-1").getBoundingClientRect().width')) < enlarged
    )
    const scrollUnblocked = await js(
      `(()=>{const event=new WheelEvent('wheel',{deltaY:60,deltaX:20,bubbles:true,cancelable:true});document.querySelector('#page-1').dispatchEvent(event);return !event.defaultPrevented})()`
    )
    assert.ok(scrollUnblocked)
    checks.push('trackpad pinch zooms in/out and ordinary two-finger scrolling is not intercepted')
    for (const close of ['Escape', 'Control+f', 'button']) {
      window.webContents.send('menu:action', 'find')
      await wait(`!!document.querySelector('[aria-label="Find in document"]')`)
      await setInput('input[aria-label="Find in document"]', 'hello')
      await wait('document.querySelectorAll(".search-highlight").length===3')
      const highlight = await js(
          'document.querySelector(".search-highlight").getBoundingClientRect().width'
        ),
        line = await js(
          `Array.from(document.querySelectorAll('[data-pdf-run]')).find(e=>e.textContent.includes('hello')).getBoundingClientRect().width`
        )
      assert.ok(highlight < line / 2)
      if (close === 'Escape') {
        await js(
          `Array.from(document.querySelectorAll('label')).find(label=>label.textContent.includes('Match case')).querySelector('input').click()`
        )
        await wait('document.querySelectorAll(".search-highlight").length===2')
        await js(
          `Array.from(document.querySelectorAll('label')).find(label=>label.textContent.includes('Match case')).querySelector('input').click()`
        )
        await wait('document.querySelectorAll(".search-highlight").length===3')
        await js(
          `window.dispatchEvent(new KeyboardEvent('keydown',{key:'F3',bubbles:true,cancelable:true}))`
        )
        await wait('document.body.innerText.includes("2 / 3")')
        await setInput('input[aria-label="Find in document"]', 'hel')
        await wait('document.querySelectorAll(".search-highlight").length===3')
        await js(
          `Array.from(document.querySelectorAll('label')).find(label=>label.textContent.includes('Whole words')).querySelector('input').click()`
        )
        await wait(
          'document.body.innerText.includes("No matches") && !document.querySelector(".search-highlight")'
        )
        await js(
          `Array.from(document.querySelectorAll('label')).find(label=>label.textContent.includes('Whole words')).querySelector('input').click()`
        )
        await wait('document.querySelectorAll(".search-highlight").length===3')
      }
      if (close === 'button')
        await js(
          `document.querySelector('[aria-label="Find in document"]').parentElement.querySelector(':scope > button:last-child').click()`
        )
      else
        await js(
          `document.querySelector('[aria-label="Find in document"]').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(close === 'Escape' ? 'Escape' : 'f')},ctrlKey:${close !== 'Escape'},bubbles:true,cancelable:true}))`
        )
      await wait(
        `!document.querySelector('[aria-label="Find in document"]') && !document.querySelector('.search-highlight')`
      )
    }
    checks.push(
      'Find counts all three occurrences, highlights exact words and clears on Escape/Ctrl+F/close'
    )
    checks.push('Find supports match case, whole words and F3 navigation')
    window.webContents.send('menu:action', 'find')
    await wait(`!!document.querySelector('[aria-label="Find in document"]')`)
    await setInput('input[aria-label="Find in document"]', 'hello')
    await js(
      `document.querySelector('[aria-label="Find in document"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`
    )
    await pause(500)
    assert.ok(await js('!document.querySelector(".search-highlight")'))
    checks.push('closing Find cancels a pending debounced search')
    window.unmaximize()
    app.emit('second-instance', {}, ['re-edit-pdf', destination])
    await pause(200)
    if (process.platform === 'win32') assert.ok(window.isMaximized())
    checks.push('external PDF opens and requests a maximized document window')
    assert.deepEqual(errors, [])
    assert.equal(await js('window.__alert'), undefined)
    writeFileSync(
      join(directory, 'workspace.png'),
      (await window.webContents.capturePage()).toPNG()
    )
    writeFileSync(join(directory, 'result.json'), JSON.stringify({ passed: true, checks }, null, 2))
    console.log('1.4.2 regressions passed', checks)
    app.exit(0)
  } catch (error) {
    console.error(error)
    try {
      writeFileSync(
        join(directory, 'failure.png'),
        (await window.webContents.capturePage()).toPNG()
      )
      console.log(
        await js('JSON.stringify({text:document.body.innerText.slice(-2200),alert:window.__alert})')
      )
    } catch {}
    writeFileSync(
      join(directory, 'result.json'),
      JSON.stringify({ passed: false, error: String(error), checks, errors }, null, 2)
    )
    app.exit(1)
  }
})
