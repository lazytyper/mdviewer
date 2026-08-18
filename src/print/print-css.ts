import { paperMm, MARGIN_MM, type PrintSettings } from './format'

/**
 * Build the CSS injected just before window.print():
 *  - @page sets the physical page size and margins,
 *  - everything except #content is hidden,
 *  - #content is unconstrained and scaled,
 *  - a forced page break is placed before each given block index.
 *
 * @param forcedBreaks block indices (0-based) that must start a new page
 */
export function buildPrintCss(s: PrintSettings, forcedBreaks: Iterable<number>): string {
  const p = paperMm(s)
  const m = MARGIN_MM[s.margin]
  const rules = [...forcedBreaks]
    .sort((a, b) => a - b)
    .map(
      (i) =>
        `  #content > :nth-child(${i + 1}) { break-before: page; page-break-before: always; }`,
    )
    .join('\n')
  return `@page { size: ${p.width}mm ${p.height}mm; margin: ${m}mm; }
@media print {
  body > *:not(#content) { display: none !important; }
  #content { max-width: none; margin: 0; padding: 0; font-size: ${s.scale}em; }
${rules}
}`
}
