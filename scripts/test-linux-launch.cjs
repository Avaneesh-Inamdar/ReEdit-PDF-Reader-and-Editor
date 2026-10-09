// Test the installed executable's file-URI handling, independently of the Electron harness.
const { spawn } = require('node:child_process')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { writeFileSync } = require('node:fs')
const binary = process.argv[2] || '/opt/Re-Edit PDF/re-edit-pdf'
const report = process.argv[3] || 'release/linux-launch.json'
const args = ['--remote-debugging-port=9230', pathToFileURL(resolve('test-fixtures/simple-text.pdf')).href]
if (process.getuid() === 0) args.unshift('--no-sandbox')
const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] })
let stderr = ''
child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000) })
child.on('error', error => { console.error(error); process.exitCode = 1 })
async function evaluate(url) {
  return new Promise((resolveResult, reject) => {
    const socket = new WebSocket(url)
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `document.body.innerText.includes('simple-text.pdf') && !!document.querySelector('#page-1 [data-pdf-run]') && document.querySelector('#page-1 canvas').width > 0`, returnByValue: true
    } }))
    socket.onmessage = event => { const reply = JSON.parse(event.data); if (reply.id === 1) { socket.close(); resolveResult(reply.result?.result?.value === true) } }
    socket.onerror = reject
  })
}
;(async () => {
  try {
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      try {
        const pages = await (await fetch('http://127.0.0.1:9230/json/list')).json()
        const page = pages.find(page => page.type === 'page' && page.url.includes('app.asar/out/renderer/index.html'))
        if (page && await evaluate(page.webSocketDebuggerUrl)) {
          writeFileSync(report, JSON.stringify({ passed: true, binary, fileUriOpen: true, pdfRendered: true }, null, 2))
          console.log('Installed executable opened and rendered the PDF file URI')
          return
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error('Installed executable did not render the supplied PDF file URI. ' + stderr)
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { child.kill('SIGTERM') }
})()
