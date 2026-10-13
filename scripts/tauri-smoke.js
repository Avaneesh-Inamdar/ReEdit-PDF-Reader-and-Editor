// Executed only by the desktop-test Cargo feature against the real app WebView.
;(async () => {
  const checks = {},
    errors = [],
    cycles = []
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const wait = async (condition, label, timeout = 25000) => {
    const start = Date.now()
    while (!condition()) {
      if (Date.now() - start > timeout) throw Error(label + ' timed out')
      await pause(100)
    }
  }
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const key = (target, k, extra = {}) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })
    )
  try {
    await wait(() => window.api && document.querySelector('#page-1 .textLayer span'), 'Reader')
    checks.reader = true
    const page = document.querySelector('#page-1 canvas')
    checks.rendered = page.width > 0 && page.height > 0
    checks.layout =
      !!document.querySelector('.workspace-document-rail') &&
      !!document.querySelector('.workspace-global-bar')
    await invoke('desktop_test_snapshot', { name: 'reader' })
    const fonts = await window.api.getSystemFonts()
    if (!fonts.length) throw Error('System font list is empty')
    const font = await window.api.readSystemFont(fonts[0].id)
    const normalized = await window.api.normalizeImportedFont(font)
    checks.binary_font_transport =
      normalized.byteLength === font.byteLength && font.byteLength > 100
    const path = await window.api.getCurrentPath()
    const data = await window.api.readPdf(path)
    checks.binary_pdf_transport =
      new TextDecoder().decode(new Uint8Array(data).slice(0, 5)) === '%PDF-'
    const viewer = document.querySelector('[data-pdf-viewer]')
    const oldWidth = document.querySelector('#page-1').getBoundingClientRect().width
    viewer.dispatchEvent(
      new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -30,
        bubbles: true,
        cancelable: true,
        clientX: 400,
        clientY: 300
      })
    )
    await wait(
      () => document.querySelector('#page-1').getBoundingClientRect().width > oldWidth,
      'PDF pinch event'
    )
    checks.pinch_event = true
    checks.webview_page_zoom_unchanged = window.visualViewport.scale === 1
    key(document.body, 'f', { ctrlKey: true })
    await wait(() => document.querySelector('input[aria-label="Find in document"]'), 'Find')
    const input = document.querySelector('input[aria-label="Find in document"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'quick')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await pause(150)
    document.querySelector('.find-query button').click()
    await wait(() => document.querySelector('.search-highlight'), 'Search highlights')
    checks.search = true
    key(input, 'Escape')
    await wait(
      () =>
        !document.querySelector('.document-find-panel') &&
        !document.querySelector('.search-highlight'),
      'Clear Find'
    )
    checks.search_close_clears_highlights = true
    const sidebar = document.querySelector('[aria-label="Toggle navigation sidebar"]')
    const before = sidebar.getAttribute('aria-expanded')
    sidebar.click()
    await pause(150)
    checks.sidebar = sidebar.getAttribute('aria-expanded') !== before
    document.querySelector('[title="Print (Ctrl+P)"]').click()
    await wait(
      () =>
        document.querySelector('.print-preview canvas')?.width > 0 &&
        document.querySelector('.print-preview canvas')?.height > 0,
      'Print preview'
    )
    await pause(500)
    checks.print_dialog = true
    await invoke('desktop_test_snapshot', { name: 'print' })
    key(document.body, 'Escape')
    await wait(() => !document.querySelector('.print-dialog'), 'Close print dialog')
    checks.print_escape = true
    for (let index = 0; index < 12; index++) {
      const started = performance.now()
      document.querySelector('[title="Close tab"]').click()
      await wait(() => !document.querySelector('#page-1'), 'Close fixture')
      await invoke('desktop_test_reopen')
      await wait(
        () =>
          document.querySelector('#page-1 .textLayer span') &&
          document.querySelector('#page-1 canvas')?.width > 0,
        'Reopen fixture'
      )
      await pause(700)
      cycles.push({
        index: index + 1,
        milliseconds: Math.round(performance.now() - started),
        jsHeap: performance.memory?.usedJSHeapSize ?? null
      })
    }
    checks.repeated_open_close = cycles.length === 12
    if (Object.values(checks).some((value) => !value)) throw Error('A check returned false')
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', {
    result: { checks, errors, cycles, userAgent: navigator.userAgent }
  })
  await window.api.forceClose()
})()
