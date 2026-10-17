// Runs only through the opt-in desktop-test harness with generated/local fixtures.
;(async () => {
  const checks = {},
    errors = [],
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (fn, label) => {
    const start = Date.now()
    while (!fn()) {
      if (Date.now() - start > 20000) throw Error(label + ' timed out')
      await pause(60)
    }
  }
  try {
    await wait(() => document.querySelector('#page-1 [data-pdf-run]'), 'Reader')
    document.querySelector('[title="Conversion tools"]').click()
    await wait(() => document.querySelector('.workspace-convert-menu'), 'Conversion menu')
    const menu = document.querySelector('.workspace-convert-menu'),
      rect = menu.getBoundingClientRect()
    checks.convert_surface =
      rect.height > 50 &&
      getComputedStyle(menu).backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      rect.top >=
        document.querySelector('[title="Conversion tools"]').getBoundingClientRect().bottom
    document.querySelector('[title="Conversion tools"]').click()
    document.querySelector('[title="Edit PDF"]').click()
    await wait(() => document.querySelector('.document-objects'), 'Object removal controls')
    checks.removal_controls = !![...document.querySelectorAll('.document-objects button')].find(
      (button) => button.textContent.includes('scanned')
    )
    const span = document.querySelector('#page-1 [data-pdf-run]')
    const original = span.textContent
    // Reproduce the unavailable-font case while preserving the fixture's real geometry.
    span.pdfRun.fontFamily = 'MissingCommercialTypeface'
    span.pdfRun.fontData = undefined
    span.pdfRun.fontGlyphs = undefined
    span.pdfRun.previewFont = undefined
    const end = original.indexOf(' ') > 0 ? original.indexOf(' ') : Math.min(4, original.length)
    const range = document.createRange()
    range.setStart(span.firstChild, 0)
    range.setEnd(span.firstChild, end)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'e',
        code: 'KeyE',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    )
    await wait(
      () => document.querySelector('[aria-label="Edit text on page"]'),
      'Selected word edit'
    )
    const input = document.querySelector('[aria-label="Edit text on page"]')
    checks.selection_keeps_sentence =
      input.value === original && input.selectionStart === 0 && input.selectionEnd === end
    input.value = 'ExpandedReplacement' + input.value.slice(end)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(
      () => document.querySelector('.pdf-inline-notice').textContent.includes('Using'),
      'Automatic font match'
    )
    checks.font_fallback_visible = true
    document.querySelector('.pdf-inline-actions .operation-primary').click()
    await wait(
      () =>
        !document.querySelector('.pdf-inline-editor') &&
        document.querySelector('[data-edited-text]'),
      'Apply replacement'
    )
    checks.replacement_keeps_following_words =
      document.querySelector('[data-replacement-text]').textContent ===
      'ExpandedReplacement' + original.slice(end)
    checks.no_font_error = !document.querySelector('.pdf-inline-actions .operation-error')
    await pause(1000)
    const initialFonts=document.fonts.size
    for(let i=0;i<6;i++){
      document.querySelector('[data-edited-text] rect').dispatchEvent(new MouseEvent('click',{bubbles:true}))
      await wait(()=>document.querySelector('.pdf-inline-editor'),'Repeat edit')
      await pause(100)
      document.querySelector('.pdf-inline-actions .operation-secondary').click()
      await wait(()=>!document.querySelector('.pdf-inline-editor'),'Cancel repeat edit')
    }
    await pause(500)
    checks.font_faces_bounded=document.fonts.size<=initialFonts+1
    if (navigator.userAgent.includes('Windows')) await invoke('desktop_test_snapshot', { name: 'editing' })
    if (Object.values(checks).some((value) => !value))
      throw Error(
        'Failed: ' +
          Object.entries(checks)
            .filter(([, value]) => !value)
            .map(([key]) => key)
            .join(', ')
      )
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', { result: { checks, errors } })
  await window.api.forceClose()
})()
