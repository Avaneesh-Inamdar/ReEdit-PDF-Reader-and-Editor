/* eslint-disable @typescript-eslint/explicit-function-return-type -- Injected browser JavaScript cannot contain TypeScript return annotations. */
// Runs only through the opt-in desktop-test harness. This tiny real AES-256 PDF
// and its public test passwords contain no user information; source stays in memory.
;(async () => {
  const checks = {},
    errors = []
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (condition, label) => {
    const start = Date.now()
    while (!(await condition())) {
      if (Date.now() - start > 20000) throw Error(label + ' timed out')
      await pause(60)
    }
  }
  const fixture =
    'JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjguMQoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyPEIxNjRFNzFCQTg5MDNCRkUxMzY5OUU3MzJDMkY1OTg1OEExNEQ1MzlGRjlBMUMxMDY2RDJGQ0JFQURGNTc5N0U+Pj4+PgplbmRvYmoKCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9Db3VudCAxL0tpZHNbNiAwIFJdPj4KZW5kb2JqCgozIDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjQgMCBvYmoKPDwvRm9udDw8L0YxIDMgMCBSPj4+PgplbmRvYmoKCjUgMCBvYmoKPDwvTGVuZ3RoIDgwL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQoH1XG8v93hz0JeeXa2J1NeoXi0ON2abqTuc4R0tZZd5m+FJoiz1ESVx7kW/Ibbre7fQf+6QKk5Ld8G/NE8IBNz/DpZpE4yDlOqURGHMKfEMwplbmRzdHJlYW0KZW5kb2JqCgo2IDAgb2JqCjw8L1R5cGUvUGFnZS9NZWRpYUJveFswIDAgNTk1IDg0Ml0vUm90YXRlIDAvUmVzb3VyY2VzIDQgMCBSL0NvbnRlbnRzIDUgMCBSL1BhcmVudCAyIDAgUj4+CmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxNzIgMDAwMDAgbiAKMDAwMDAwMDIyNCAwMDAwMCBuIAowMDAwMDAwMzEzIDAwMDAwIG4gCjAwMDAwMDAzNTIgMDAwMDAgbiAKMDAwMDAwMDUwMCAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MkEwMzVCRDdENURENDJERDg3QzYyOEQyMjAxNjUyRTQ+KGBjOVwzNzN2RCJMJzBbXDAxM1wyMjdcMjA0XDAyMz0pXS9FbmNyeXB0PDwvRmlsdGVyL1N0YW5kYXJkL1IgNi9WIDUvTGVuZ3RoIDI1Ni9QIC00L0VuY3J5cHRNZXRhZGF0YSB0cnVlL1N0bUYvU3RkQ0YvU3RyRi9TdGRDRi9DRjw8L1N0ZENGPDwvQXV0aEV2ZW50L0RvY09wZW4vQ0ZNL0FFU1YzL0xlbmd0aCAzMj4+Pj4vTzw2Q0VDN0YwREU1N0Q0NURFQkRFRkIwQjQ0MTI1NTU2QTY3MTA0QUQzNjlEMzgxQjk5QjZFRjkzQUY4MkNDQTZDRUFFOUY4OTY3OTdFNUMxNDUyQTc1OUFDRjQxMTA4MDU+L1U8MzA1NzVFRUEzOEE0NTU2NzM4RUE1NDIyQjM3QkQ5RDEzQTNBOUM3OUQ4NzY5RThEOEM4Q0EyMUREMDhFMjVBRjg2RjE5QzMwRUYxODgwODZFN0NFNDMzMDI3M0I5NTdDPi9PRTw1Qjk2MTNCQzVBMjZFNTZEREUyRERDMzgzRUI0Q0ZCNDQxQjVDREQxM0Y4M0RFODI3NThGNUJBRjQwNzNBOUIyPi9VRTw4RjdDQTY2QzVBNEFCM0FFQzA1N0IwOThDNjBDMDI5MTFENjZCREVFREMxMURGNTA0Mjc5NEQzOEUyMUVDNzYzPi9QZXJtczw1RDE1MDFEMUVCNTZERUVCRTZEQzU0OUM4Rjc5RjExQz4+Pj4+CnN0YXJ0eHJlZgo2MDYKJSVFT0YK'
  const source = Uint8Array.from(atob(fixture), (character) => character.charCodeAt(0))
  const prompt = () => document.querySelector('.pdf-password-dialog[open]')
  const sessionCount = () => invoke('pdf_authentication_count')
  const drop = () => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([source], 'protected-regression.pdf', { type: 'application/pdf' }))
    document
      .querySelector('#root')
      .firstElementChild.dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
      )
  }
  const submitPassword = async (password) => {
    await wait(
      () => prompt() && !prompt().querySelector('button[type="submit"]').disabled,
      'Password entry'
    )
    const input = prompt().querySelector('input[type="password"]')
    input.value = password
    input.form.requestSubmit()
  }
  const readerText = () =>
    [...document.querySelectorAll('#page-1 [data-pdf-run]')].map((run) => run.textContent).join(' ')
  try {
    await wait(
      () => window.api && document.querySelector('#page-1 [data-pdf-run]'),
      'Initial reader'
    )
    const originalTabs = document.querySelectorAll('.workspace-document-tab').length
    const security = await window.__TAURI_INTERNALS__.invoke('pdf_security', source)
    checks.real_encrypted_fixture = security.encrypted && security.passwordRequired
    checks.initial_sessions_empty = (await sessionCount()) === 0

    drop()
    await wait(prompt, 'Password prompt')
    const dialog = prompt(),
      rect = dialog.getBoundingClientRect()
    checks.prompt_centered =
      Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 &&
      Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2
    checks.prompt_accessible =
      dialog.getAttribute('aria-labelledby') === 'pdf-password-heading' &&
      dialog.querySelector('label').htmlFor === 'pdf-document-password' &&
      document.activeElement === dialog.querySelector('input')
    dialog.querySelector('button[type="button"]').click()
    await wait(
      () =>
        !prompt() && document.querySelectorAll('.workspace-document-tab').length === originalTabs,
      'Cancel protected open'
    )
    await wait(async () => (await sessionCount()) === 0, 'Cancelled authentication cleanup')
    checks.cancel_keeps_previous_document = !!document.querySelector('#page-1 [data-pdf-run]')
    checks.cancel_releases_session = true

    drop()
    await wait(prompt, 'Retry protected open')
    await submitPassword('incorrect-test-password')
    await wait(
      () =>
        prompt()
          ?.querySelector('[role="alert"]')
          ?.textContent.includes('The password is incorrect'),
      'Incorrect password feedback'
    )
    checks.wrong_password_retains_prompt =
      !!prompt() && prompt().querySelector('input').value === '' && (await sessionCount()) === 0
    await submitPassword('test-open-password')
    await wait(
      () => !prompt() && readerText().includes('Original protected text'),
      'Authenticated reader'
    )
    checks.correct_password_opens_pdf = (await sessionCount()) === 1
    checks.password_field_removed = !document.querySelector('#pdf-document-password')

    document.querySelector('[title="Edit PDF"]').click()
    const run = [...document.querySelectorAll('#page-1 [data-pdf-run]')].find((item) =>
      item.textContent.includes('Original protected text')
    )
    window.dispatchEvent(new CustomEvent('pdf:editRun', { detail: { page: 1, run: run.pdfRun } }))
    await wait(
      () => document.querySelector('[aria-label="Edit text on page"]'),
      'Edit protected text'
    )
    const editor = document.querySelector('[aria-label="Edit text on page"]')
    editor.value = 'Updated protected text'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('.pdf-inline-actions .operation-primary').click()
    await wait(
      () =>
        !document.querySelector('.pdf-inline-editor') &&
        document.querySelector('[data-replacement-text]')?.textContent === 'Updated protected text',
      'Apply protected edit'
    )
    checks.authenticated_edit = true

    document.querySelector('[title="Save As (Ctrl+Shift+S)"]').click()
    await wait(() => document.querySelector('.file-dialog[open]'), 'Save encrypted copy')
    const output = await invoke('desktop_test_output')
    const saveDialog = document.querySelector('.file-dialog')
    const address = saveDialog.querySelector('[aria-label="Folder path"]')
    address.value = output
    address.form.requestSubmit()
    await wait(
      () =>
        saveDialog.dataset.folder
          ?.replace(/^\\\\\?\\/, '')
          .replace(/\\/g, '/')
          .toLowerCase() === output.replace(/\\/g, '/').toLowerCase(),
      'Test output folder'
    )
    saveDialog.querySelector('[aria-label="File name"]').value =
      'protected-saved-' + Date.now() + '.pdf'
    saveDialog.querySelector('footer .operation-primary').click()
    await wait(
      () =>
        !document.querySelector('.file-dialog') &&
        !document.querySelector('.workspace-document-tab.active [aria-label="Unsaved changes"]'),
      'Save encrypted edit'
    )
    const savedPath = await window.api.getCurrentPath()
    const saved = await window.api.readPdf(savedPath)
    const savedSecurity = await window.__TAURI_INTERNALS__.invoke(
      'pdf_security',
      new Uint8Array(saved)
    )
    checks.saved_copy_stays_password_protected =
      savedSecurity.encrypted && savedSecurity.passwordRequired

    document.querySelector('.workspace-document-tab.active [title="Close tab"]').click()
    await wait(async () => (await sessionCount()) === 0, 'Close protected tab cleanup')
    checks.close_releases_session = true
    await invoke('desktop_test_reopen')
    await wait(prompt, 'Reopen saved protected copy')
    await submitPassword('incorrect-test-password')
    await wait(
      () =>
        prompt()
          ?.querySelector('[role="alert"]')
          ?.textContent.includes('The password is incorrect'),
      'Saved copy rejects incorrect password'
    )
    checks.saved_copy_rejects_wrong_password = (await sessionCount()) === 0
    await submitPassword('test-open-password')
    await wait(
      () => !prompt() && readerText().includes('Updated protected text'),
      'Reopen saved edit'
    )
    checks.saved_edit_reopens_with_original_password =
      !readerText().includes('Original protected text')
    document.querySelector('.workspace-document-tab.active [title="Close tab"]').click()
    await wait(async () => (await sessionCount()) === 0, 'Final authentication cleanup')
    checks.final_sessions_empty = true
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
