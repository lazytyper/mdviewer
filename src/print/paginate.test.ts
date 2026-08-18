import { describe, it, expect } from 'vitest'
import { paginate } from './paginate'

describe('paginate', () => {
  it('returns no breaks when everything fits on one page', () => {
    expect(paginate([100, 100, 50], 300)).toEqual([])
  })

  it('breaks before the block that would overflow the page', () => {
    // 100 + 100 = 200 fits; +100 = 300 > 250 -> new page before index 2
    expect(paginate([100, 100, 100], 250)).toEqual([2])
  })

  it('produces multiple pages for long content', () => {
    expect(paginate([100, 100, 100, 100], 200)).toEqual([2])
    expect(paginate([100, 100, 100, 100, 100], 200)).toEqual([2, 4])
  })

  it('honours a forced break regardless of fill level', () => {
    expect(paginate([100, 100, 100], 1000, new Set([1]))).toEqual([1])
  })

  it('combines forced and automatic breaks', () => {
    // forced before 1; then 100 on page2, +100 = 200 fits (<=250); no more
    expect(paginate([100, 100, 100], 250, new Set([1]))).toEqual([1])
  })

  it('places a block taller than a page on its own page', () => {
    // index1 is 300 > 250: cannot share with index0 -> break before it
    expect(paginate([100, 300, 100], 250)).toEqual([1, 2])
  })

  it('handles empty input', () => {
    expect(paginate([], 250)).toEqual([])
  })
})
