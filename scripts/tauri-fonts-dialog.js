// Local validation inside the real WebView; does not save or modify user files.
;(async () => {
  const checks = {},
    errors = []
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const wait = async (condition, label) => {
    const start = Date.now()
    while (!condition()) {
      if (Date.now() - start > 15000) throw Error(label + ' timed out')
      await pause(50)
    }
  }
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  try {
    await wait(() => window.api && document.querySelector('#page-1 [data-pdf-run]'), 'Reader')
    const centered = (dialog) => {
      const rect = dialog.getBoundingClientRect()
      return (
        Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 &&
        Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2 &&
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight
      )
    }
    for (const [label, result] of [
      ['Cancel', 'cancel'],
      ['Don’t save', 'discard'],
      ['Save', 'save']
    ]) {
      const answer = window.api.confirmClose('Edited document.pdf')
      await wait(() => document.querySelector('.app-dialog[open]'), 'Unsaved changes')
      const dialog = document.querySelector('.app-dialog')
      checks['centered_' + result] = centered(dialog)
      if (result === 'cancel') await invoke('desktop_test_snapshot', { name: 'save' })
      const button = [...dialog.querySelectorAll('button')].find(
        (button) => button.textContent === label
      )
      button.click()
      checks['answer_' + result] =
        (await answer) === result && !document.querySelector('.app-dialog')
    }
    document.querySelector('[title="Edit PDF"]').click()
    await pause(250)
    const span = document.querySelector('#page-1 [data-pdf-run]')
    window.dispatchEvent(new CustomEvent('pdf:editRun', { detail: { page: 1, run: span.pdfRun } }))
    await wait(() => document.querySelector('.pdf-inline-actions select'), 'Inline font chooser')
    const chooser = document.querySelector('.pdf-inline-actions select')
    checks.new_font_families = [
      'Arimo',
      'Tinos',
      'Cousine',
      'Carlito',
      'Caladea',
      'Roboto Condensed',
      'Montserrat'
    ].every((name) => [...chooser.options].some((option) => option.value === 'bundled:' + name))
    checks.alternative_labels = [...chooser.options].some((option) =>
      option.textContent.includes('alternative to Calibri')
    )
    await document.fonts.load('16px "Carlito"')
    await document.fonts.load('16px "Arimo"')
    checks.font_assets_load =
      document.fonts.check('16px "Carlito"') && document.fonts.check('16px "Arimo"')
    chooser.value = 'bundled:Carlito'
    chooser.dispatchEvent(new Event('change', { bubbles: true }))
    const editor = document.querySelector('[aria-label="Edit text on page"]')
    checks.replacement_spacing_reset =
      editor.style.wordSpacing === '0px' && editor.style.letterSpacing === '0px'
    document.querySelector('.pdf-inline-actions .operation-secondary').click()
    await wait(() => !document.querySelector('.pdf-inline-editor'), 'Cancel editor')
    checks.editor_cleanup = !document.querySelector('.pdf-inline-actions')
    if (Object.values(checks).some((value) => !value))
      throw Error(
        'Failed checks: ' +
          Object.entries(checks)
            .filter(([, value]) => !value)
            .map(([key]) => key)
            .join(', ')
      )
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', {
    result: { checks, errors, userAgent: navigator.userAgent }
  })
  await window.api.forceClose()
})()
