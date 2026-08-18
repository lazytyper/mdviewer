import { describe, it, expect } from 'vitest'
import { mmToPx, paperMm, pageMetrics, PAPER_MM, MARGIN_MM, type PrintSettings } from './format'

const base: PrintSettings = { size: 'A4', orientation: 'portrait', margin: 'normal', scale: 1 }

describe('mmToPx', () => {
  it('converts millimetres to CSS px at 96dpi', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 5)
    expect(mmToPx(0)).toBe(0)
  })
})

describe('paperMm', () => {
  it('returns portrait dimensions unchanged', () => {
    expect(paperMm(base)).toEqual(PAPER_MM.A4)
  })
  it('swaps width and height in landscape', () => {
    const p = paperMm({ ...base, orientation: 'landscape' })
    expect(p).toEqual({ width: PAPER_MM.A4.height, height: PAPER_MM.A4.width })
  })
})

describe('pageMetrics', () => {
  it('computes page and content areas from paper and margins', () => {
    const m = pageMetrics(base)
    expect(m.pageWidthPx).toBeCloseTo(mmToPx(210), 3)
    expect(m.pageHeightPx).toBeCloseTo(mmToPx(297), 3)
    expect(m.marginPx).toBeCloseTo(mmToPx(MARGIN_MM.normal), 3)
    expect(m.contentWidthPx).toBeCloseTo(mmToPx(210) - 2 * mmToPx(MARGIN_MM.normal), 3)
    expect(m.contentHeightPx).toBeCloseTo(mmToPx(297) - 2 * mmToPx(MARGIN_MM.normal), 3)
  })
  it('reflects orientation in the page size', () => {
    const m = pageMetrics({ ...base, orientation: 'landscape' })
    expect(m.pageWidthPx).toBeCloseTo(mmToPx(297), 3)
    expect(m.pageHeightPx).toBeCloseTo(mmToPx(210), 3)
  })
})
