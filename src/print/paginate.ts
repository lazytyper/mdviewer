/**
 * Compute the block indices at which a new page begins.
 *
 * Greedy top-to-bottom fill: a block starts a new page when a forced break is
 * set before it, or when adding it would overflow the page's content height.
 * A block taller than a whole page is placed alone on its own page.
 *
 * @param blockHeights ordered heights (px) of the top-level content blocks
 * @param contentHeightPx printable height of one page (px)
 * @param forcedBreaks block indices (>0) that must start a new page
 * @returns ascending list of block indices that begin a new page (never 0)
 */
export function paginate(
  blockHeights: number[],
  contentHeightPx: number,
  forcedBreaks: Set<number> = new Set(),
): number[] {
  const breaks: number[] = []
  let filled = 0
  for (let i = 0; i < blockHeights.length; i++) {
    const h = blockHeights[i]
    if (i > 0) {
      const forced = forcedBreaks.has(i)
      const overflows = filled + h > contentHeightPx
      if (forced || overflows) {
        breaks.push(i)
        filled = 0
      }
    }
    filled += h
  }
  return breaks
}
