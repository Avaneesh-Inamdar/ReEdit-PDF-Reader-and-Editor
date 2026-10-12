import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { getOcrWorker, terminateOcr } from '../src/renderer/src/lib/ocr'

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({
    setParameters: vi.fn(async () => undefined),
    terminate: vi.fn(async () => undefined)
  }))
}))
afterEach(async () => {
  await terminateOcr()
  vi.clearAllMocks()
})

describe('OCR worker lifecycle', () => {
  it('keeps the new progress observer when switching recognition models', async () => {
    const first = vi.fn(),
      next = vi.fn()
    const original = await getOcrWorker(first, 'accurate')
    const replacement = await getOcrWorker(next, 'fast')
    expect(original.terminate).toHaveBeenCalledOnce()
    expect(replacement).not.toBe(original)
    const options = vi.mocked(createWorker).mock.calls.at(-1)![2]!
    options.logger!({ status: 'recognizing text', progress: 0.4 } as never)
    expect(next).toHaveBeenCalledWith(40)
    expect(first).not.toHaveBeenCalled()
  })
  it('releases its progress observer when recognition terminates', async () => {
    const progress = vi.fn()
    await getOcrWorker(progress)
    const options = vi.mocked(createWorker).mock.calls.at(-1)![2]!
    await terminateOcr()
    options.logger!({ status: 'recognizing text', progress: 0.8 } as never)
    expect(progress).not.toHaveBeenCalled()
  })
})
