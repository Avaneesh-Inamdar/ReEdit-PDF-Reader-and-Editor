import { describe, expect, it } from 'vitest'
import { selectPage } from '../src/renderer/src/lib/pageSelection'

describe('organizer page selection', () => {
  it('replaces or toggles the selection', () => {
    expect([...selectPage(new Set([1, 2]), 2, 1, { toggle: false, range: false })]).toEqual([2])
    expect([...selectPage(new Set([1, 2]), 2, 1, { toggle: true, range: false })]).toEqual([1])
  })

  it('selects a range in either direction and can add it to the selection', () => {
    expect([...selectPage(new Set([0]), 1, 3, { toggle: false, range: true })]).toEqual([1, 2, 3])
    expect([...selectPage(new Set([0]), 3, 1, { toggle: true, range: true })]).toEqual([0, 1, 2, 3])
    expect([...selectPage(new Set(), 3, null, { toggle: false, range: true })]).toEqual([3])
  })
})
