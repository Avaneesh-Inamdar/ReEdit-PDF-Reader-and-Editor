import { describe, expect, it } from 'vitest'
import { documentNavigation } from '../src/renderer/src/lib/documentKeyboard'

describe('document navigation shortcuts', () => {
  it('distinguishes a page from a screen of a zoomed continuous document', () => {
    expect(documentNavigation({ key: 'PageDown' }, 2, 10, false)).toEqual({
      type: 'screen',
      direction: 1
    })
    expect(documentNavigation({ key: 'PageDown', ctrlKey: true }, 2, 10, false)).toEqual({
      type: 'page',
      page: 3
    })
    expect(documentNavigation({ key: 'PageDown' }, 2, 10, true)).toEqual({ type: 'page', page: 3 })
    expect(documentNavigation({ key: 'Enter', shiftKey: true }, 2, 10, false)).toEqual({
      type: 'screen',
      direction: -1
    })
  })
  it('supports first/last and bounded arrow navigation', () => {
    expect(documentNavigation({ key: 'Home' }, 5, 10, false)).toEqual({ type: 'page', page: 1 })
    expect(
      documentNavigation({ key: 'PageDown', ctrlKey: true, shiftKey: true }, 5, 10, false)
    ).toEqual({ type: 'page', page: 10 })
    expect(documentNavigation({ key: 'ArrowLeft' }, 1, 10, true)).toEqual({ type: 'page', page: 1 })
    expect(documentNavigation({ key: 'ArrowRight' }, 10, 10, true)).toEqual({
      type: 'page',
      page: 10
    })
  })
  it('leaves modified text selection, history, shortcuts and empty documents alone', () => {
    expect(documentNavigation({ key: 'ArrowRight', shiftKey: true }, 2, 10, false)).toBeNull()
    expect(documentNavigation({ key: 'ArrowLeft', altKey: true }, 2, 10, false)).toBeNull()
    expect(documentNavigation({ key: 'Enter', ctrlKey: true }, 2, 10, false)).toBeNull()
    expect(documentNavigation({ key: 'PageDown' }, 1, 0, false)).toBeNull()
  })
})
