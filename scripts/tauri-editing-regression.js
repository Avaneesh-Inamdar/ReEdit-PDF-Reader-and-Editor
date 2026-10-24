/* eslint-disable @typescript-eslint/explicit-function-return-type -- Injected browser JavaScript cannot contain TypeScript return annotations. */
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
    checks.tool_button_labels_fit = [
      ...document.querySelectorAll('.document-objects button')
    ].every(
      (button) =>
        button.scrollWidth <= button.clientWidth + 1 &&
        button.scrollHeight <= button.clientHeight + 1
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
    const initialFonts = document.fonts.size
    for (let i = 0; i < 6; i++) {
      document
        .querySelector('[data-edited-text] rect')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(() => document.querySelector('.pdf-inline-editor'), 'Repeat edit')
      await pause(100)
      document.querySelector('.pdf-inline-actions .operation-secondary').click()
      await wait(() => !document.querySelector('.pdf-inline-editor'), 'Cancel repeat edit')
    }
    await pause(500)
    checks.font_faces_bounded = document.fonts.size <= initialFonts + 1
    // A real uniform paragraph below the original fixture content exercises the
    // detected-box workflow, preserving the earlier selection/font assertions.
    const paragraph = [...document.querySelectorAll('#page-1 [data-pdf-run]')].find((item) =>
      item.textContent.startsWith('Editable paragraph begins')
    )
    if (!paragraph) throw Error('Regenerate simple-text.pdf with the paragraph fixture')
    const openParagraph = () =>
      window.dispatchEvent(
        new CustomEvent('pdf:editRun', {
          detail: { page: 1, run: paragraph.pdfRun }
        })
      )
    const arrow = (label, key) =>
      document
        .querySelector(`[aria-label="${label}"]`)
        .dispatchEvent(
          new KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true, cancelable: true })
        )
    const existingIds = new Set(
      [...document.querySelectorAll('[data-edited-text]')].map((item) => item.dataset.editedText)
    )
    openParagraph()
    await wait(
      () => document.querySelector('[aria-label="Move text box"]'),
      'Paragraph geometry controls'
    )
    const paragraphInput = document.querySelector('[aria-label="Edit text on page"]')
    const originalWidth = parseFloat(paragraphInput.style.width),
      originalSize = paragraphInput.style.fontSize
    checks.paragraph_detected =
      paragraphInput.value.includes('Following paragraph text keeps its size') &&
      paragraphInput.value.includes('Final paragraph line ends here.')
    for (let index = 0; index < 5; index++) arrow('Resize text box from right', 'ArrowLeft')
    const narrowedWidth = parseFloat(paragraphInput.style.width)
    const initialTransform = new DOMMatrix(
      document.querySelector('.pdf-inline-editor').style.transform
    )
    arrow('Move text box', 'ArrowRight')
    arrow('Move text box', 'ArrowUp')
    const movedTransform = new DOMMatrix(
      document.querySelector('.pdf-inline-editor').style.transform
    )
    checks.paragraph_resize_preserves_size =
      Math.abs(narrowedWidth - (originalWidth - 50)) < 0.01 &&
      paragraphInput.style.fontSize === originalSize &&
      paragraphInput.wrap === 'soft'
    checks.paragraph_move_uses_page_transform =
      Math.abs(
        movedTransform.e - initialTransform.e - initialTransform.a * 10 + initialTransform.c * 10
      ) < 0.01 &&
      Math.abs(
        movedTransform.f - initialTransform.f - initialTransform.b * 10 + initialTransform.d * 10
      ) < 0.01
    document.querySelector('.pdf-inline-actions .operation-primary').click()
    await wait(
      () =>
        !document.querySelector('.pdf-inline-editor') &&
        [...document.querySelectorAll('[data-edited-text]')].some(
          (item) => !existingIds.has(item.dataset.editedText)
        ),
      'Confirm box geometry'
    )
    const movedBox = [...document.querySelectorAll('[data-edited-text]')].find(
      (item) => !existingIds.has(item.dataset.editedText)
    )
    const reopen = async () => {
      movedBox.querySelector('rect').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(() => document.querySelector('[aria-label="Move text box"]'), 'Reopen moved box')
    }
    await reopen()
    checks.paragraph_done_keeps_geometry =
      Math.abs(
        parseFloat(document.querySelector('[aria-label="Edit text on page"]').style.width) -
          narrowedWidth
      ) < 0.01 &&
      new DOMMatrix(document.querySelector('.pdf-inline-editor').style.transform).e ===
        movedTransform.e
    arrow('Resize text box from left', 'ArrowRight')
    document.querySelector('.pdf-inline-actions .operation-secondary').click()
    await wait(() => !document.querySelector('.pdf-inline-editor'), 'Cancel box geometry')
    await reopen()
    checks.paragraph_cancel_restores_geometry =
      Math.abs(
        parseFloat(document.querySelector('[aria-label="Edit text on page"]').style.width) -
          narrowedWidth
      ) < 0.01 &&
      new DOMMatrix(document.querySelector('.pdf-inline-editor').style.transform).e ===
        movedTransform.e
    document.querySelector('[title="Close pane"]').click()
    await wait(() => !document.querySelector('.pdf-inline-editor'), 'Leave Edit')
    checks.paragraph_no_leftover_controls =
      !document.querySelector('[aria-label="Move text box"]') &&
      [...document.querySelectorAll('[data-edited-text] rect')].every(
        (item) => item.getAttribute('stroke') === 'none'
      )
    if (navigator.userAgent.includes('Windows'))
      await invoke('desktop_test_snapshot', { name: 'editing' })
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
