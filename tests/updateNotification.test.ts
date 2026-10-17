import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleUpdateNotification } from '../src/renderer/src/lib/updateNotification'

afterEach(() => vi.useRealTimers())
describe('startup update notification', () => {
  it('checks after startup and prompts once for a newer release', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockResolvedValue({ available: true, latest: '2.0.0-alpha.3' })
    const notify = vi.fn()
    scheduleUpdateNotification(check, notify)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(notify).toHaveBeenCalledExactlyOnceWith('2.0.0-alpha.3')
    await vi.advanceTimersByTimeAsync(60000)
    expect(check).toHaveBeenCalledTimes(1)
  })
  it('keeps offline checks and current versions silent', async () => {
    vi.useFakeTimers()
    const notify = vi.fn()
    scheduleUpdateNotification(() => Promise.reject(Error('offline')), notify)
    scheduleUpdateNotification(
      () => Promise.resolve({ available: false, latest: '2.0.0-alpha.2' }),
      notify
    )
    await vi.advanceTimersByTimeAsync(10000)
    expect(notify).not.toHaveBeenCalled()
  })
  it('cancels pending and in-flight notifications when the app unmounts', async () => {
    vi.useFakeTimers()
    const notify = vi.fn(),
      pending = vi.fn()
    scheduleUpdateNotification(pending, notify)()
    let finish!: (value: { available: boolean; latest: string }) => void
    const cancel = scheduleUpdateNotification(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      notify
    )
    await vi.advanceTimersByTimeAsync(10000)
    cancel()
    finish({ available: true, latest: '2.0.0-alpha.3' })
    await Promise.resolve()
    expect(notify).not.toHaveBeenCalled()
    expect(pending).not.toHaveBeenCalled()
  })
})
