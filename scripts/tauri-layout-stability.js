;(async () => {
  const checks = {},
    errors = [],
    samples = {},
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
    await wait(() => document.querySelector('#page-1 canvas[data-render-ready="true"]'), 'Reader')
    const viewer = document.querySelector('[data-pdf-viewer]')
    Object.assign(viewer.style, { flex: 'none', height: '780px', width: '1000px' })
    const fit = () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '2',
          code: 'Digit2',
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    fit()
    let stable = true,
      noHorizontalOverflow = true
    for (const [i, [width, height]] of [
      [1000, 780],
      [1000, 775],
      [1007, 780],
      [1000, 780]
    ].entries()) {
      viewer.style.width = width + 'px'
      viewer.style.height = height + 'px'
      await pause(650)
      const values = []
      for (let n = 0; n < 18; n++) {
        const rect = document.getElementById('page-1').getBoundingClientRect()
        values.push({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
        await pause(25)
      }
      samples['viewport_' + i] = values
      stable &&= ['x', 'y', 'w', 'h'].every(
        (key) =>
          Math.max(...values.map((value) => value[key])) -
            Math.min(...values.map((value) => value[key])) <
          0.6
      )
      noHorizontalOverflow &&= viewer.scrollWidth <= viewer.clientWidth + 1
    }
    checks.landscape_geometry_stable = stable
    checks.fit_width_has_no_horizontal_overflow = noHorizontalOverflow
    const second = document.getElementById('page-2')
    if (second) {
      const width = document.getElementById('page-1').getBoundingClientRect().width
      second.scrollIntoView({ block: 'start' })
      await pause(1500)
      checks.continuous_scroll_keeps_zoom =
        Math.abs(document.getElementById('page-1').getBoundingClientRect().width - width) < 0.6
    }
    if (Object.values(checks).some((value) => !value))
      throw Error(
        'Unstable fit layout: ' +
          Object.entries(checks)
            .filter(([, value]) => !value)
            .map(([key]) => key)
            .join(', ')
      )
  } catch (error) {
    errors.push(String(error))
  }
  await invoke('desktop_test_result', { result: { checks, errors, samples } })
  await window.api.forceClose()
})()
