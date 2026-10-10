const { app, BrowserWindow, dialog } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const directory = resolve(process.env.READIT_143_OUTPUT || 'release/smoke-1.4.3')
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
  process.env.READIT_143_APP
    ? resolve(process.env.READIT_143_APP, 'out/main/index.js')
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

async function click(point, count = 1) {
  window.focus()
  window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: count })
  window.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: count })
  await pause(100)
}
async function pointFor(text, end = false) {
  return js(`(()=>{const e=[...document.querySelectorAll('#page-1 [data-pdf-run]')].find(e=>e.textContent===${JSON.stringify(text)}),r=e.getBoundingClientRect();return {x:Math.round(${end?'r.right-1':'r.left+1'}),y:Math.round(r.top+r.height/2)}})()`)
}
async function submit(value) {
  await wait('!!document.querySelector("dialog[open] textarea")')
  await js(`document.querySelector('dialog textarea').value=${JSON.stringify(value)};document.querySelector('dialog form').requestSubmit()`)
  await pause(100)
}
app.whenReady().then(async () => {
  try {
    await wait('!!window.api && document.body.innerText.includes("Home")')
    await js('void(window.alert=message=>{window.__alert=message})')
    const pdf=await PDFDocument.create(), page=pdf.addPage([612,792])
    page.drawRectangle({x:0,y:0,width:612,height:792,color:rgb(.85,.9,.95)})
    // Deliberately word-major and reverse paint order, with a second text block.
    for(let n=19;n>=0;n--)page.drawText(`Line${String(n).padStart(2,'0')}`,{x:40,y:735-n*19,size:12})
    for(let n=0;n<20;n++)page.drawText(`alpha word ${String(n).padStart(2,'0')}`,{x:82,y:735-n*19,size:12})
    page.drawText('Other block remains intact',{x:40,y:280,size:15})
    const bytes=await pdf.save()
    await open(bytes,'fragmented-lines.pdf')
    await wait('document.querySelectorAll("#page-1 [data-pdf-run]").length>=41')
    await pause(300)
    const painted=await js("[...document.querySelectorAll('#page-1 [data-pdf-run]')].map(e=>e.textContent).filter(s=>s.trim())")
    for(let n=0;n<20;n++)assert.ok(painted.indexOf(`Line${String(n).padStart(2,'0')}`)<painted.indexOf(`alpha word ${String(n).padStart(2,'0')}`))
    checks.push('all 41 native text fragments detected and normalized from word-major drawing order')
    for(const [a,b] of [[0,17],[17,0],[6,18]]){
      const start=await pointFor(a>b?`alpha word ${String(a).padStart(2,'0')}`:`Line${String(a).padStart(2,'0')}`,a>b)
      const end=await pointFor(a>b?`Line${String(b).padStart(2,'0')}`:`alpha word ${String(b).padStart(2,'0')}`,a<b)
      window.webContents.sendInputEvent({type:'mouseDown',...start,button:'left',clickCount:1})
      for(let step=1;step<=30;step++){
        window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(start.x+(end.x-start.x)*step/30),y:Math.round(start.y+(end.y-start.y)*step/30),button:'left'})
        await pause(10)
      }
      window.webContents.sendInputEvent({type:'mouseUp',...end,button:'left',clickCount:1})
      await pause(120)
      const selected=await js('window.getSelection().toString()')
      for(let n=0;n<20;n++)assert.equal(selected.includes(`Line${String(n).padStart(2,'0')}`),n>=Math.min(a,b)&&n<=Math.max(a,b),selected)
      assert.ok(!selected.includes('Other block'),selected)
      await js('window.getSelection().removeAllRanges()')
    }
    checks.push('long forward, reverse and middle selection preserves 13–18 lines without jumping blocks')
    const word=await js("(()=>{const e=[...document.querySelectorAll('#page-1 [data-pdf-run]')].find(e=>e.textContent==='alpha word 00'),r=document.createRange();r.setStart(e.firstChild,6);r.setEnd(e.firstChild,10);const b=r.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()")
    await click(word,1);await click(word,2)
    assert.equal(await js('window.getSelection().toString()'),'word')
    checks.push('real double-click selects the whole native word')
    await js('window.getSelection().removeAllRanges();document.querySelector(\'[title="Edit PDF"]\').click()')
    await wait('!!document.querySelector("#page-1 [data-pdf-text]")')
    await js("window.dispatchEvent(new CustomEvent('pdf:editRun',{detail:{page:1,run:[...document.querySelectorAll('#page-1 [data-pdf-run]')].find(e=>e.textContent==='Other block remains intact').pdfRun}}))")
    await submit('A much longer replacement that continues beyond the original text area')
    await wait('!!document.querySelector("[data-edited-text] text")')
    await pause(700)
    // Hit near the appended tail, not within the original source box.
    const tail=await js("(()=>{const r=document.querySelector('[data-edited-text] text').getBoundingClientRect();return {x:Math.round(r.right-8),y:Math.round(r.top+r.height/2)}})()")
    await click(tail)
    await wait('!!document.querySelector("dialog[open] textarea")')
    assert.equal(await js("document.querySelector('dialog textarea').value"),'A much longer replacement that continues beyond the original text area')
    await submit('Second revision')
    await pause(300)
    assert.equal(await js('document.querySelectorAll("[data-edited-text]").length'),1)
    checks.push('appended replacement tail can be edited again without duplicating the edit')
    destination=join(directory,'background-edit.pdf')
    window.webContents.send('menu:action','saveAs')
    await wait('document.body.innerText.includes("background-edit.pdf")')
    const m=await import('mupdf'),saved=new m.PDFDocument(readFileSync(destination)),sp=saved.loadPage(0),st=sp.toStructuredText('')
    assert.ok(st.asText().includes('Second revision'))
    assert.ok(!st.asText().includes('Other block remains intact'))
    assert.ok(st.asText().includes('Line19'))
    const pix=sp.toPixmap([1,0,0,1,0,0],m.ColorSpace.DeviceRGB,false,true)
    const color=[...pix.getPixels().slice((507*pix.getWidth()+180)*pix.getNumberOfComponents(),(507*pix.getWidth()+180)*pix.getNumberOfComponents()+3)]
    assert.ok(color.every(c=>c<250)&&color[0]>200,JSON.stringify(color))
    pix.destroy();st.destroy();sp.destroy();saved.destroy()
    const preview=await js("(()=>{const c=document.querySelector('#page-1 canvas'),r=document.querySelector('[data-pdf-run]').closest('[data-page-slot]').getBoundingClientRect();return [...c.getContext('2d').getImageData(Math.floor(c.width*180/612),Math.floor(c.height*507/792),1,1).data]})()")
    assert.ok(preview[0]>200&&preview[0]<250,JSON.stringify(preview))
    checks.push('preview and saved replacement retain colored background without white masks; unrelated text survives')
    await js("(()=>{const node=document.querySelector('[data-edited-text] tspan').firstChild;const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)})()")
    await wait('!!document.querySelector(\'[title="Edit selected text"]\') && !document.querySelector(\'[title="Edit selected text"]\').disabled')
    const copied=await js("(()=>{const data=new DataTransfer();document.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain')})()")
    assert.equal(copied,'Second revision')
    await js("document.querySelector('[title=\"Edit selected text\"]').click()")
    await submit('Third revision')
    assert.equal(await js('document.querySelectorAll("[data-edited-text]").length'),1)
    checks.push('selecting an edited replacement supports Edit Text again and copies Unicode rather than private font glyph codes')
    const woff2=readFileSync('node_modules/@fontsource/lato/files/lato-latin-400-normal.woff2').toString('base64')
    await js(`(()=>{const input=document.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]'),files=new DataTransfer();files.items.add(new File([Uint8Array.from(atob(${JSON.stringify(woff2)}),c=>c.charCodeAt(0))],'Imported-Lato.woff2'));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait(`document.querySelector('select[title="Font family"]').value==='Imported-Lato'`)
    destination=join(directory,'woff2-edit.pdf');window.webContents.send('menu:action','saveAs')
    await wait('document.body.innerText.includes("woff2-edit.pdf")')
    const wdoc=new m.PDFDocument(readFileSync(destination)),wp=wdoc.loadPage(0),wt=wp.toStructuredText('')
    assert.ok(wt.asText().includes('Third revision'))
    const wnames=[];wt.walk({onChar(c,o,f){wnames.push(f.getName())}});assert.ok(wnames.some(name=>name.includes('Lato-Regular')))
    const wpx=wp.toPixmap([1,0,0,1,0,0],m.ColorSpace.DeviceRGB,false,true);wpx.destroy();wt.destroy();wp.destroy();wdoc.destroy()
    checks.push('WOFF2 import reconstructs valid font outlines through IPC and saves searchable text with the real face')


    await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Place on Click')).click()")
    await submit('Placed text\nSecond line\nThird line');await submit('12');await submit('#111827')
    const location=await js("(()=>{const r=document.querySelector('#page-1').getBoundingClientRect();return {x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.8)}})()")
    await click(location)
    await wait('!!document.querySelector("[data-anno-id] foreignObject")')
    assert.ok(await js("document.querySelector('[title=\"Select placed images and annotations\"]').classList.contains('active')"))
    const placed=await js("(()=>{const r=document.querySelector('[data-anno-id] foreignObject').getBoundingClientRect();return {x:Math.round(r.left+10),y:Math.round(r.bottom-8)}})()")
    await click(placed,1);await click(placed,2)
    await wait('!!document.querySelector("dialog[open] textarea")')
    assert.equal(await js("document.querySelector('dialog textarea').value"),'Placed text\nSecond line\nThird line')
    await submit('Placed revision')
    checks.push('placement returns to object selection and double-click edits placed text')
    await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add Rectangle')).click()")
    const shape=await js("(()=>{const r=document.querySelector('#page-1').getBoundingClientRect();return {x:Math.round(r.left+r.width*.6),y:Math.round(r.top+r.height*.6)}})()")
    window.webContents.sendInputEvent({type:'mouseDown',...shape,button:'left',clickCount:1});await pause(60)
    window.webContents.sendInputEvent({type:'mouseMove',x:shape.x+70,y:shape.y+30,button:'left'});await pause(60)
    window.webContents.sendInputEvent({type:'mouseUp',x:shape.x+70,y:shape.y+30,button:'left',clickCount:1})
    await pause(120)
    await js("document.querySelector('[title=\"Select placed images and annotations\"]').click()")
    await pause(180)
    const interior=await js("(()=>{const r=document.querySelector('[data-annotation-type=rect]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()")
    await click(interior)
    assert.equal(await js('document.querySelectorAll("[data-annotation-object][data-selected=true]").length'),1)
    assert.equal(await js('document.querySelector("[data-annotation-object][data-selected=true]").dataset.annotationType'),'rect')
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'DELETE'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'DELETE'})
    await pause(150)
    assert.equal(await js('document.querySelectorAll("[data-annotation-object]").length'),1)
    checks.push('object selection hits the interior of an unfilled rectangle and Delete removes that object')

    assert.equal(await js('!!document.querySelector(\'[aria-label="Thumbnail size"]\')'),false)
    await js('document.querySelector(\'[title="Close pane"]\').click()')
    await wait('!!document.querySelector("[data-thumbnail] img")')
    const thumbnail=await js("(()=>{const i=document.querySelector('[data-thumbnail] img');return {pixels:i.naturalWidth,width:i.getBoundingClientRect().width}})()")
    assert.ok(thumbnail.pixels>=thumbnail.width*1.9,JSON.stringify(thumbnail))
    const resolution=await js("(()=>{const c=document.querySelector('#page-1 canvas');return c.width/c.getBoundingClientRect().width})()")
    assert.ok(resolution>=1.99)
    checks.push('fixed thumbnails and main page render at double display resolution')
    destination=join(directory,'placed-saved.pdf');window.webContents.send('menu:action','saveAs')
    await wait('document.body.innerText.includes("placed-saved.pdf")')
    await open(new Uint8Array(readFileSync(destination)),'reopened-placed.pdf')
    await wait("[...document.querySelectorAll('#page-1 [data-pdf-run]')].some(e=>e.pdfRun?.pdfAnnotationId && e.textContent.includes('Placed revision'))")
    await js("document.querySelector('[title=\"Edit PDF\"]').click()")
    await js("window.dispatchEvent(new CustomEvent('pdf:editRun',{detail:{page:1,run:[...document.querySelectorAll('#page-1 [data-pdf-run]')].find(e=>e.pdfRun?.pdfAnnotationId).pdfRun}}))")
    await submit('Reopened revision')
    destination=join(directory,'placed-edited-again.pdf');window.webContents.send('menu:action','saveAs')
    await wait('document.body.innerText.includes("placed-edited-again.pdf")')
    const again=new m.PDFDocument(readFileSync(destination)),ap=again.loadPage(0),at=ap.toStructuredText('')
    assert.ok(at.asText().includes('Reopened revision'),at.asText())
    assert.ok(!at.asText().includes('Placed revision'))
    assert.equal(ap.getAnnotations().filter(a=>a.getType()==='FreeText').length,0)
    at.destroy();ap.destroy();again.destroy()
    checks.push('saved FreeText is detected after reopening and its original annotation is replaced rather than duplicated')

    assert.equal(errors.length,0,errors.join('\n'))
    writeFileSync(join(directory,'result.json'),JSON.stringify({passed:true,checks},null,2))
    console.log(JSON.stringify({passed:true,checks}));app.exit(0)
  }catch(error){console.error(error);writeFileSync(join(directory,'result.json'),JSON.stringify({passed:false,error:String(error),checks,errors},null,2));app.exit(1)}
})
