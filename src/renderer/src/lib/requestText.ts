// Electron does not implement window.prompt. Use an accessible in-app dialog instead.
export function requestText(message: string, initialValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = document.createElement('dialog')
    dialog.className = 'text-entry-dialog'
    const form = document.createElement('form')
    const label = document.createElement('label')
    const input = document.createElement('textarea')
    const actions = document.createElement('div')
    const cancel = document.createElement('button')
    const submit = document.createElement('button')
    label.textContent = message
    input.value = initialValue
    input.rows = 3
    const grow = (): void => {
      input.style.height = 'auto'
      input.style.height = `${Math.min(window.innerHeight * 0.55, Math.max(84, input.scrollHeight + 2))}px`
      dialog.style.width = `${Math.min(window.innerWidth * 0.9, Math.max(460, input.value.length > 120 ? 720 : 460))}px`
    }
    input.oninput = grow
    input.setAttribute('aria-label', message)
    label.append(input)
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    submit.type = 'submit'
    submit.textContent = 'Apply'
    actions.className = 'text-entry-actions'
    actions.append(cancel, submit)
    form.append(label, actions)
    dialog.append(form)
    const finish = (value: string | null): void => {
      dialog.close()
      dialog.remove()
      previousFocus?.focus()
      resolve(value)
    }
    cancel.onclick = () => finish(null)
    dialog.oncancel = (event) => {
      event.preventDefault()
      finish(null)
    }
    form.onsubmit = (event) => {
      event.preventDefault()
      finish(input.value)
    }
    input.onkeydown = (event) => {
      event.stopPropagation()
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        finish(input.value)
      }
    }
    document.body.append(dialog)
    dialog.showModal()
    grow()
    input.focus()
    input.select()
  })
}
