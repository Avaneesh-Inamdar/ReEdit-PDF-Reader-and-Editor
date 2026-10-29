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
  const nativeKeys = navigator.userAgent.includes('Windows')
  const key = async (key, code, vk, modifiers = 0, text) => {
    if (!nativeKeys) {
      // WebKitGTK has no CDP input bridge. Dispatch app shortcuts and explicitly
      // emulate the browser defaults below; trusted input is tested on Windows.
      const target = document.activeElement || document.body
      const event = new KeyboardEvent('keydown', {
        key,
        code,
        ctrlKey: !!(modifiers & 2),
        shiftKey: !!(modifiers & 8),
        altKey: !!(modifiers & 1),
        bubbles: true,
        cancelable: true
      })
      target.dispatchEvent(event)
      if (!event.defaultPrevented && target instanceof HTMLButtonElement && key === ' ')
        target.click()
      if (!event.defaultPrevented && text && target instanceof HTMLInputElement) {
        const start = target.selectionStart ?? target.value.length
        const end = target.selectionEnd ?? start
        const value = target.value.slice(0, start) + text + target.value.slice(end)
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target, value)
        target.dispatchEvent(new Event('input', { bubbles: true }))
      }
      target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }))
      return
    }
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
    const printCanvas = document.querySelector('.print-preview canvas')
    const choosePrint = (text, value) => {
      const select = [...document.querySelectorAll('.print-settings label')]
        .find((label) => label.textContent.trim().startsWith(text))
        .querySelector('select')
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return select
    }
    // Every page in this fixture carries a distinct page number, so page order
    // changes must reach the native preview rather than only changing a label.
    await pause(250)
    for (const order of ['horizontalReversed', 'vertical', 'verticalReversed', 'horizontal']) {
      const previous = printCanvas.toDataURL()
      choosePrint('Page order', order)
      await wait(() => printCanvas.toDataURL() !== previous, 'Multiple order ' + order)
    }
    checks.multiple_orders_preview = true
    const withoutBorder = printCanvas.toDataURL()
    const border = [...document.querySelectorAll('.print-settings label')]
      .find((label) => label.textContent.includes('Print page border'))
      .querySelector('input')
    border.click()
    await wait(() => printCanvas.toDataURL() !== withoutBorder, 'Multiple page borders')
    checks.multiple_borders_preview = true
    document.querySelector('.print-handling').scrollIntoView({ block: 'nearest' })
    if (nativeKeys) await invoke('desktop_test_snapshot', { name: 'print' })
    handling('Booklet')
    await wait(() => sheetCount(16), 'Booklet preview sides')
    const canvas = document.querySelector('.print-preview canvas')
    await wait(
      () => Number(canvas.dataset.paperWidth) > Number(canvas.dataset.paperHeight),
      'Booklet landscape'
    )
    checks.booklet_preview = true
    const leftBinding = canvas.toDataURL()
    choosePrint('Binding', 'right')
    await wait(() => canvas.toDataURL() !== leftBinding, 'Right-bound booklet')
    checks.booklet_binding_preview = true
    choosePrint('Booklet subset', 'front')
    await wait(() => sheetCount(8), 'Booklet front-side count')
    const duplex = [...document.querySelectorAll('.print-settings label')]
      .find((label) => label.textContent.includes('Two-sided printing'))
      .querySelector('select')
    checks.booklet_manual_pass_simplex = duplex.disabled && duplex.value === 'simplex'
    await pause(250)
    const frontSide = canvas.toDataURL()
    choosePrint('Booklet subset', 'back')
    await wait(() => canvas.toDataURL() !== frontSide, 'Booklet back-side preview')
    checks.booklet_manual_pass_preview = sheetCount(8)
    choosePrint('Booklet subset', 'both')
    await wait(() => sheetCount(16), 'Booklet both-side count')
    checks.booklet_both_sides_restored = !duplex.disabled && duplex.value === 'shortEdge'
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

    // Exercise crop geometry through the actual native renderer and reload path.
    const toolsButton = document.querySelector('[title="All tools"]')
    if (!document.querySelector('.workspace-tool-list')) toolsButton.click()
    await wait(() => document.querySelector('.workspace-tool-list'), 'Tools panel')
    ;[...document.querySelectorAll('.workspace-tool-list button')]
      .find((button) => button.textContent.trim() === 'Organize Pages').click()
    await wait(() => document.querySelector('[aria-label="Select page 1"]'), 'Organize pages')
    document.querySelector('[aria-label="Select page 1"]').click()
    const cropButton = () => [...document.querySelectorAll('.modal-card button')]
      .find((button) => button.textContent.trim() === 'Crop')
    await wait(() => cropButton() && !cropButton().disabled, 'Page selection')
    cropButton().click()
    await wait(() => document.querySelector('[aria-label="Drag left crop edge"]'), 'Crop preview')
    const fieldLeft = document.querySelector('#crop-title').closest('form').querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(fieldLeft, '72')
    fieldLeft.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(() => document.querySelector('[aria-label="Drag left crop edge"]').getBoundingClientRect().x >
      document.querySelector('[aria-label="Preview of page 1"]').getBoundingClientRect().x + 10, 'Crop edge follows margin')
    checks.crop_preview_follows_margin = true
    if (nativeKeys) {
      const handle = document.querySelector('[aria-label="Drag left crop edge"]').getBoundingClientRect()
      const x = handle.left + handle.width / 2, y = handle.top + handle.height / 2
      await invoke('desktop_test_input', { method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 } })
      await invoke('desktop_test_input', { method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: x + 25, y, button: 'left', buttons: 1 } })
      await invoke('desktop_test_input', { method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: x + 25, y, button: 'left', buttons: 0, clickCount: 1 } })
      await wait(() => Number(fieldLeft.value) > 90, 'Crop handle drag')
      checks.crop_handle_drag = true
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(fieldLeft, '72')
      fieldLeft.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await pause(100)
    document.querySelector('#crop-title').closest('form').requestSubmit()
    await wait(() => !document.querySelector('#crop-title'), 'Apply crop')
    await wait(() => selectedPage().includes('540 × 792 pt'), 'Cropped page dimensions')
    checks.crop_updates_page = true
    document.querySelector('[aria-label="Select page 1"]').click()
    await wait(() => cropButton() && !cropButton().disabled, 'Reselect page')
    cropButton().click()
    await wait(() => document.querySelector('#crop-title'), 'Reopen crop')
    ;[...document.querySelector('#crop-title').closest('form').querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Restore full page').click()
    await wait(() => !document.querySelector('#crop-title'), 'Restore bounds')
    await wait(() => selectedPage().includes('612 × 792 pt'), 'Restored page dimensions')
    checks.crop_restore_page = true
    document.querySelector('[aria-label="Select page 1"]').click()
    const numberButton = () => [...document.querySelectorAll('.modal-card button')]
      .find((button) => button.textContent.trim() === 'Page numbers')
    await wait(() => numberButton() && !numberButton().disabled, 'Select page for numbering')
    numberButton().click()
    await wait(() => document.querySelector('#page-numbers-title'), 'Page number dialog')
    const numberForm = document.querySelector('#page-numbers-title').closest('form')
    const firstNumber = numberForm.querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(firstNumber, '100')
    firstNumber.dispatchEvent(new Event('input', { bubbles: true }))
    await pause(100)
    numberForm.requestSubmit()
    await wait(() => !document.querySelector('#page-numbers-title'), 'Apply page numbering')
    document.querySelector('[aria-label="Select page 2"]').click()
    await wait(() => numberButton() && !numberButton().disabled, 'Select page for header')
    numberButton().click()
    await wait(() => document.querySelector('#page-numbers-title'), 'Header dialog')
    const headerForm = document.querySelector('#page-numbers-title').closest('form')
    const inputs = headerForm.querySelectorAll('input')
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setInput.call(inputs[0], '1')
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    setInput.call(inputs[1], 'Page {page} of {total}')
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    const selects = headerForm.querySelectorAll('select')
    selects[0].value = 'top'; selects[0].dispatchEvent(new Event('change', { bubbles: true }))
    selects[1].value = 'right'; selects[1].dispatchEvent(new Event('change', { bubbles: true }))
    await pause(100)
    headerForm.requestSubmit()
    await wait(() => !document.querySelector('#page-numbers-title'), 'Apply header')
    ;[...document.querySelectorAll('.modal-card button')]
      .find((button) => button.textContent.trim() === 'Done').click()
    await wait(() => [...document.querySelectorAll('#page-1 [data-pdf-run]')]
      .some((run) => run.textContent.trim() === '100'), 'Page number text')
    checks.page_number_added = true
    document.querySelector('[data-pdf-viewer]').focus()
    await key('ArrowRight', 'ArrowRight', 39)
    await wait(() => [...document.querySelectorAll('#page-2 [data-pdf-run]')]
      .some((run) => run.textContent.trim() === 'Page 2 of 32'), 'Header text')
    checks.header_added = true
    const headerRun = [...document.querySelectorAll('#page-2 [data-pdf-run]')]
      .find((run) => run.textContent.trim() === 'Page 2 of 32')
    const pageBox = document.querySelector('#page-2').getBoundingClientRect()
    const headerBox = headerRun.getBoundingClientRect()
    checks.header_right_top = headerBox.top < pageBox.top + pageBox.height * 0.2 &&
      headerBox.right > pageBox.left + pageBox.width * 0.7
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
