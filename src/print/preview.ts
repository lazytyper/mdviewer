import { pageMetrics, type PrintSettings, type PaperSize, type Orientation, type MarginPreset } from './format'
import { paginate } from './paginate'
import { buildPrintCss } from './print-css'

const STORAGE_KEY = 'mdviewer-print'

const DEFAULTS: PrintSettings = { size: 'A4', orientation: 'portrait', margin: 'normal', scale: 1 }

function loadSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<PrintSettings>
    return {
      size: (['A4', 'Letter', 'A5', 'Legal'] as PaperSize[]).includes(parsed.size as PaperSize)
        ? (parsed.size as PaperSize) : DEFAULTS.size,
      orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
      margin: (['normal', 'narrow', 'wide'] as MarginPreset[]).includes(parsed.margin as MarginPreset)
        ? (parsed.margin as MarginPreset) : DEFAULTS.margin,
      scale: typeof parsed.scale === 'number' && parsed.scale >= 0.6 && parsed.scale <= 1.4
        ? parsed.scale : DEFAULTS.scale,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveSettings(s: PrintSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

// Module-scope handle to the current overlay so we can close it externally.
let overlay: HTMLElement | null = null

/** Close the print setup overlay if open (e.g. when the document changes). */
export function closePrintSetup(): void {
  overlay?.remove()
  overlay = null
  document.getElementById('print-style')?.remove()
}

/**
 * Open the print-setup overlay for the given content element.
 * Renders format controls and a live preview (preview rendering in Task 6).
 */
export function openPrintSetup(contentEl: HTMLElement): void {
  closePrintSetup()
  const settings = loadSettings()
  const blocks = Array.from(contentEl.children) as HTMLElement[]

  overlay = document.createElement('div')
  overlay.id = 'print-overlay'
  overlay.innerHTML = `
    <div id="print-toolbar">
      <label>Größe
        <select id="pf-size">
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
          <option value="A5">A5</option>
          <option value="Legal">Legal</option>
        </select>
      </label>
      <label>Ausrichtung
        <select id="pf-orient">
          <option value="portrait">Hoch</option>
          <option value="landscape">Quer</option>
        </select>
      </label>
      <label>Ränder
        <select id="pf-margin">
          <option value="normal">Normal</option>
          <option value="narrow">Schmal</option>
          <option value="wide">Breit</option>
        </select>
      </label>
      <label>Skalierung
        <input id="pf-scale" type="range" min="0.6" max="1.4" step="0.05" />
      </label>
      <span id="pf-info"></span>
      <button id="pf-print">Drucken</button>
      <button id="pf-close">Schließen</button>
    </div>
    <div id="print-pages"></div>`
  document.body.appendChild(overlay)

  const sizeSel = overlay.querySelector('#pf-size') as HTMLSelectElement
  const orientSel = overlay.querySelector('#pf-orient') as HTMLSelectElement
  const marginSel = overlay.querySelector('#pf-margin') as HTMLSelectElement
  const scaleInput = overlay.querySelector('#pf-scale') as HTMLInputElement
  const infoEl = overlay.querySelector('#pf-info') as HTMLElement
  const printBtn = overlay.querySelector('#pf-print') as HTMLButtonElement
  const closeBtn = overlay.querySelector('#pf-close') as HTMLButtonElement
  const pagesEl = overlay.querySelector('#print-pages') as HTMLElement

  sizeSel.value = settings.size
  orientSel.value = settings.orientation
  marginSel.value = settings.margin
  scaleInput.value = String(settings.scale)

  // Manual page breaks (block indices) — reset for each open; per-document.
  const forcedBreaks = new Set<number>()

  function currentSettings(): PrintSettings {
    return {
      size: sizeSel.value as PaperSize,
      orientation: orientSel.value as Orientation,
      margin: marginSel.value as MarginPreset,
      scale: Number(scaleInput.value),
    }
  }

  function rerender(): void {
    const s = currentSettings()
    saveSettings(s)
    renderPreview(pagesEl, blocks, s, forcedBreaks, infoEl)
    printBtn.disabled = blocks.length === 0
    if (blocks.length === 0) infoEl.textContent = 'Kein Inhalt zum Drucken'
  }

  sizeSel.addEventListener('change', rerender)
  orientSel.addEventListener('change', rerender)
  marginSel.addEventListener('change', rerender)
  scaleInput.addEventListener('input', rerender)
  closeBtn.addEventListener('click', closePrintSetup)
  printBtn.addEventListener('click', () => doPrint(currentSettings(), forcedBreaks))

  rerender()
}

/**
 * Render the paginated preview into pagesEl.
 * Builds a white content column at the page's printable width, measures each
 * block, computes page breaks, and overlays a draggable bar at every break plus
 * an "add break" affordance between blocks.
 */
function renderPreview(
  pagesEl: HTMLElement,
  blocks: HTMLElement[],
  settings: PrintSettings,
  forcedBreaks: Set<number>,
  infoEl: HTMLElement,
): void {
  pagesEl.textContent = ''
  if (blocks.length === 0) return

  const metrics = pageMetrics(settings)

  // Build the page column at full page width with the margin as padding. With
  // the global box-sizing:border-box, the inner content box then measures
  // exactly contentWidthPx — matching what window.print() lays out — while the
  // padding visualises the page margins.
  const column = document.createElement('div')
  column.className = 'md-body print-column'
  column.style.width = `${metrics.pageWidthPx}px`
  column.style.padding = `${metrics.marginPx}px`
  column.style.fontSize = `${settings.scale}em`
  const cloned = blocks.map((b) => b.cloneNode(true) as HTMLElement)
  cloned.forEach((c) => column.appendChild(c))
  pagesEl.appendChild(column)

  // Measure each block's height in this laid-out column.
  const heights = cloned.map((c) => c.offsetHeight)
  const breaks = paginate(heights, metrics.contentHeightPx, forcedBreaks)

  infoEl.textContent = `${breaks.length + 1} Seite(n) · ${settings.size} ${
    settings.orientation === 'landscape' ? 'quer' : 'hoch'
  }`

  // Cumulative top offset of each block within the padded column.
  const tops = cloned.map((c) => c.offsetTop)
  const breakSet = new Set(breaks)

  // Draw a draggable bar before every break block.
  for (const idx of breaks) {
    const bar = makeBreakBar(idx, forcedBreaks.has(idx))
    bar.style.top = `${tops[idx]}px`
    column.appendChild(bar)
  }

  // Between every pair of adjacent blocks that is NOT already a break,
  // offer an "add manual break" affordance.
  for (let i = 1; i < cloned.length; i++) {
    if (breakSet.has(i)) continue
    const add = document.createElement('div')
    add.className = 'print-addbreak'
    add.style.top = `${tops[i]}px`
    add.title = 'Manuellen Umbruch hier einfügen'
    add.addEventListener('click', () => {
      forcedBreaks.add(i)
      renderPreview(pagesEl, blocks, settings, forcedBreaks, infoEl)
    })
    column.appendChild(add)
  }

  // --- helpers (closure over column/tops/blocks/settings) ---
  function makeBreakBar(index: number, removable: boolean): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'print-break'
    wrap.style.position = 'absolute'
    wrap.style.left = '0'
    wrap.style.right = '0'

    const bar = document.createElement('div')
    bar.className = 'print-break-bar'
    wrap.appendChild(bar)

    if (removable) {
      const rm = document.createElement('span')
      rm.className = 'print-break-remove'
      rm.textContent = '✕'
      rm.title = 'Umbruch entfernen'
      rm.addEventListener('click', (e) => {
        e.stopPropagation()
        forcedBreaks.delete(index)
        renderPreview(pagesEl, blocks, settings, forcedBreaks, infoEl)
      })
      bar.appendChild(rm)
    }

    // Drag to snap the break to the nearest earlier block boundary.
    bar.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      bar.setPointerCapture(e.pointerId)
      const columnTop = column.getBoundingClientRect().top
      const onMove = (ev: PointerEvent) => {
        const y = ev.clientY - columnTop
        const target = nearestBoundaryAtOrAbove(tops, y, index)
        wrap.style.top = `${tops[target] ?? tops[index]}px`
        wrap.dataset.target = String(target)
      }
      const onUp = () => {
        bar.releasePointerCapture(e.pointerId)
        bar.removeEventListener('pointermove', onMove)
        bar.removeEventListener('pointerup', onUp)
        bar.removeEventListener('pointercancel', onUp)
        const target = Number(wrap.dataset.target ?? index)
        if (target !== index && target > 0) {
          forcedBreaks.delete(index)
          forcedBreaks.add(target)
          renderPreview(pagesEl, blocks, settings, forcedBreaks, infoEl)
        }
      }
      bar.addEventListener('pointermove', onMove)
      bar.addEventListener('pointerup', onUp)
      bar.addEventListener('pointercancel', onUp)
    })

    return wrap
  }
}

/**
 * Index of the block whose top offset is the closest boundary at or above `y`,
 * never past the current auto break `maxIndex` (breaks may only move earlier).
 */
function nearestBoundaryAtOrAbove(tops: number[], y: number, maxIndex: number): number {
  let best = 1
  for (let i = 1; i <= maxIndex && i < tops.length; i++) {
    if (tops[i] <= y) best = i
    else break
  }
  return best
}

/** Inject print CSS, open the OS print dialog, then clean up. */
function doPrint(settings: PrintSettings, forcedBreaks: Set<number>): void {
  document.getElementById('print-style')?.remove()
  const style = document.createElement('style')
  style.id = 'print-style'
  style.textContent = buildPrintCss(settings, forcedBreaks)
  document.head.appendChild(style)
  const cleanup = () => {
    document.getElementById('print-style')?.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
