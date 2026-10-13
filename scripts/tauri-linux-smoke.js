;(async () => {
  const checks = {},
    errors = [],
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (condition, label) => {
    const start = Date.now()
    while (!condition()) {
      if (Date.now() - start > 25000) throw Error(label + ' timed out')
      await pause(75)
    }
  }
  try {
    await wait(() => window.api && document.querySelector('#page-1 [data-pdf-run]'), 'Linux reader')
    const page = document.querySelector('#page-1 canvas')
    checks.reader_rendered = page.width > 100 && page.height > 100
    const fonts = await window.api.getSystemFonts()
    checks.font_discovery = fonts.length > 0
    const path = await window.api.getCurrentPath(),
      bytes = await window.api.readPdf(path)
    checks.pdf_transport = new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5)) === '%PDF-'
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })
    )
    await wait(() => document.querySelector('input[aria-label="Find in document"]'), 'Find')
    checks.find_opens = true
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    document.querySelector('[title="Print (Ctrl+P)"]').click()
    await wait(
      () => document.querySelector('.print-preview canvas')?.dataset.paperWidth,
      'Native print preview'
    )
    checks.print_preview = true
    const orientation = [...document.querySelectorAll('.print-settings select')].find((item) =>
      [...item.options].some((option) => option.value === 'landscape')
    )
    orientation.value = 'landscape'
    orientation.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(
      () =>
        Number(document.querySelector('.print-preview canvas').dataset.paperWidth) >
        Number(document.querySelector('.print-preview canvas').dataset.paperHeight),
      'Landscape'
    )
    checks.landscape_preview = true
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    await wait(() => !document.querySelector('.print-dialog'), 'Close print')
    await pause(100)
    checks.print_session_released = (await invoke('desktop_test_sessions')) === 0
    const answer = window.api.confirmClose('test.pdf')
    await wait(() => document.querySelector('.app-dialog'), 'Centered dialog')
    const dialog = document.querySelector('.app-dialog'),
      rect = dialog.getBoundingClientRect()
    checks.centered_dialog =
      Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 &&
      Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2
    ;[...dialog.querySelectorAll('button')]
      .find((button) => button.textContent === 'Cancel')
      .click()
    checks.dialog_cancel = (await answer) === 'cancel'
    if (Object.values(checks).some((value) => !value))
      throw Error('Linux checks failed: ' + JSON.stringify(checks))
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', {
    result: { checks, errors, userAgent: navigator.userAgent }
  })
  await window.api.forceClose()
})()
