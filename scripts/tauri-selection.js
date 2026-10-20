;(async () => {
  const checks = {},
    errors = []
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (fn, label) => {
    const start = Date.now()
    while (!fn()) {
      if (Date.now() - start > 20000) throw Error(label + ' timed out')
      await pause(50)
    }
  }
  const keyboard = async (key, code, vk, ctrl = true) => {
    if (navigator.userAgent.includes('Windows')) {
      for (const type of ['keyDown', 'keyUp'])
        await invoke('desktop_test_input', {
          method: 'Input.dispatchKeyEvent',
          params: { type, key, code, windowsVirtualKeyCode: vk, modifiers: ctrl ? 2 : 0 }
        })
      return
    }
    const event = new KeyboardEvent('keydown', {
      key,
      code,
      ctrlKey: ctrl,
      bubbles: true,
      cancelable: true
    })
    ;(document.activeElement || document.body).dispatchEvent(event)
    return event
  }
  const copy = () => {
    let text = null
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        setData: (type, value) => {
          if (type === 'text/plain') text = value
        }
      }
    })
    document.dispatchEvent(event)
    return text
  }
  const selectAll = async () => {
    document.activeElement?.blur()
    await keyboard('a', 'KeyA', 65)
    await wait(
      () => document.querySelector('[data-pdf-viewer][data-select-all="ready"]'),
      'PDF Select All'
    )
    return copy()
  }
  try {
    await wait(() => document.querySelector('#page-1 [data-pdf-run]'), 'Reader')
    const text = await selectAll()
    checks.document_only =
      window.getSelection().anchorNode === document.querySelector('[data-pdf-pages]') &&
      !window.getSelection().toString().includes('All tools') &&
      !text.includes('Re-Edit PDF')
    checks.offscreen_pages_copied =
      text.includes('Document page 32 unique marker') &&
      !document.querySelector('#page-32 [data-pdf-run]')
    checks.all_pages_once_in_order =
      (text.match(/unique marker/g) || []).length === 32 &&
      text.indexOf('Document page 2 ') < text.indexOf('Document page 31 ')
    await keyboard('Escape', 'Escape', 27, false)
    checks.escape_clears_selection =
      !document.querySelector('[data-select-all]') && window.getSelection().isCollapsed

    await keyboard('f', 'KeyF', 70)
    await wait(() => document.querySelector('input[aria-label="Find in document"]'), 'Find')
    const find = document.querySelector('input[aria-label="Find in document"]')
    find.value = 'Search field text'
    find.focus()
    find.setSelectionRange(0, 0)
    const event = await keyboard('a', 'KeyA', 65)
    checks.find_owns_select_all =
      !document.querySelector('[data-select-all]') &&
      (navigator.userAgent.includes('Windows')
        ? find.selectionStart === 0 && find.selectionEnd === find.value.length
        : !event.defaultPrevented)
    await keyboard('Escape', 'Escape', 27, false)
    find.blur()

    document.querySelector('[title="Page display options"]').click()
    await wait(
      () =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === 'Single page'
        ),
      'Page display menu'
    )
    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Single page')
      .click()
    await pause(100)
    const single = await selectAll()
    checks.single_page_scope =
      single.includes('Document page 1 unique marker') && !single.includes('Document page 2 ')
    await keyboard('Escape', 'Escape', 27, false)

    document.querySelector('[title="Edit PDF"]').click()
    const span = document.querySelector('#page-1 [data-pdf-run]')
    const range = document.createRange()
    range.selectNodeContents(span)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    document.activeElement?.blur()
    await keyboard('e', 'KeyE', 69)
    await wait(() => document.querySelector('[aria-label="Edit text on page"]'), 'Inline editor')
    const input = document.querySelector('[aria-label="Edit text on page"]')
    input.focus()
    input.setSelectionRange(0, 0)
    const editEvent = await keyboard('a', 'KeyA', 65)
    checks.editor_owns_select_all =
      !document.querySelector('[data-select-all]') &&
      (navigator.userAgent.includes('Windows')
        ? input.selectionEnd === input.value.length
        : !editEvent.defaultPrevented)
    input.value = 'Replacement Unicode café'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.pdf-inline-actions .operation-primary').click()
    await wait(() => !document.querySelector('.pdf-inline-editor'), 'Apply edit')
    const edited = await selectAll()
    checks.replacements_copied_once =
      edited.includes('Replacement Unicode café') &&
      !edited.includes('Document page 1 unique marker') &&
      (edited.match(/Replacement/g) || []).length === 1

    await keyboard('Escape', 'Escape', 27, false)
    document.querySelector('.workspace-menu-trigger').click()
    await wait(
      () =>
        [
          ...document.querySelectorAll('.workspace-menu-root > .workspace-menu-group > button')
        ].some((button) => button.textContent.trim() === 'Edit'),
      'Application menu'
    )
    ;[...document.querySelectorAll('.workspace-menu-root > .workspace-menu-group > button')]
      .find((button) => button.textContent.trim() === 'Edit')
      .click()
    await wait(
      () =>
        [...document.querySelectorAll('[role="menuitem"]')].some((button) =>
          button.textContent.startsWith('Select All')
        ),
      'Edit menu'
    )
    ;[...document.querySelectorAll('[role="menuitem"]')]
      .find((button) => button.textContent.startsWith('Select All'))
      .click()
    await wait(() => document.querySelector('[data-select-all="ready"]'), 'Menu Select All')
    checks.edit_menu_select_all = copy() === edited

    await keyboard('k', 'KeyK', 75)
    await wait(() => document.querySelector('.preferences-card'), 'Preferences')
    document.activeElement?.blur()
    await keyboard('a', 'KeyA', 65)
    checks.modal_does_not_select_document =
      !document.querySelector('[data-select-all]') && window.getSelection().isCollapsed
    await keyboard('s', 'KeyS', 83)
    checks.modal_blocks_document_save = !document.querySelector('.file-dialog')
    await keyboard('Escape', 'Escape', 27, false)
    await wait(() => !document.querySelector('.preferences-card'), 'Close preferences')
    await selectAll()
    document.querySelector('[title="Close tab"]').click()
    await wait(() => document.querySelector('.app-dialog'), 'Unsaved close')
    ;[...document.querySelectorAll('.app-dialog button')]
      .find((button) => button.textContent === 'Don’t save')
      .click()
    await wait(() => !document.querySelector('[data-pdf-viewer]'), 'Close document')
    await keyboard('a', 'KeyA', 65)
    checks.home_does_not_select_chrome =
      window.getSelection().isCollapsed && !document.querySelector('[data-select-all]')
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
