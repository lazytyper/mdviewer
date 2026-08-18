# Print Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add printing to the Markdown viewer: triggered from a native OS menu and `Ctrl+P`, with a print-setup overlay offering paper-format selection and a paginated WYSIWYG preview whose page breaks can be adjusted with draggable bars, printing via the OS dialog (`window.print()`).

**Architecture:** Three pure, unit-tested TypeScript modules (`format.ts`, `paginate.ts`, `print-css.ts`) hold all the math and CSS generation. A DOM-heavy `preview.ts` builds the overlay, measures the rendered content, draws pages and draggable break bars, and calls `window.print()`. The Rust backend adds a native menu whose "Drucken…" item (accelerator `CmdOrCtrl+P`) emits a `menu-print` event that the frontend listens for.

**Tech Stack:** Tauri v2 (`tauri::menu`), TypeScript + Vite, Vitest + jsdom, CSS `@page` / `break-before`.

---

## File Structure

```
src/print/
├── format.ts        # pure: paper sizes, orientation, margins, scale -> px metrics
├── format.test.ts
├── paginate.ts      # pure: block heights + page content height + forced breaks -> break indices
├── paginate.test.ts
├── print-css.ts     # pure: settings + forced breaks -> @page / break-before CSS string
├── print-css.test.ts
└── preview.ts       # UI: overlay, measure, render pages + draggable bars, window.print()

Modified:
├── index.html                    # add class "md-body" to #content
├── src/styles/app.css            # retarget content typography to .md-body; add print-overlay CSS
├── src/main.ts                   # listen('menu-print') -> openPrintSetup; close on file change
└── src-tauri/src/lib.rs          # native menu + on_menu_event -> emit("menu-print")
```

**Responsibilities:** `format.ts`/`paginate.ts`/`print-css.ts` are pure (no DOM, no Tauri) and fully tested. `preview.ts` is the only DOM/side-effect module for printing; it imports the three pure modules. `lib.rs` gains menu wiring only. The `.md-body` class lets both the live `#content` and the preview clones share identical typography for accurate measurement (DRY).

---

## Task 1: `format.ts` — paper metrics (TDD)

**Files:**
- Create: `src/print/format.ts`, `src/print/format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/print/format.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- format 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Write the implementation**

Create `src/print/format.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- format 2>&1 | tail -15`
Expected: all `format` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/print/format.ts src/print/format.test.ts
git commit -m "feat(print): add pure paper-format metrics module"
```

---

## Task 2: `paginate.ts` — break computation (TDD)

**Files:**
- Create: `src/print/paginate.ts`, `src/print/paginate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/print/paginate.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- paginate 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './paginate'`.

- [ ] **Step 3: Write the implementation**

Create `src/print/paginate.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- paginate 2>&1 | tail -15`
Expected: all `paginate` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/print/paginate.ts src/print/paginate.test.ts
git commit -m "feat(print): add pure pagination module"
```

---

## Task 3: `print-css.ts` — print CSS builder (TDD)

**Files:**
- Create: `src/print/print-css.ts`, `src/print/print-css.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/print/print-css.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- print-css 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './print-css'`.

- [ ] **Step 3: Write the implementation**

Create `src/print/print-css.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- print-css 2>&1 | tail -15`
Expected: all `print-css` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/print/print-css.ts src/print/print-css.test.ts
git commit -m "feat(print): add pure print-CSS builder"
```

---

## Task 4: Rust native menu + `menu-print` event

**Files:**
- Modify: `src-tauri/src/lib.rs`

This task has no Rust unit test (menu creation needs a running app); verify by `cargo build` and confirm the frontend listener stub compiles. Behaviour is covered by the manual test in Task 6.

- [ ] **Step 1: Add the menu imports**

At the top of `src-tauri/src/lib.rs`, add to the existing `use` lines (keep existing imports; do not duplicate `use tauri::{...}`):
```rust
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
```

- [ ] **Step 2: Build the menu in the setup hook and wire the event**

In `run()`, inside the existing `.setup(move |app| { ... })` closure, BEFORE `Ok(())`, add:
```rust
        let print_item = MenuItemBuilder::new("Drucken…")
            .id("print")
            .accelerator("CmdOrCtrl+P")
            .build(app)?;
        let file_menu = SubmenuBuilder::new(app, "Datei")
            .item(&print_item)
            .build()?;
        let menu = MenuBuilder::new(app).item(&file_menu).build()?;
        app.set_menu(menu)?;
        app.on_menu_event(move |app, event| {
            if event.id() == "print" {
                let _ = app.emit("menu-print", ());
            }
        });
```
Notes:
- `app` here is the `&mut tauri::App` (or `&AppHandle`) provided to `setup`; `MenuItemBuilder::new(...).build(app)` and `SubmenuBuilder::new(app, ...)` accept it.
- `Emitter` (providing `emit`) is already imported from Task 8 of the viewer; `Manager` (providing `set_menu`, `on_menu_event`) is already imported. If the compiler reports a missing trait for `set_menu`/`on_menu_event`/`emit`, add the needed trait to the existing `use tauri::{...}` line (`Manager`, `Emitter`) rather than a new statement.

- [ ] **Step 3: Build to verify it compiles**

Run: `cd src-tauri && cargo build 2>&1 | tail -15`
Expected: compiles. If a trait-scope error appears for `set_menu`/`on_menu_event`, ensure `tauri::Manager` is in scope; for `emit`, ensure `tauri::Emitter` is in scope.

- [ ] **Step 4: Verify the existing Rust tests still pass**

Run: `cd src-tauri && cargo test 2>&1 | tail -8`
Expected: the 5 existing tests still PASS (this task adds no tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(print): add native Datei>Drucken menu emitting menu-print (Ctrl+P)"
```

---

## Task 5: Preview overlay — shell, controls, persistence, wiring

**Files:**
- Create: `src/print/preview.ts`
- Modify: `index.html`, `src/styles/app.css`, `src/main.ts`

This task builds the overlay, its format controls, settings persistence, and the open/close wiring (including opening from the `menu-print` event and closing when the document changes). Page rendering and break bars come in Task 6. Verify by build + manual open/close.

- [ ] **Step 1: Give the content element a shared typography class**

In `index.html`, change:
```html
    <main id="content"></main>
```
to:
```html
    <main id="content" class="md-body"></main>
```

- [ ] **Step 2: Retarget content typography to `.md-body` and add overlay styles**

In `src/styles/app.css`, change every `#content` selector that styles the *rendered markdown* to `.md-body`, so the preview clones get identical typography. Concretely, replace these rules:
```css
#content h1, #content h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
#content a { color: var(--accent); }
#content code {
  font-family: var(--font-mono);
  background: var(--code-bg);
  padding: 0.15em 0.35em;
  border-radius: 4px;
  font-size: 0.9em;
}
#content pre {
  background: var(--code-bg);
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
}
#content pre code { background: none; padding: 0; }
#content table { border-collapse: collapse; }
#content th, #content td { border: 1px solid var(--border); padding: 0.4rem 0.8rem; }
#content blockquote {
  margin: 0;
  padding-left: 1rem;
  border-left: 4px solid var(--border);
  color: var(--muted);
}
#content img { max-width: 100%; }
```
with the same rules but using `.md-body` instead of `#content`:
```css
.md-body h1, .md-body h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.md-body a { color: var(--accent); }
.md-body code {
  font-family: var(--font-mono);
  background: var(--code-bg);
  padding: 0.15em 0.35em;
  border-radius: 4px;
  font-size: 0.9em;
}
.md-body pre {
  background: var(--code-bg);
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
}
.md-body pre code { background: none; padding: 0; }
.md-body table { border-collapse: collapse; }
.md-body th, .md-body td { border: 1px solid var(--border); padding: 0.4rem 0.8rem; }
.md-body blockquote {
  margin: 0;
  padding-left: 1rem;
  border-left: 4px solid var(--border);
  color: var(--muted);
}
.md-body img { max-width: 100%; }
```
Leave the `#content { max-width … }` layout rule and the `.error-banner` rules unchanged. Then append the print-overlay styles to the end of the file:
```css
/* --- Print setup overlay --- */
#print-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
#print-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.6rem 1rem;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border);
}
#print-toolbar label { font-size: 0.85rem; color: var(--muted); display: inline-flex; gap: 0.35rem; align-items: center; }
#print-toolbar select, #print-toolbar input { font: inherit; }
#print-toolbar #pf-info { margin-left: auto; color: var(--muted); font-size: 0.85rem; }
#print-toolbar button {
  font: inherit; padding: 0.35rem 0.8rem; border: 1px solid var(--border);
  border-radius: 6px; background: var(--bg); color: var(--fg); cursor: pointer;
}
#print-toolbar #pf-print { border-color: var(--accent); color: var(--accent); }
#print-toolbar button:disabled { opacity: 0.5; cursor: default; }
#print-pages {
  flex: 1;
  overflow: auto;
  padding: 1.5rem;
  display: flex;
  justify-content: center;
  background: #8884;
}
/* the measured content column */
.print-column {
  position: relative;
  background: #fff;
  color: #111;
  box-shadow: 0 0 8px #0006;
}
:root[data-theme="dark"] .print-column { background: #fff; color: #111; }
/* filler that visualises the empty tail of a page */
.print-gap { background: repeating-linear-gradient(45deg, #0000 0 8px, #00000010 8px 16px); }
/* draggable break bar */
.print-break {
  position: relative;
  height: 0;
}
.print-break-bar {
  position: absolute;
  left: -6px; right: -6px;
  height: 10px;
  transform: translateY(-5px);
  cursor: row-resize;
  display: flex;
  align-items: center;
}
.print-break-bar::before {
  content: ""; flex: 1; height: 2px;
  background: var(--accent);
}
.print-break-bar .print-break-remove {
  cursor: pointer; color: #fff; background: var(--accent);
  border-radius: 4px; font-size: 0.7rem; line-height: 1; padding: 2px 4px; margin-left: 4px;
}
/* the "+" affordance to add a manual break between blocks */
.print-addbreak {
  position: absolute; left: 0; right: 0; height: 12px; transform: translateY(-6px);
  cursor: pointer; opacity: 0; display: flex; align-items: center; justify-content: center;
}
.print-addbreak::before { content: "+ Umbruch"; font-size: 0.7rem; color: var(--accent); }
.print-addbreak:hover { opacity: 1; }
```

- [ ] **Step 3: Create the preview module shell (open/close + controls + persistence)**

Create `src/print/preview.ts`:
```ts
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
```
NOTE: These are real (empty) function declarations, not `declare` types — so the overlay opens, controls persist to `localStorage`, and clicking Drucken is a no-op until Task 6 fills them in. Parameters are prefixed with `_` so `noUnusedParameters` does not flag them. This task does NOT import `pageMetrics` (Task 6 adds it), keeping `noUnusedLocals` happy.

- [ ] **Step 4: Wire the menu event and document-change close in `main.ts`**

In `src/main.ts`, add the import near the other imports:
```ts
import { openPrintSetup, closePrintSetup } from './print/preview'
```
Add a listener alongside the existing `listen('file-changed', …)` block:
```ts
listen('menu-print', () => openPrintSetup(contentEl))
```
And inside `loadFile`, immediately after `currentMarkdown = markdown`, add a line so a document change discards any open print setup (its block indices would be stale):
```ts
    closePrintSetup()
```

- [ ] **Step 5: Build and verify**

Run:
```bash
cd /ext/dev2026/mdviewer && npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```
Expected: build succeeds; all existing + new pure-module tests pass (19 total: 13 viewer + 6 print pure across Tasks 1–3). The overlay opens on `menu-print`, controls persist to `localStorage`, and the preview area is empty (filled in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/print/preview.ts index.html src/styles/app.css src/main.ts
git commit -m "feat(print): add print-setup overlay shell, controls, persistence and wiring"
```

---

## Task 6: Preview rendering, draggable break bars, and printing

**Files:**
- Modify: `src/print/preview.ts`

This task replaces the two stub functions from Task 5 with real implementations: it renders the content column, computes pagination, draws page-boundary bars (draggable to an earlier block boundary), lets the user add/remove manual breaks, and performs the print. DOM-heavy; verified by build + manual test.

- [ ] **Step 1: Add the rendering + print imports**

In `src/print/preview.ts`, update the top `format` import to also bring in `pageMetrics`, and add the pagination + CSS imports:
```ts
import { pageMetrics, type PrintSettings, type PaperSize, type Orientation, type MarginPreset } from './format'
import { paginate } from './paginate'
import { buildPrintCss } from './print-css'
```

- [ ] **Step 2: Replace the two stub functions with real implementations**

At the bottom of `src/print/preview.ts`, replace the two stub functions from Task 5:
```ts
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
```
with the real implementations:
```ts
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

  // Build the content column at printable width, with scaled typography.
  const column = document.createElement('div')
  column.className = 'md-body print-column'
  column.style.width = `${metrics.contentWidthPx}px`
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

  // Draw a draggable bar before every break block.
  for (const idx of breaks) {
    const bar = makeBreakBar(idx, forcedBreaks.has(idx))
    bar.style.top = `${tops[idx]}px`
    column.appendChild(bar)
  }

  // Between every pair of adjacent blocks that is NOT already a break,
  // offer an "add manual break" affordance.
  for (let i = 1; i < cloned.length; i++) {
    if (breaks.includes(i)) continue
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
        const target = Number(wrap.dataset.target ?? index)
        if (target !== index && target > 0) {
          forcedBreaks.delete(index)
          forcedBreaks.add(target)
          renderPreview(pagesEl, blocks, settings, forcedBreaks, infoEl)
        }
      }
      bar.addEventListener('pointermove', onMove)
      bar.addEventListener('pointerup', onUp)
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
```

- [ ] **Step 3: Build and test**

Run:
```bash
cd /ext/dev2026/mdviewer && npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```
Expected: build succeeds; all tests pass (19 total).

- [ ] **Step 4: Manual smoke test (requires a display)**

Run: `cd /ext/dev2026/mdviewer && npm run tauri dev`, open a multi-page Markdown file, then:
- Press `Ctrl+P` and use the menu **Datei → Drucken…** — both open the print setup.
- Change Größe/Ausrichtung/Ränder/Skalierung — the preview and page count update; reopen the app to confirm the settings persisted.
- Drag a page-boundary bar upward — it snaps to an earlier block boundary and re-paginates; a forced bar shows an ✕ that removes it.
- Hover between two blocks and click **+ Umbruch** — a manual break is added.
- Click **Drucken** — the OS print dialog appears; verify the forced breaks are honoured in the printout/preview.
- Trigger a live-reload (edit the file) — the print setup closes.

- [ ] **Step 5: Commit**

```bash
git add src/print/preview.ts
git commit -m "feat(print): render paginated preview with draggable break bars and OS print"
```

---

## Self-Review Notes (author)

- **Spec coverage:** OS-dialog output via injected `@page` CSS + `window.print()` (T3/T6); trigger via native menu + `CmdOrCtrl+P` emitting `menu-print` (T4) and frontend listener (T5); format options size/orientation/margin/scale (T1 metrics, T5 controls, T3 CSS); paginated preview (T6); draggable auto-breaks moved earlier + add/remove manual breaks snapping to element boundaries (T6 `nearestBoundaryAtOrAbove`, add/remove handlers); persistence of format settings in `localStorage`, manual breaks per-document reset on open and on document change (T5 `forcedBreaks` fresh per open + `closePrintSetup` in `loadFile`); error handling for empty document (T5 disables print) and block-taller-than-page (T2 places alone); tests for the three pure modules (T1–T3). All spec sections mapped.
- **Deliberate refinement:** the preview visualises pages as a single measured column with break bars rather than discrete page cards; this keeps the drag interaction simple and measurement identical to the real `#content` (shared `.md-body` typography). The actual print fidelity comes from `@page` + forced `break-before` on the real `#content`, not from the preview DOM.
- **Type consistency:** `PrintSettings`/`PaperSize`/`Orientation`/`MarginPreset`, `pageMetrics`/`paperMm`/`mmToPx`, `paginate(heights, contentHeightPx, forcedBreaks)`, `buildPrintCss(settings, forcedBreaks)`, `openPrintSetup`/`closePrintSetup`/`renderPreview`/`doPrint` are used with identical signatures across tasks, tests, and `main.ts`.
- **Known limitation logged:** `nearestBoundaryAtOrAbove` enforces "breaks may only move earlier" by capping at the current auto index, matching the spec constraint.
```
