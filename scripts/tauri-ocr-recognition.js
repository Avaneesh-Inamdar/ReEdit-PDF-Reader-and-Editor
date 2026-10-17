// Real offline OCR through the app UI, using generate-ocr-paper --image-only.
;(async () => {
  const checks = {},
    errors = [],
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (fn, label, timeout = 20000) => {
    const start = Date.now()
    while (!fn()) {
      if (Date.now() - start > timeout) throw Error(label + ' timed out')
      await pause(80)
    }
  }
  try {
    await wait(
      () => document.querySelector('#page-1 canvas[data-render-ready="true"]'),
      'Scan reader'
    )
    checks.no_text_before = !document.querySelector('#page-1 [data-pdf-run]')
    if (!document.querySelector('[title="Scan & OCR"]'))
      document.querySelector('[title="All tools"]').click()
    await wait(() => document.querySelector('[title="Scan & OCR"]'), 'OCR tool')
    document.querySelector('[title="Scan & OCR"]').click()
    await wait(() => document.querySelector('.ocr-workflow .operation-primary'), 'OCR controls')
    document.querySelector('.ocr-workflow .operation-primary').click()
    await wait(
      () =>
        document.querySelector('.ocr-status')?.textContent.startsWith('OCR complete') ||
        document.querySelector('.ocr-status')?.textContent.startsWith('Recognition failed'),
      'Recognition',
      65000
    )
    const status = document.querySelector('.ocr-status').textContent
    if (!status.startsWith('OCR complete')) throw Error(status)
    await wait(() => document.querySelector('#page-1 [data-pdf-run]'), 'Searchable layer')
    const spans = [...document.querySelectorAll('#page-1 [data-pdf-run]')].filter((span) =>
      span.textContent.trim()
    )
    const words = spans
      .map((span) => span.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
    checks.body_recognized =
      words.includes('Original scanned text') && words.includes('Keep this next line unchanged')
    checks.small_footer_recognized = words.includes('Small isolated footer 12345')
    checks.all_words_have_selection_geometry = spans.every(
      (span) =>
        span.pdfRun &&
        span.getBoundingClientRect().width > 0 &&
        span.getBoundingClientRect().height > 0
    )
    await invoke('desktop_test_snapshot', { name: 'editing' })
    if (Object.values(checks).some((value) => !value)) throw Error('OCR result: ' + words)
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', { result: { checks, errors } })
  await window.api.forceClose()
})()
