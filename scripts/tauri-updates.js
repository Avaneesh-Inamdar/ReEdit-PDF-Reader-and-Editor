;(async () => {
  const checks = {},
    errors = []
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args)
  const wait = async (fn, label) => {
    const start = Date.now()
    while (!fn()) {
      if (Date.now() - start > 25000) throw Error(label + ' timed out')
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
  }
  try {
    await wait(() => window.api?.checkForUpdates, 'Desktop API')
    let checksRun = 0
    window.api.checkForUpdates = async () => {
      checksRun++
      return {
        current: '2.0.0-alpha.2',
        latest: '99.0.0',
        available: true,
        message: 'A new test version is available'
      }
    }
    await wait(
      () => document.querySelector('[aria-label="Update available"]'),
      'Startup update prompt'
    )
    const prompt = document.querySelector('[aria-label="Update available"]')
    checks.startup_prompt = prompt.textContent.includes('99.0.0') && checksRun === 1
    checks.theme_surface = getComputedStyle(prompt).backgroundColor !== 'rgba(0, 0, 0, 0)'
    prompt.querySelector('.operation-primary').click()
    await wait(
      () =>
        document
          .querySelector('[aria-label="App updates"] h3')
          ?.textContent.includes('A new version'),
      'Update details'
    )
    checks.download_details = document
      .querySelector('.update-content')
      .textContent.includes('99.0.0')
    checks.release_download_available = [
      ...document.querySelectorAll('.update-dialog button')
    ].some((button) => button.textContent === 'Download packages' && !button.disabled)
    if (navigator.userAgent.includes('Windows'))
      await invoke('desktop_test_snapshot', { name: 'updates' })
    document.querySelector('[title="Close updates"]').click()
    checks.prompt_does_not_repeat = !document.querySelector('[aria-label="Update available"]')
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', { result: { checks, errors } })
  await window.api.forceClose()
})()
