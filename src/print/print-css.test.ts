import { describe, it, expect } from 'vitest'
import { buildPrintCss } from './print-css'
import type { PrintSettings } from './format'

const base: PrintSettings = { size: 'A4', orientation: 'portrait', margin: 'normal', scale: 1 }

describe('buildPrintCss', () => {
  it('sets @page size and margin for A4 portrait / normal margins', () => {
    const css = buildPrintCss(base, new Set())
    expect(css).toContain('@page')
    expect(css).toContain('size: 210mm 297mm')
    expect(css).toContain('margin: 20mm')
  })

  it('swaps the page size in landscape', () => {
    const css = buildPrintCss({ ...base, orientation: 'landscape' }, new Set())
    expect(css).toContain('size: 297mm 210mm')
  })

  it('hides everything except #content when printing', () => {
    const css = buildPrintCss(base, new Set())
    expect(css).toContain('body > *:not(#content)')
    expect(css).toContain('display: none')
  })

  it('applies the scale as a content font-size', () => {
    expect(buildPrintCss({ ...base, scale: 1.2 }, new Set())).toContain('font-size: 1.2em')
  })

  it('forces page breaks before the given 1-based nth-child indices', () => {
    const css = buildPrintCss(base, new Set([2, 4]))
    expect(css).toContain('#content > :nth-child(3)')
    expect(css).toContain('#content > :nth-child(5)')
    expect(css).toContain('break-before: page')
    expect(css).toContain('page-break-before: always')
  })

  it('emits no break rules when there are no forced breaks', () => {
    expect(buildPrintCss(base, new Set())).not.toContain('nth-child')
  })
})
