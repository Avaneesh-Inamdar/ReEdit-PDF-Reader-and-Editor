import { expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { destinationPage } from '../src/renderer/src/lib/pdfDestination'

it('resolves the first page, named destinations and indirect references', async () => {
  const getPageIndex = vi.fn(async () => 2)
  const pdf = {
    numPages: 5,
    getDestination: async () => [0, { name: 'Fit' }],
    getPageIndex
  } as unknown as PDFDocumentProxy
  expect(await destinationPage(pdf, [0, { name: 'Fit' }])).toBe(1)
  expect(await destinationPage(pdf, 'chapter')).toBe(1)
  expect(await destinationPage(pdf, [{ num: 15, gen: 0 }, { name: 'XYZ' }, 0, 700, 1])).toBe(3)
  expect(getPageIndex).toHaveBeenCalledTimes(1)
})
it('rejects malformed, missing and out-of-document destinations', async () => {
  const pdf = {
    numPages: 5,
    getDestination: async () => null,
    getPageIndex: async () => {
      throw Error('Missing page')
    }
  } as unknown as PDFDocumentProxy
  for (const value of [null, [], [-1], [5], [0.5], [{}], [{ num: 1, gen: 0 }], 'absent'])
    expect(await destinationPage(pdf, value)).toBeNull()
})
