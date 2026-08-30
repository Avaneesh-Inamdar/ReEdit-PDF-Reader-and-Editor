import { describe, it, expect } from 'vitest'
import { parsePageRange, formatPageRange } from '../src/renderer/src/lib/pageRange'

describe('page-range parsing', () => {
  it('parses single pages', () => {
    expect(parsePageRange('1', 10)).toEqual([0])
    expect(parsePageRange('5', 10)).toEqual([4])
    expect(parsePageRange('1,3,5', 10)).toEqual([0,2,4])
  })
  it('parses ranges', () => {
    expect(parsePageRange('1-3', 10)).toEqual([0,1,2])
    expect(parsePageRange('2-5', 10)).toEqual([1,2,3,4])
    expect(parsePageRange('1-3,5,7-9', 10)).toEqual([0,1,2,4,6,7,8])
  })
  it('dedupes and handles spaces', () => {
    expect(parsePageRange(' 1 - 3 , 3 , 5 ', 10)).toEqual([0,1,2,4])
  })
  it('throws on invalid', () => {
    expect(()=> parsePageRange('0',10)).toThrow()
    expect(()=> parsePageRange('11',10)).toThrow()
    expect(()=> parsePageRange('5-2',10)).toThrow()
    expect(()=> parsePageRange('abc',10)).toThrow()
    expect(()=> parsePageRange('',10)).toThrow()
  })
  it('formats ranges', () => {
    expect(formatPageRange([0,1,2,4,6,7,8])).toBe('1-3,5,7-9')
    expect(formatPageRange([0])).toBe('1')
    expect(formatPageRange([0,2,4])).toBe('1,3,5')
    expect(formatPageRange([1,2,3])).toBe('2-4')
  })
  it('round-trips', () => {
    const indices = [0,1,2,5,6,9]
    expect(parsePageRange(formatPageRange(indices), 10)).toEqual(indices)
  })
})
