;(async () => {
  const checks = {},
    errors = [],
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (condition, label) => {
    const start = Date.now()
    while (!condition()) {
      if (Date.now() - start > 20000) throw Error(label + ' timed out')
      await pause(60)
    }
  }
  try {
    await wait(() => document.querySelector('#page-1 [data-pdf-run]'), 'OCR reader')
    document.querySelector('[title="Edit PDF"]').click()
    await pause(200)
    const span = [...document.querySelectorAll('#page-1 [data-pdf-run]')].find((span) =>
      span.textContent.includes('Original')
    )
    checks.invisible_ocr_source = span.pdfRun.invisible === true
    window.dispatchEvent(new CustomEvent('pdf:editRun', { detail: { page: 1, run: span.pdfRun } }))
    await wait(
      () => document.querySelector('[aria-label="Edit text on page"]'),
      'OCR inline editor'
    )
    const editor = document.querySelector('[aria-label="Edit text on page"]')
    editor.value = 'Changed scanned text'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.pdf-inline-actions .operation-primary').click()
    await wait(
      () =>
        !document.querySelector('.pdf-inline-editor') &&
        document.querySelector('[data-edited-text]'),
      'OCR applied'
    )
    await pause(1200)
    await invoke('desktop_test_snapshot', { name: 'editing' })
    const rect = document.querySelector('[data-edited-text] rect')
    rect.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(
      () => document.querySelector('[aria-label="Edit text on page"]'),
      'Repeated OCR edit'
    )
    checks.can_reedit =
      document.querySelector('[aria-label="Edit text on page"]').value === 'Changed scanned text'
    document.querySelector('.pdf-inline-actions .operation-secondary').click()
    const protocol = (method, params) => invoke('desktop_test_input', { method, params })
    await protocol('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'S',
      code: 'KeyS',
      windowsVirtualKeyCode: 83,
      modifiers: 10
    })
    await protocol('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'S',
      code: 'KeyS',
      windowsVirtualKeyCode: 83,
      modifiers: 10
    })
    await wait(() => document.querySelector('.file-dialog[open]'), 'Save OCR copy')
    const address = document.querySelector('[aria-label="Folder path"]')
    address.value = await invoke('desktop_test_output')
    address.form.requestSubmit()
    await wait(
      () => document.querySelector('.file-dialog').dataset.folder?.includes('native-validation'),
      'Destination'
    )
    document.querySelector('[aria-label="File name"]').value = 'ocr-edited.pdf'
    document.querySelector('.file-dialog .operation-primary').click()
    await pause(200)
    document.querySelector('.app-dialog .operation-primary')?.click()
    await wait(() => !document.querySelector('.file-dialog'), 'Save completed')
    await pause(600)
    checks.saved_pdf =
      (await window.api.readPdf(await window.api.getCurrentPath())).byteLength > 100
    if (Object.values(checks).some((value) => !value)) throw Error('OCR checks failed')
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', { result: { checks, errors } })
  await window.api.forceClose()
})()
