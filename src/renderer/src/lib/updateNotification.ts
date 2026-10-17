export interface ReleaseCheck {
  available: boolean
  latest?: string | null
}

// A failed background check must never interrupt opening or editing a PDF.
// Manual checks report errors in the Updates dialog.
export function scheduleUpdateNotification(
  check: () => Promise<ReleaseCheck>,
  notify: (version: string) => void,
  delay = 10000
): () => void {
  let cancelled = false
  const timer = setTimeout(() => {
    void check()
      .then((result) => {
        if (!cancelled && result.available && result.latest) notify(result.latest)
      })
      .catch(() => {})
  }, delay)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
