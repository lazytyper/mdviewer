import { type PrintSettings, type PaperSize, type Orientation, type MarginPreset } from './format'

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

// Stub implementations — REPLACED with real ones in Task 6. Real (hoisted)
// function declarations so `openPrintSetup` above can call them.
function renderPreview(
  pagesEl: HTMLElement,
  _blocks: HTMLElement[],
  _settings: PrintSettings,
  _forcedBreaks: Set<number>,
  _infoEl: HTMLElement,
): void {
  pagesEl.textContent = ''
}

function doPrint(_settings: PrintSettings, _forcedBreaks: Set<number>): void {
  /* replaced in Task 6 */
}
