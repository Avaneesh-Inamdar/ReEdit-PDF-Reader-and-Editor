// Runs the built application against local fixtures, without installing it or printing to a device.
const { app, BrowserWindow, dialog } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('fs')
const { resolve, join } = require('path')
const assert = require('assert/strict')
const { PDFDocument } = require('pdf-lib')

const output = resolve(process.env.READIT_SMOKE_OUTPUT || 'release/smoke')
mkdirSync(output, { recursive: true })
app.setPath('userData', join(output, 'profile'))
let main
let printed = 0
let picked = []
let destination = null
dialog.showOpenDialog = async () => ({ canceled: picked.length === 0, filePaths: picked })
dialog.showSaveDialog = async () => ({ canceled: !destination, filePath: destination })
const errors = []
dialog.showErrorBox = (title, content) => errors.push(`${title}: ${content}`)
dialog.showMessageBox = async () => ({ response: 1 })
// Fail fast on background rejections (e.g. viz/capture errors under software
// rendering) instead of hanging until the job timeout.
process.on('unhandledRejection', (reason) => {
  errors.push(`unhandled: ${reason && reason.message ? reason.message : String(reason)}`)
  try {
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify({ passed: false, error: String(reason && reason.stack ? reason.stack : reason), rendererErrors: errors }, null, 2)
    )
  } catch {}
  app.exit(1)
})
async function capturePage(retries = 3) {
  let last
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await main.webContents.capturePage()
    } catch (error) {
      last = error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw last
}
app.on('browser-window-created', (_, window) => {
  if (!main) main = window
  window.webContents.on('console-message', (_, level, message) => {
    if (level >= 3) errors.push(message)
  })
  window.webContents.print = (_options, callback) => {
    printed++
    callback(true, '')
  }
})

require(
  process.env.READIT_SMOKE_PACKAGED
    ? resolve(
        process.env.READIT_SMOKE_APP || 'release/win-unpacked/resources/app.asar',
        'out/main/index.js'
      )
    : '../out/main/index.js'
)

async function waitFor(expression, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await main.webContents.executeJavaScript(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${expression}`)
}

function open(name) {
  const path = join(output, name)
  const data = readFileSync(resolve('test-fixtures', name))
  writeFileSync(path, data)
  main.webContents.send('file:opened', {
    filePath: path,
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  })
}

app.whenReady().then(async () => {
  try {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    GlobalWorkerOptions.workerSrc =
      'file://' + resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs').replace(/\\/g, '/')
    await waitFor('!!window.api && document.body.innerText.includes("Home")')
    await main.webContents.executeJavaScript(
      'void (window.alert = message => { throw new Error(message) })'
    )
    await main.webContents.executeJavaScript(`(() => {
      const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF'], 'external.pdf', { type: 'application/pdf' }));
      document.querySelector('#root > div').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    })()`)
    await waitFor('document.body.innerText.includes("Drop PDF here")')
    await main.webContents.executeJavaScript(
      `document.querySelector('#root > div').dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }))`
    )
    await waitFor('!document.body.innerText.includes("Drop PDF here")')
    open('simple-text.pdf')
    await waitFor(
      '!!document.querySelector("#page-1 canvas") && document.querySelector("#page-1 canvas").width > 0'
    )
    await waitFor('document.body.innerText.includes("simple-text.pdf")')
    await main.webContents.executeJavaScript(`document.querySelector('[title="Edit PDF"]').click()`)
    await waitFor('document.querySelectorAll("[data-pdf-text]").length > 0')
    main.focus()
    await new Promise((resolve) => setTimeout(resolve, 500))
    const textPoint = await main.webContents.executeJavaScript(
      '(() => { const r = document.querySelector("[data-pdf-text]").getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) } })()'
    )
    main.webContents.sendInputEvent({
      type: 'mouseDown',
      ...textPoint,
      button: 'left',
      clickCount: 1
    })
    main.webContents.sendInputEvent({
      type: 'mouseUp',
      ...textPoint,
      button: 'left',
      clickCount: 1
    })
    await waitFor('!!document.querySelector("dialog[open] textarea")')
    const original = await main.webContents.executeJavaScript(
      'document.querySelector("dialog textarea").value'
    )
    assert.ok(original.includes('Simple Text PDF'), 'Click reaches the original PDF heading')
    await main.webContents.executeJavaScript(
      'document.querySelector("dialog textarea").value = "Edited PDF heading"; document.querySelector("dialog form").requestSubmit()'
    )
    await waitFor(
      'document.querySelector(".existing-text-layer").textContent.includes("Edited PDF heading")'
    )
    await main.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("acrobat:undo"))'
    )
    await waitFor(
      '!document.querySelector(".existing-text-layer").textContent.includes("Edited PDF heading")'
    )
    await main.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("acrobat:redo"))'
    )
    await waitFor(
      'document.querySelector(".existing-text-layer").textContent.includes("Edited PDF heading")'
    )
    // Native internal dragging must be cancelled even if Chromium exposes an image as a file.
    const internalCancelled = await main.webContents.executeJavaScript(`(() => {
      const data = new DataTransfer(); data.items.add(new File(['image'], 'page.png', { type: 'image/png' }));
      const target = document.querySelector('#page-1 canvas');
      const event = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data });
      target.dispatchEvent(event);
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
      return event.defaultPrevented;
    })()`)
    assert.ok(internalCancelled)
    await waitFor('!document.body.innerText.includes("Drop PDF here")')
    await main.webContents.executeJavaScript(
      `document.querySelector('[title="Hand tool (H)"]')?.click()`
    )
    await main.webContents.executeJavaScript(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))`
    )
    const beforePan = await main.webContents.executeJavaScript(
      'document.querySelector("[data-pdf-viewer]").scrollTop'
    )
    main.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 500,
      y: 500,
      button: 'left',
      clickCount: 1
    })
    main.webContents.sendInputEvent({ type: 'mouseMove', x: 500, y: 300, button: 'left' })
    main.webContents.sendInputEvent({
      type: 'mouseUp',
      x: 500,
      y: 300,
      button: 'left',
      clickCount: 1
    })
    await waitFor(`document.querySelector('[data-pdf-viewer]').scrollTop > ${beforePan}`)
    await waitFor('!document.body.innerText.includes("Drop PDF here")')
    await main.webContents.executeJavaScript(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true })); document.querySelector('[data-pdf-viewer]').scrollTop = 0; document.querySelector('[title="Close pane"]').click()`
    )
    await main.webContents.executeJavaScript(
      `document.querySelector('[title="Add Text Comment"]').click()`
    )
    const point = await main.webContents.executeJavaScript(
      '(() => { const r = document.querySelector("#page-1 canvas").getBoundingClientRect(); return { x: Math.round(r.left + 150), y: Math.round(r.top + 140) } })()'
    )
    main.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
    main.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    await waitFor('!!document.querySelector("dialog[open] textarea")')
    await main.webContents.executeJavaScript(
      'document.querySelector("dialog textarea").value = "Smoke test annotation"; document.querySelector("dialog form").requestSubmit()'
    )
    await waitFor('document.querySelectorAll("[data-anno-id]").length > 0')
    await main.webContents.executeJavaScript(
      `document.querySelector('[title="Fill & Sign"]').click()`
    )
    await waitFor(
      `Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Add Signature')`
    )
    await main.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Add Signature').click()`
    )
    await waitFor('!!document.querySelector(".modal-card input[placeholder]")')
    await main.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.modal-card input[placeholder]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Alex Test');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    await main.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.modal-card button')).find(button => button.textContent.trim() === 'Apply').click()`
    )
    await waitFor('!document.querySelector(".modal-card")')
    const signaturePoint = await main.webContents.executeJavaScript(
      `(() => { const r = document.querySelector('#page-1 canvas').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.25), y: Math.round(r.top + r.height * 0.65) } })()`
    )
    main.webContents.sendInputEvent({
      type: 'mouseDown',
      ...signaturePoint,
      button: 'left',
      clickCount: 1
    })
    main.webContents.sendInputEvent({
      type: 'mouseUp',
      ...signaturePoint,
      button: 'left',
      clickCount: 1
    })
    await waitFor('!!document.querySelector("[data-anno-id] image[href]")')
    await new Promise((resolve) => setTimeout(resolve, 500))
    const imagePoint = await main.webContents.executeJavaScript(
      `(() => { const r = document.querySelector('[data-anno-id] image').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`
    )
    const originalImageX = await main.webContents.executeJavaScript(
      'Number(document.querySelector("[data-anno-id] image").getAttribute("x"))'
    )
    main.webContents.sendInputEvent({
      type: 'mouseDown',
      x: imagePoint.x,
      y: imagePoint.y,
      button: 'left',
      clickCount: 1
    })
    main.webContents.sendInputEvent({
      type: 'mouseMove',
      x: imagePoint.x + 30,
      y: imagePoint.y + 10,
      button: 'left'
    })
    main.webContents.sendInputEvent({
      type: 'mouseUp',
      x: imagePoint.x + 30,
      y: imagePoint.y + 10,
      button: 'left',
      clickCount: 1
    })
    await waitFor(
      `Number(document.querySelector('[data-anno-id] image').getAttribute('x')) > ${originalImageX}`
    )
    open('form-acroform.pdf')
    await waitFor(
      'document.body.innerText.includes("form-acroform.pdf") && document.querySelectorAll(".acrobat-tab").length === 4'
    )
    await main.webContents.executeJavaScript(
      `document.querySelector('[title="Fill Forms"]').click()`
    )
    await waitFor(
      `Array.from(document.querySelectorAll('label')).some(label => label.textContent.includes('name_field') && label.querySelector('input'))`
    )
    await main.webContents.executeJavaScript(`(() => {
      const label = Array.from(document.querySelectorAll('label')).find(label => label.textContent.includes('name_field'));
      const input = label.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Alex Filled');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      Array.from(document.querySelectorAll('label')).find(label => label.textContent.includes('agree_checkbox')).querySelector('input').click();
    })()`)
    await main.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("acrobat:save"))'
    )
    await waitFor('!document.querySelector(".acrobat-tab.active").textContent.includes("•")')
    const filledForm = (
      await PDFDocument.load(readFileSync(join(output, 'form-acroform.pdf')))
    ).getForm()
    assert.equal(filledForm.getTextField('name_field').getText(), 'Alex Filled')
    assert.equal(filledForm.getCheckBox('agree_checkbox').isChecked(), false)
    await main.webContents.executeJavaScript(
      'Array.from(document.querySelectorAll(".acrobat-tab")).find(b => b.textContent.includes("simple-text.pdf")).click()'
    )
    await waitFor(
      'document.querySelector(".acrobat-tab.active").textContent.includes("simple-text.pdf") && !!document.querySelector("#page-1 canvas")'
    )
    await waitFor('document.body.innerText.includes("Smoke test annotation")')
    await main.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("acrobat:save"))'
    )
    await waitFor('!document.querySelector(".acrobat-tab.active").textContent.includes("•")')
    const savedOnce = await PDFDocument.load(readFileSync(join(output, 'simple-text.pdf')))
    const count = savedOnce.getPage(0).node.Annots().size()
    assert.ok(count > 0)
    await main.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("acrobat:save"))'
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const savedTwice = await PDFDocument.load(readFileSync(join(output, 'simple-text.pdf')))
    assert.equal(savedTwice.getPage(0).node.Annots().size(), count)
    await new Promise((resolve) => setTimeout(resolve, 300))
    writeFileSync(join(output, 'document.png'), (await capturePage()).toPNG())
    await main.webContents.executeJavaScript(
      'window.dispatchEvent(new CustomEvent("acrobat:print"))'
    )
    const deadline = Date.now() + 20000
    while (!printed && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(printed, 1, 'PDF print job prepared')
    const reopened = readFileSync(join(output, 'simple-text.pdf'))
    // Close the document first so opening the saved path reads persisted data, not the existing session.
    main.webContents.send('file:closed')
    await waitFor(
      '!Array.from(document.querySelectorAll(".acrobat-tab")).some(t => t.textContent.includes("simple-text.pdf"))'
    )
    main.webContents.send('file:opened', {
      filePath: join(output, 'simple-text.pdf'),
      data: reopened.buffer.slice(reopened.byteOffset, reopened.byteOffset + reopened.byteLength)
    })
    await waitFor(
      '!!document.querySelector("#page-1 canvas") && document.body.innerText.includes("Edited PDF heading")'
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    writeFileSync(join(output, 'reopened.png'), (await capturePage()).toPNG())
    if (process.platform === 'linux')
      await main.webContents.executeJavaScript('window.api.openDefaultApps()')
    main.webContents.send('menu:action', 'preferences')
    await waitFor('!!document.querySelector("#preferences-heading")')
    await main.webContents.executeJavaScript(`(() => {
      const theme = document.querySelector('[aria-label="App theme"]'); theme.value = 'light'; theme.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    await waitFor(`document.documentElement.dataset.theme === 'light'`)
    const storedPreferences = await main.webContents.executeJavaScript(
      `JSON.parse(localStorage.getItem('re-edit-preferences')).state`
    )
    assert.equal(storedPreferences.theme, 'light')
    assert.equal(storedPreferences.signatures.length > 0, true)
    await main.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Close preferences"]').click()`
    )
    picked = [resolve('test-fixtures/simple-text.pdf'), resolve('test-fixtures/image-and-text.pdf')]
    destination = join(output, 'combined.pdf')
    main.webContents.send('menu:action', 'combineFiles')
    await waitFor('!!document.querySelector("#combine-heading")')
    await main.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.modal-card button')).find(button => button.textContent.includes('Add PDF files')).click()`
    )
    await waitFor('document.querySelectorAll(".combine-list li").length === 2')
    await main.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Move file 2 up"]').click()`
    )
    await waitFor(
      'document.querySelector(".combine-list li").textContent.includes("image-and-text.pdf")'
    )
    await main.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.modal-card button')).find(button => button.textContent.includes('Combine and save')).click()`
    )
    await waitFor(
      '!!document.querySelector(".acrobat-tab.active") && document.querySelector(".acrobat-tab.active").textContent.includes("combined.pdf") && !document.querySelector(".modal-card")'
    )
    const combined = await PDFDocument.load(readFileSync(destination))
    assert.equal(
      combined.getPageCount(),
      (await PDFDocument.load(readFileSync(picked[0]))).getPageCount() +
        (await PDFDocument.load(readFileSync(picked[1]))).getPageCount()
    )
    const combinedText = await getDocument({
      data: Uint8Array.from(readFileSync(destination)),
      standardFontDataUrl: resolve('node_modules/pdfjs-dist/standard_fonts') + '/'
    }).promise
    const firstPageText = (await (await combinedText.getPage(1)).getTextContent()).items
      .map((item) => item.str || '')
      .join(' ')
    assert.ok(firstPageText.includes('Image'), 'Combined document uses requested file order')
    await combinedText.destroy()
    writeFileSync(join(output, 'combined.png'), (await capturePage()).toPNG())

    // Exercise native mouse selection and partial editing on a large document.
    const large = await PDFDocument.create()
    for (let index = 0; index < 300; index++) {
      const page = large.addPage([612, 792])
      page.drawText(`Page ${index + 1}`, { x: 72, y: 740, size: 24 })
      page.drawText('Selection works on this line.', { x: 72, y: 700, size: 12 })
      page.drawText('And continues on the next line.', { x: 72, y: 680, size: 12 })
    }
    const largeBytes = await large.save()
    const largePath = join(output, 'large-300-pages.pdf')
    writeFileSync(largePath, largeBytes)
    const openedAt = Date.now()
    main.webContents.send('file:opened', { filePath: largePath, data: largeBytes.slice().buffer })
    await waitFor(
      `Array.from(document.querySelectorAll('#page-1 [data-pdf-run]')).some(span => span.textContent === 'Selection works on this line.')`
    )
    const largeOpenMs = Date.now() - openedAt
    await new Promise((resolve) => setTimeout(resolve, 500))
    const bounds = await main.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('#page-1 canvas');
      const span = Array.from(document.querySelectorAll('#page-1 [data-pdf-run]')).find(span => span.textContent === 'Selection works on this line.');
      const range = document.createRange();
      const point = offset => { range.setStart(span.firstChild, offset); range.collapse(true); const rect = range.getBoundingClientRect(); return { x: Math.round(rect.left), y: Math.round(rect.top + rect.height / 2) }; };
      return { start: point(10), end: point(23), ratio: canvas.width / parseFloat(canvas.style.width), canvases: document.querySelectorAll('[data-page-slot] canvas').length };
    })()`)
    assert.ok(bounds.ratio >= 1.49, 'Canvas uses a sharp backing resolution')
    assert.ok(bounds.canvases < 10, 'Large PDF does not render all pages')
    main.webContents.sendInputEvent({
      type: 'mouseDown',
      ...bounds.start,
      button: 'left',
      clickCount: 1
    })
    main.webContents.sendInputEvent({
      type: 'mouseMove',
      ...bounds.end,
      movementX: bounds.end.x - bounds.start.x,
      movementY: 0
    })
    main.webContents.sendInputEvent({
      type: 'mouseUp',
      ...bounds.end,
      button: 'left',
      clickCount: 1
    })
    await waitFor(`!!document.querySelector('[title="Edit selected text"]')`)
    const selectedText = await main.webContents.executeJavaScript(
      'window.getSelection().toString()'
    )
    assert.equal(selectedText, 'works on this', 'Dragging selects the intended line and characters')
    await main.webContents.executeJavaScript(
      `document.querySelector('[title="Edit selected text"]').click()`
    )
    await waitFor('!!document.querySelector("dialog[open] textarea")')
    assert.equal(
      await main.webContents.executeJavaScript('document.querySelector("dialog textarea").value'),
      selectedText
    )
    const dialogGrowth = await main.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('dialog textarea'); const before = input.offsetHeight;
      input.value = Array.from({ length: 25 }, (_, index) => 'A long replacement paragraph, line ' + index).join('\\n'); input.dispatchEvent(new Event('input', { bubbles: true }));
      const after = input.offsetHeight;
      input.value = 'Edited selection'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('dialog form').requestSubmit(); return { before, after };
    })()`)
    assert.ok(dialogGrowth.after > dialogGrowth.before, 'The edit box grows with large text')
    await waitFor(
      `Array.from(document.querySelectorAll('#page-1 .existing-text-layer text')).some(text => text.textContent === 'Edited selection')`
    )
    destination = largePath
    main.webContents.send('menu:action', 'save')
    await waitFor(
      '!document.querySelector(".acrobat-tab.active .close-btn").parentElement.textContent.includes("•")'
    )
    const savedSelection = await getDocument({
      data: Uint8Array.from(readFileSync(largePath)),
      standardFontDataUrl: resolve('node_modules/pdfjs-dist/standard_fonts') + '/'
    }).promise
    const savedSelectionText = (await (await savedSelection.getPage(1)).getTextContent()).items
      .map((item) => item.str || '')
      .join(' ')
    assert.ok(
      savedSelectionText.includes('Edited selection'),
      'Partial selection replacement is saved'
    )
    await savedSelection.destroy()
    assert.ok(!savedSelectionText.includes('works on this'), 'Original selected text is removed from saved content')
    assert.ok(savedSelectionText.includes('Selection') && savedSelectionText.includes('line.'), 'Unselected neighboring text is retained')
    await main.webContents.executeJavaScript(
      `document.getElementById('page-300').scrollIntoView({ block: 'start' })`
    )
    await waitFor('!!document.querySelector("#page-300 [data-pdf-run]")')
    await waitFor(
      `Array.from(document.querySelectorAll('.hud-bar span')).some(span => span.textContent.includes('300 / 300'))`
    )
    assert.ok(
      await main.webContents.executeJavaScript(
        `document.querySelectorAll('[data-page-slot] canvas').length < 10`
      ),
      'Distant navigation retains bounded page canvases'
    )
    writeFileSync(
      join(output, 'large-document.png'),
      (await capturePage()).toPNG()
    )
    writeFileSync(
      join(output, 'performance.json'),
      JSON.stringify(
        {
          pages: 300,
          largeOpenMs,
          initialPageCanvases: bounds.canvases,
          backingScale: bounds.ratio
        },
        null,
        2
      )
    )
    main.webContents.reload()
    await waitFor(
      `!!document.querySelector('button') && document.body.innerText.includes('Home') && document.documentElement.dataset.theme === 'light'`
    )
    assert.equal(
      await main.webContents.executeJavaScript(
        `JSON.parse(localStorage.getItem('re-edit-preferences')).state.theme`
      ),
      'light'
    )
    assert.deepEqual(errors, [], 'No renderer errors')
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          packaged: Boolean(process.env.READIT_SMOKE_PACKAGED),
          checks: [
            'PDF rendering',
            'click and edit existing PDF text',
            'text edit undo and redo',
            'saved replacement survives reopening',
            'external PDF drop detection',
            'internal drag suppression',
            'hand panning',
            'multiple documents',
            'tab switching preserves edits',
            'text dialog',
            'save to active path',
            'repeated save does not duplicate annotations',
            'PDF print preparation',
            'typed signature placement and movement',
            'signature persistence',
            'fillable text and checkbox save',
            'native Preferences routing',
            'theme preference survives reload',
            'Combine Files ordering and save',
            'native mouse selection at the intended baseline',
            'partial selection Edit Text and save',
            'edit dialog grows with content',
            'high-DPI canvas backing resolution',
            '300-page opening and distant navigation with bounded canvases'
          ],
          rendererErrors: errors
        },
        null,
        2
      )
    )
    console.log('Electron smoke checks passed')
    app.exit(0)
  } catch (error) {
    if (main && !main.isDestroyed())
      try {
        writeFileSync(join(output, 'failure.png'), (await capturePage(1)).toPNG())
      } catch {}
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify({ passed: false, error: String(error), rendererErrors: errors }, null, 2)
    )
    console.error(error)
    app.exit(1)
  }
})
