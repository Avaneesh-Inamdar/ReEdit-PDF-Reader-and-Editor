export function pdfPasswordDialog<T>(
  name: string,
  verify: (password: string) => Promise<T>,
  signal?: AbortSignal,
  initialMessage?: string
): Promise<T | null> {
  if (signal?.aborted) return Promise.resolve(null)
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = document.createElement('dialog')
    const form = document.createElement('form')
    const heading = document.createElement('h2')
    const message = document.createElement('p')
    const label = document.createElement('label')
    const input = document.createElement('input')
    const error = document.createElement('p')
    const actions = document.createElement('div')
    const cancel = document.createElement('button')
    const submit = document.createElement('button')
    let finished = false
    dialog.className = 'app-dialog pdf-password-dialog'
    dialog.setAttribute('aria-labelledby', 'pdf-password-heading')
    dialog.setAttribute('aria-describedby', 'pdf-password-message')
    heading.id = 'pdf-password-heading'
    heading.textContent = 'Password required'
    message.id = 'pdf-password-message'
    message.textContent = initialMessage || `Enter the password to open “${name}”.`
    label.textContent = 'Document password'
    label.htmlFor = 'pdf-document-password'
    input.id = 'pdf-document-password'
    input.type = 'password'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.setAttribute('aria-describedby', 'pdf-password-error')
    error.id = 'pdf-password-error'
    error.className = 'operation-error'
    error.setAttribute('role', 'alert')
    error.hidden = true
    actions.className = 'operation-dialog-footer'
    cancel.type = 'button'
    cancel.className = 'operation-secondary'
    cancel.textContent = 'Cancel'
    submit.type = 'submit'
    submit.className = 'operation-primary'
    submit.textContent = 'Open'
    const finish = (value: T | null): void => {
      if (finished) return
      finished = true
      input.value = ''
      signal?.removeEventListener('abort', abort)
      dialog.close()
      dialog.remove()
      previousFocus?.focus()
      resolve(value)
    }
    const abort = (): void => finish(null)
    cancel.onclick = abort
    dialog.oncancel = (event): void => {
      event.preventDefault()
      abort()
    }
    form.onsubmit = async (event): Promise<void> => {
      event.preventDefault()
      if (submit.disabled || finished) return
      submit.disabled = true
      input.disabled = true
      input.setAttribute('aria-invalid', 'false')
      error.hidden = true
      try {
        const pending = verify(input.value)
        input.value = ''
        const value = await pending
        if (!finished) finish(value)
      } catch (reason) {
        if (finished) return
        error.textContent = reason instanceof Error ? reason.message : 'Unable to open this PDF.'
        error.hidden = false
        input.setAttribute('aria-invalid', 'true')
      } finally {
        input.value = ''
        input.disabled = false
        submit.disabled = false
        if (!finished) input.focus()
      }
    }
    actions.append(cancel, submit)
    form.append(heading, message, label, input, error, actions)
    dialog.append(form)
    document.body.append(dialog)
    signal?.addEventListener('abort', abort, { once: true })
    dialog.showModal()
    input.focus()
  })
}
