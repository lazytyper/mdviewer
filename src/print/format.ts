export type PaperSize = 'A4' | 'Letter' | 'A5' | 'Legal'
export type Orientation = 'portrait' | 'landscape'
export type MarginPreset = 'normal' | 'narrow' | 'wide'

export interface PrintSettings {
  size: PaperSize
  orientation: Orientation
  margin: MarginPreset
  scale: number // font-size multiplier for print, e.g. 1.0
}

export interface Dimensions {
  width: number
  height: number
}

/** Portrait paper dimensions in millimetres. */
export const PAPER_MM: Record<PaperSize, Dimensions> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  A5: { width: 148, height: 210 },
  Legal: { width: 216, height: 356 },
}

/** Uniform page margin per preset, in millimetres. */
export const MARGIN_MM: Record<MarginPreset, number> = {
  normal: 20,
  narrow: 12,
  wide: 28,
}

/** Convert millimetres to CSS pixels at 96 dpi. */
export function mmToPx(mm: number): number {
  return (mm / 25.4) * 96
}

/** Oriented paper dimensions in millimetres (width/height swapped for landscape). */
export function paperMm(s: PrintSettings): Dimensions {
  const p = PAPER_MM[s.size]
  return s.orientation === 'landscape'
    ? { width: p.height, height: p.width }
    : { width: p.width, height: p.height }
}

export interface PageMetrics {
  pageWidthPx: number
  pageHeightPx: number
  contentWidthPx: number
  contentHeightPx: number
  marginPx: number
}

/** Page and printable-content dimensions in CSS px for the given settings. */
export function pageMetrics(s: PrintSettings): PageMetrics {
  const p = paperMm(s)
  const pageWidthPx = mmToPx(p.width)
  const pageHeightPx = mmToPx(p.height)
  const marginPx = mmToPx(MARGIN_MM[s.margin])
  return {
    pageWidthPx,
    pageHeightPx,
    marginPx,
    contentWidthPx: pageWidthPx - 2 * marginPx,
    contentHeightPx: pageHeightPx - 2 * marginPx,
  }
}
