/* eslint-disable @typescript-eslint/explicit-function-return-type -- Injected browser JavaScript cannot contain TypeScript return annotations. */
;(async () => {
  const checks = {},
    errors = [],
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (test, label) => {
    const start = Date.now()
    while (!test()) {
      if (Date.now() - start > 20000) throw Error(label + ' timed out')
      await pause(60)
    }
  }
  const key = async (key, code, vk, modifiers = 0, text) => {
    for (const type of ['keyDown', 'keyUp'])
      await invoke('desktop_test_input', {
        method: 'Input.dispatchKeyEvent',
        params: {
          type,
          key,
          code,
          windowsVirtualKeyCode: vk,
          modifiers,
          ...(type === 'keyDown' && text ? { text } : {})
        }
      })
  }
  const selectedPage = () => document.querySelector('.workspace-status')?.textContent || ''
  const handling = (value) =>
    [...document.querySelectorAll('.print-handling label')]
      .find((label) => label.textContent.trim() === value)
      .click()
  const sheetCount = (value) =>
    document.querySelector('.print-preview-navigation')?.textContent.includes(`of ${value}`)
  try {
    await wait(() => document.querySelector('#page-1 [data-pdf-run]'), 'Reader')
    await key('F10', 'F10', 121)
    await wait(() => document.activeElement?.dataset.menuGroup === 'File', 'Keyboard menu')
    checks.menu_keyboard_opens = true
    await key('ArrowDown', 'ArrowDown', 40)
    checks.menu_next_group = document.activeElement?.dataset.menuGroup === 'Edit'
    await key('ArrowRight', 'ArrowRight', 39)
    await wait(() => document.activeElement?.closest('.workspace-menu-flyout'), 'Flyout focus')
    checks.menu_skips_disabled = document.activeElement.textContent.startsWith('Select All')
    await key('Escape', 'Escape', 27)
    checks.escape_returns_parent = document.activeElement?.dataset.menuGroup === 'Edit'
    await key('Escape', 'Escape', 27)
    checks.escape_returns_trigger =
      document.activeElement?.classList.contains('workspace-menu-trigger') &&
      !document.querySelector('.workspace-menu-root')
    await key(' ', 'Space', 32)
    await wait(() => document.querySelector('.workspace-menu-root'), 'Space activates menu button')
    checks.space_activates_button = true
    await key('Escape', 'Escape', 27)

    document.querySelector('[data-pdf-viewer]').focus()
    await key('ArrowRight', 'ArrowRight', 39)
    await wait(() => selectedPage().includes('Page 2 size:'), 'Next page')
    checks.page_arrow = true
    await key('N', 'KeyN', 78, 10)
    await wait(
      () => document.activeElement?.classList.contains('document-rail-page'),
      'Go to page field'
    )
    checks.goto_page_shortcut =
      document.activeElement.selectionEnd === document.activeElement.value.length
    await key('5', 'Digit5', 53, 0, '5')
    await key('Enter', 'Enter', 13)
    await wait(() => selectedPage().includes('Page 5 size:'), 'Typed page number')
    checks.goto_page_applies = true
    document.querySelector('[data-pdf-viewer]').focus()
    await key('End', 'End', 35)
    await wait(() => selectedPage().includes('Page 32 size:'), 'Last page')
    checks.last_page = true
    await key('Home', 'Home', 36)
    await wait(() => selectedPage().includes('Page 1 size:'), 'First page')
    checks.first_page = true
    await key('F6', 'F6', 117)
    checks.focus_cycles_panes = !!document.activeElement?.closest('.workspace-tools-pane')

    await key('p', 'KeyP', 80, 2)
    await wait(
      () => document.querySelector('.print-preview canvas')?.dataset.paperWidth,
      'Print preview'
    )
    handling('Multiple')
    await wait(() => sheetCount(8), 'Multiple preview pages')
    checks.multiple_preview = true
    document.querySelector('.print-handling').scrollIntoView({ block: 'nearest' })
    await invoke('desktop_test_snapshot', { name: 'print' })
    handling('Booklet')
    await wait(() => sheetCount(16), 'Booklet preview sides')
    const canvas = document.querySelector('.print-preview canvas')
    await wait(
      () => Number(canvas.dataset.paperWidth) > Number(canvas.dataset.paperHeight),
      'Booklet landscape'
    )
    checks.booklet_preview = true
    handling('Poster')
    await wait(
      () =>
        [...document.querySelectorAll('.print-settings label')].some((label) =>
          label.textContent.includes('Tile scale')
        ),
      'Poster controls'
    )
    checks.poster_controls = true
    const field = [...document.querySelectorAll('.print-settings label')]
      .find((label) => label.textContent.includes('Tile scale'))
      .querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '0')
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(
      () => document.querySelector('.print-settings [role="alert"]'),
      'Invalid poster scale'
    )
    checks.invalid_layout_blocked = !!document.querySelector(
      '.print-dialog footer .operation-primary:disabled'
    )
    document.querySelector('[title="Close print dialog"]').click()
    await wait(() => !document.querySelector('.print-dialog'), 'Close print')
    checks.print_sessions_released = (await invoke('desktop_test_sessions')) === 0
    if (Object.values(checks).some((value) => !value))
      throw Error(
        'Failed: ' +
          Object.entries(checks)
            .filter(([, value]) => !value)
            .map(([name]) => name)
            .join(', ')
      )
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', { result: { checks, errors } })
  await window.api.forceClose()
})()
