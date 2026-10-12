const { app, dialog, ipcMain } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const assert = require('node:assert/strict')
const out = resolve('release/ui-review')
mkdirSync(out, { recursive: true })
app.setPath('userData', join(out, 'profile-' + Date.now()))
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] })
dialog.showMessageBox = async () => ({ response: 1 })
let win
app.on('browser-window-created', (_, w) => {
  if (!win) win = w
  w.webContents.getPrintersAsync = async () => [
    { name: 'TestPrinter', displayName: 'Test printer', options: { 'printer-is-default': 'true' } }
  ]
})
require('../out/main/index.js')
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (s) => win.webContents.executeJavaScript(s)
async function wait(s) {
  for (let i = 0; i < 200; i++) {
    if (await js(s)) return
    await pause(100)
  }
  throw Error('Timeout: ' + s)
}
async function menu(group, label) {
  await js("document.querySelector('.workspace-menu-trigger').click()")
  await js(
    `[...document.querySelectorAll('.workspace-menu-root > .workspace-menu-group > button')].find(b=>b.innerText.trim()===${JSON.stringify(group)}).click()`
  )
  await js(
    `[...document.querySelectorAll('.workspace-menu-flyout button')].find(b=>b.innerText.includes(${JSON.stringify(label)})).click()`
  )
}
async function capture(name) {
  await wait(
    '[...document.querySelectorAll("[data-page-slot][data-visible=true] canvas")].every(canvas=>canvas.dataset.renderReady==="true")'
  )
  await pause(250)
  writeFileSync(join(out, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
app.whenReady().then(async () => {
  try {
    await wait('!!window.api && !!document.querySelector(".home-workspace")')
    ipcMain.removeHandler('app:checkUpdates')
    ipcMain.handle('app:checkUpdates', () => ({
      current: '1.4.4',
      latest: '1.4.4',
      available: false,
      message: 'You have the latest version.'
    }))
    await pause(500)
    win.unmaximize()
    win.setContentSize(1300, 850)
    await pause(300)
    await menu('View', 'Theme: Light')
    await capture('home-light')
    await menu('Window', 'Tools')
    await wait('!!document.querySelector(".tools-workspace")')
    await capture('tools-light')
    const doc = await PDFDocument.create(),
      font = await doc.embedFont(StandardFonts.Helvetica)
    for (let n = 1; n <= 2; n++) {
      const p = doc.addPage([612, 792])
      p.drawText('Re-Edit PDF', { x: 52, y: 736, size: 12, font, color: rgb(0.35, 0.35, 0.35) })
      p.drawText('Quarterly report', { x: 52, y: 670, size: 30, font })
      p.drawText('October 2026', { x: 52, y: 639, size: 12, font, color: rgb(0.4, 0.4, 0.4) })
      p.drawRectangle({ x: 52, y: 600, width: 508, height: 2, color: rgb(0.15, 0.39, 0.7) })
      for (let i = 0; i < 12; i++)
        p.drawText('A familiar workspace for reading, editing and reviewing documents.', {
          x: 52,
          y: 554 - i * 26,
          size: 12,
          font
        })
      p.drawText(String(n), { x: 540, y: 40, size: 10, font })
    }
    const formField = doc.getForm().createTextField('Reviewer')
    formField.setText('')
    formField.addToPage(doc.getPage(1), { x: 52, y: 90, width: 230, height: 25 })
    const bytes = await doc.save()
    win.webContents.send('file:opened', {
      filePath: join(out, 'Quarterly report.pdf'),
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    })
    await wait(
      '!!document.querySelector("#page-1 canvas") && !!document.querySelector("#page-1 [data-pdf-run]")'
    )
    await pause(600)
    await capture('document-light')
    await js('document.querySelector("[aria-label=\\"Toggle navigation sidebar\\"]").click()')
    await pause(300)
    await capture('document-reading')
    const geometry = await js(
      "(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,height:b.height}};return {header:r('.workspace-header'),bar:r('.document-toolbar'),tools:r('.workspace-tools-pane'),viewer:r('[data-pdf-viewer]'),rail:r('.workspace-document-rail')}})()"
    )
    assert.equal(geometry.header.height, 42)
    assert.ok(geometry.bar.height >= 48 && geometry.bar.height <= 50)
    assert.ok(geometry.tools.right <= geometry.viewer.x)
    assert.ok(geometry.rail.x >= geometry.viewer.right - 1)
    await js('document.querySelector("[title=\\"Edit PDF\\"]").click()')
    await wait(
      '!!document.querySelector(".workspace-tools-pane h2") && document.querySelector(".workspace-tools-pane h2").innerText==="Edit PDF"'
    )
    await capture('document-edit')
    await js('document.querySelector("[title=\\"All tools\\"]").click()')
    await wait('!!document.querySelector(".workspace-tool-list")')
    await menu('View', 'Theme: Dark')
    await capture('document-dark')
    win.setContentSize(950, 650)
    await pause(400)
    await capture('document-narrow')
    const overflow = await js(
      "document.querySelector('.document-toolbar').scrollWidth > document.querySelector('.document-toolbar').clientWidth"
    )
    assert.equal(overflow, false)
    await menu('Edit', 'Preferences')
    await wait('!!document.querySelector(".modal-overlay")')
    await capture('preferences-dark')
    await js('document.querySelector("[aria-label=\\"Close preferences\\"]").click()')
    win.setContentSize(1300, 850)
    async function panel(label) {
      await js(
        '(()=>{const back=document.querySelector("[title=\\"Back to all tools\\"]");if(back)back.click();else if(!document.querySelector(".workspace-tool-list"))document.querySelector("[title=\\"All tools\\"]").click()})()'
      )
      await wait('!!document.querySelector(".workspace-tool-list")')
      await js(
        `[...document.querySelectorAll('.workspace-tool-list button')].find(b=>b.innerText.trim()===${JSON.stringify(label)}).click()`
      )
      await pause(250)
    }
    for (const theme of ['Light', 'Dark']) {
      await menu('View', 'Theme: ' + theme)
      for (const label of [
        'Scan & OCR',
        'Edit PDF',
        'Fill Forms',
        'Fill & Sign',
        'Redact',
        'Security Summary'
      ]) {
        await panel(label)
        await capture(label.toLowerCase().replace(/[^a-z]+/g, '-') + '-' + theme.toLowerCase())
        const primary = await js(
          "(()=>{const reference=getComputedStyle(document.querySelector('.workspace-save-as')).backgroundColor;return [...document.querySelectorAll('.workspace-tool-content .operation-primary,.workspace-tool-content .action-button.primary')].every(button=>getComputedStyle(button).backgroundColor===reference)})()"
        )
        assert.equal(primary, true, 'Primary button color differs in ' + label + ' ' + theme)
      }
      win.webContents.send('menu:action', 'certificate')
      await wait('!!document.querySelector(".certificate-dialog")')
      await capture('certificate-' + theme.toLowerCase())
      await js(
        '[...document.querySelectorAll(".certificate-dialog button")].find(b=>b.textContent==="Close").click()'
      )
      win.webContents.send('menu:action', 'updates')
      await wait('!!document.querySelector(".modal-card")')
      await capture('updates-' + theme.toLowerCase())
      await js(
        '[...document.querySelectorAll(".modal-card button")].find(b=>b.textContent==="Close").click()'
      )
    }
    writeFileSync(
      join(out, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          geometry,
          checks: [
            'home/tools/document light and dark screenshots',
            '42px header and 48px global bar',
            'left workflow pane and right page rail',
            'Edit PDF and Back to All tools',
            'no toolbar overflow at 950px',
            'Menu opens Preferences'
          ]
        },
        null,
        2
      )
    )
    console.log('UI layout and interactions passed')
    app.exit(0)
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})
