# Markdown-Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri v2 desktop app that renders local Markdown files to styled HTML with GFM, syntax highlighting, Mermaid, KaTeX, live-reload, and a persisted light/dark theme.

**Architecture:** Rust backend (Tauri v2) handles file reading, startup path (CLI arg / file association), and file watching; it exposes commands and emits `file-changed` events. A Vanilla-TypeScript (Vite) frontend does all Markdown→HTML rendering in a pure, testable `render()` function, manages theme state, and wires the toolbar and drag-and-drop.

**Tech Stack:** Tauri v2, Rust (`notify`, `tauri-plugin-dialog`), TypeScript + Vite, markdown-it (+ task-lists, texmath), highlight.js, KaTeX, Mermaid, DOMPurify, Vitest + jsdom.

---

## File Structure

```
mdviewer/
├── index.html                       # App shell: toolbar + content container
├── package.json                     # Scripts + JS deps
├── vite.config.ts                   # Vite config (from scaffold)
├── vitest.config.ts                 # Vitest (jsdom env)
├── tsconfig.json
├── src/
│   ├── main.ts                      # Wiring: toolbar, dialog, drag&drop, events, render
│   ├── render.ts                    # Pure: markdown string -> sanitized HTML
│   ├── theme.ts                     # Theme state (light/dark/system), persistence
│   ├── styles/app.css               # Layout, toolbar, modern typography, theme vars
│   ├── render.test.ts               # Vitest for render.ts
│   └── theme.test.ts                # Vitest for theme.ts
└── src-tauri/
    ├── Cargo.toml                   # Rust deps
    ├── tauri.conf.json              # Window, bundle, fileAssociations
    ├── capabilities/default.json    # Permissions (core + dialog)
    └── src/lib.rs                   # Commands: read_markdown, get_startup_path, start_watching
```

**Responsibilities:**
- `render.ts` — no Tauri imports; deterministic; the only place Markdown is turned into HTML. Mermaid *rendering* is NOT here (needs the live DOM); `render.ts` only emits `<pre class="mermaid">` placeholders.
- `theme.ts` — pure helpers (`resolveTheme`) + DOM/`localStorage` side-effect helpers (`applyTheme`, `getStoredPreference`, `nextPreference`). Persistence uses `localStorage` (works in the webview, testable in jsdom — a deliberate simplification of the spec's `tauri-plugin-store`).
- `main.ts` — holds app state (current path, current markdown, scroll), calls `render.ts`, runs Mermaid, listens for `file-changed`.
- `lib.rs` — file IO + watching; no rendering.

---

## Task 1: Scaffold Tauri v2 app and commit a working baseline

**Files:**
- Create (via scaffold): `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `src/`, `src-tauri/`

- [ ] **Step 1: Verify Linux system prerequisites for Tauri**

Run:
```bash
pkg-config --exists webkit2gtk-4.1 && echo "webkit OK" || echo "MISSING webkit2gtk-4.1"
pkg-config --exists gtk+-3.0 && echo "gtk OK" || echo "MISSING gtk+-3.0"
```
Expected: both `OK`. If missing, install (Debian/Ubuntu):
```bash
sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```
(A headless machine can still `cargo build` and `vitest`, but `npm run tauri dev` needs a display.)

- [ ] **Step 2: Scaffold into a temp dir (non-interactive)**

Run:
```bash
npm create tauri-app@latest /tmp/mdv-scaffold -- --template vanilla-ts --manager npm --identifier digital.schmid.mdviewer --yes
```
Expected: a generated project at `/tmp/mdv-scaffold` containing `src/`, `src-tauri/`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`.

- [ ] **Step 3: Copy scaffold files into the repo (keep our .gitignore and docs)**

Run:
```bash
cd /ext/dev2026/mdviewer
for p in src src-tauri index.html package.json vite.config.ts tsconfig.json tsconfig.node.json public; do
  [ -e /tmp/mdv-scaffold/$p ] && cp -r /tmp/mdv-scaffold/$p ./
done
ls src src-tauri
```
Expected: `src/` and `src-tauri/` now exist in the repo.

- [ ] **Step 4: Install JS dependencies (runtime + dev)**

Run:
```bash
cd /ext/dev2026/mdviewer
npm install
npm install markdown-it markdown-it-task-lists markdown-it-texmath katex highlight.js mermaid dompurify @tauri-apps/plugin-dialog @tauri-apps/api
npm install -D @types/markdown-it vitest jsdom
```
Expected: installs succeed, `node_modules/` populated.

- [ ] **Step 5: Add Rust dependencies**

Modify `src-tauri/Cargo.toml` — under `[dependencies]` add:
```toml
notify = "6"
tauri-plugin-dialog = "2"
```

- [ ] **Step 6: Verify frontend build and Rust build**

Run:
```bash
cd /ext/dev2026/mdviewer && npm run build
cd src-tauri && cargo build
```
Expected: `npm run build` produces `dist/` with no TS errors; `cargo build` finishes (first build is slow).

- [ ] **Step 7: Commit the baseline**

```bash
cd /ext/dev2026/mdviewer
git add -A
git commit -m "chore: scaffold Tauri v2 vanilla-ts baseline with deps"
```

---

## Task 2: Rust `read_markdown` command (TDD)

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Add to `src-tauri/src/lib.rs` (bottom of file):
```rust
#[cfg(test)]
mod tests {
    use super::read_markdown_impl;

    #[test]
    fn reads_existing_file() {
        let dir = std::env::temp_dir().join("mdv_test_read");
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.md");
        std::fs::write(&f, "# Hi").unwrap();
        let out = read_markdown_impl(f.to_str().unwrap());
        assert_eq!(out.unwrap(), "# Hi");
    }

    #[test]
    fn errors_on_missing_file() {
        let out = read_markdown_impl("/does/not/exist_42.md");
        assert!(out.is_err());
        assert!(out.unwrap_err().contains("nicht gefunden"));
    }

    #[test]
    fn errors_on_directory() {
        let dir = std::env::temp_dir();
        let out = read_markdown_impl(dir.to_str().unwrap());
        assert!(out.is_err());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test read_markdown_impl 2>&1 | tail -20`
Expected: FAIL — `cannot find function read_markdown_impl`.

- [ ] **Step 3: Write the minimal implementation**

Add to `src-tauri/src/lib.rs` (above the `run()` function):
```rust
fn read_markdown_impl(path: &str) -> Result<String, String> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err(format!("Datei nicht gefunden: {path}"));
    }
    if !p.is_file() {
        return Err(format!("Kein regulärer Dateipfad: {path}"));
    }
    std::fs::read_to_string(p).map_err(|e| format!("Konnte Datei nicht lesen: {e}"))
}

#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    read_markdown_impl(&path)
}
```

- [ ] **Step 4: Register the command in `run()`**

In `src-tauri/src/lib.rs`, find the `tauri::Builder::default()` chain and add the invoke handler (create the closure if none exists):
```rust
        .invoke_handler(tauri::generate_handler![read_markdown])
```

- [ ] **Step 5: Run tests and build**

Run: `cd src-tauri && cargo test 2>&1 | tail -20 && cargo build 2>&1 | tail -5`
Expected: all 3 tests PASS; build OK.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs && git commit -m "feat: add read_markdown command with tests"
```

---

## Task 3: Frontend `render.ts` pipeline (TDD)

**Files:**
- Create: `src/render.ts`, `src/render.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Add Vitest config and test script**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

Modify `package.json` — add to `"scripts"`:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Write the failing test**

Create `src/render.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { render } from './render'

describe('render', () => {
  it('renders a heading', () => {
    expect(render('# Title')).toContain('<h1>Title</h1>')
  })

  it('renders GFM tables', () => {
    const html = render('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders task lists with checkboxes', () => {
    const html = render('- [x] done\n- [ ] todo')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('highlights fenced code with a language class', () => {
    const html = render('```js\nconst x = 1\n```')
    expect(html).toContain('hljs')
    expect(html).toContain('language-js')
  })

  it('emits a mermaid placeholder instead of highlighting', () => {
    const html = render('```mermaid\ngraph TD; A-->B;\n```')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('A--&gt;B') // raw, escaped, not highlighted
    expect(html).not.toContain('hljs')
  })

  it('renders inline math via KaTeX', () => {
    const html = render('Euler: $e^{i\\pi}+1=0$')
    expect(html).toContain('katex')
  })

  it('strips dangerous HTML (XSS)', () => {
    const html = render('<img src=x onerror=alert(1)>\n\n<script>alert(2)</script>')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script>')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './render'`.

- [ ] **Step 4: Write the implementation**

Create `src/render.ts`:
```ts
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang): string {
    // Mermaid blocks are left raw for post-DOM rendering.
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(code, { language: lang }).value
        return `<pre class="hljs"><code class="language-${lang}">${out}</code></pre>`
      } catch {
        /* fall through to default */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
  },
})

md.use(taskLists, { enabled: true })
md.use(texmath, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { throwOnError: false },
})

/**
 * Convert a Markdown string into sanitized HTML.
 * Pure and deterministic — safe to unit-test. Does NOT render Mermaid
 * (that requires the live DOM); it emits <pre class="mermaid"> placeholders.
 */
export function render(markdown: string): string {
  const dirty = md.render(markdown)
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ADD_ATTR: ['checked', 'disabled'],
  })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: all 7 `render` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/render.ts src/render.test.ts vitest.config.ts package.json
git commit -m "feat: add pure render pipeline (GFM, highlight, katex, mermaid, sanitize)"
```

---

## Task 4: Frontend `theme.ts` (TDD)

**Files:**
- Create: `src/theme.ts`, `src/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveTheme, nextPreference, getStoredPreference, applyTheme } from './theme'

beforeEach(() => localStorage.clear())

describe('resolveTheme', () => {
  it('maps system to dark/light based on OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('returns explicit preference unchanged', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('nextPreference', () => {
  it('toggles the resolved theme to the opposite explicit value', () => {
    expect(nextPreference('light')).toBe('dark')
    expect(nextPreference('dark')).toBe('light')
  })
})

describe('getStoredPreference', () => {
  it('defaults to system when nothing stored', () => {
    expect(getStoredPreference()).toBe('system')
  })
  it('reads a stored value', () => {
    localStorage.setItem('mdviewer-theme', 'dark')
    expect(getStoredPreference()).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('sets the data-theme attribute on the root element', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Write the implementation**

Create `src/theme.ts`:
```ts
export type Preference = 'light' | 'dark' | 'system'
export type Resolved = 'light' | 'dark'

const KEY = 'mdviewer-theme'

/** Resolve a stored preference to a concrete theme, given the OS dark-mode flag. */
export function resolveTheme(pref: Preference, prefersDark: boolean): Resolved {
  if (pref === 'system') return prefersDark ? 'dark' : 'light'
  return pref
}

/** Given the currently *resolved* theme, the explicit preference to switch to. */
export function nextPreference(current: Resolved): Preference {
  return current === 'light' ? 'dark' : 'light'
}

export function getStoredPreference(): Preference {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function storePreference(pref: Preference): void {
  localStorage.setItem(KEY, pref)
}

export function applyTheme(resolved: Resolved): void {
  document.documentElement.setAttribute('data-theme', resolved)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: all `theme` tests PASS (render tests still pass too).

- [ ] **Step 5: Commit**

```bash
git add src/theme.ts src/theme.test.ts
git commit -m "feat: add theme state helpers with tests"
```

---

## Task 5: Modern CSS with light/dark themes

**Files:**
- Create: `src/styles/app.css`
- Modify: `index.html`

- [ ] **Step 1: Write the stylesheet**

Create `src/styles/app.css`:
```css
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #656d76;
  --border: #d0d7de;
  --accent: #0969da;
  --code-bg: #f6f8fa;
  --toolbar-bg: #f6f8fa;
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

:root[data-theme="dark"] {
  --bg: #0d1117;
  --fg: #e6edf3;
  --muted: #8b949e;
  --border: #30363d;
  --accent: #4493f8;
  --code-bg: #161b22;
  --toolbar-bg: #161b22;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
}

#toolbar {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border);
  z-index: 10;
}

#toolbar button {
  font: inherit;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  cursor: pointer;
}
#toolbar button:hover { border-color: var(--accent); }

#filename { color: var(--muted); font-size: 0.9rem; margin-right: auto; }

#content {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1.5rem 6rem;
  line-height: 1.6;
}

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

.error-banner {
  background: #ffdce0;
  color: #82071e;
  border: 1px solid #ff818266;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}
:root[data-theme="dark"] .error-banner {
  background: #3d1417;
  color: #ffa198;
}
```

- [ ] **Step 2: Wire the app shell and stylesheets in `index.html`**

Replace the `<body>` of `index.html` with:
```html
  <body>
    <div id="toolbar">
      <button id="open-btn">Öffnen…</button>
      <button id="reload-btn" title="Neu laden">↻</button>
      <span id="filename">Keine Datei geöffnet</span>
      <button id="theme-btn" title="Hell/Dunkel">🌓</button>
    </div>
    <main id="content"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
```

Also ensure the `<head>` imports styles and library CSS. Add inside `<head>`:
```html
    <link rel="stylesheet" href="/src/styles/app.css" />
```
(highlight.js and KaTeX CSS are imported from `main.ts` in the next task so the bundler resolves them.)

- [ ] **Step 3: Verify it builds**

Run: `npm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/styles/app.css index.html
git commit -m "feat: add modern light/dark stylesheet and app shell"
```

---

## Task 6: `main.ts` — wire toolbar, dialog, drag & drop, rendering, theme

**Files:**
- Create/replace: `src/main.ts`
- Modify: `src-tauri/src/lib.rs` (register dialog plugin), `src-tauri/capabilities/default.json`

- [ ] **Step 1: Register the dialog plugin in Rust**

In `src-tauri/src/lib.rs`, add the plugin to the builder chain (before `.invoke_handler`):
```rust
        .plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 2: Grant capabilities**

Replace `src-tauri/capabilities/default.json` with:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the markdown viewer",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open"
  ]
}
```

- [ ] **Step 3: Write `main.ts`**

Replace `src/main.ts` with:
```ts
import 'highlight.js/styles/github.css'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import { render } from './render'
import {
  applyTheme,
  getStoredPreference,
  nextPreference,
  resolveTheme,
  storePreference,
  type Preference,
} from './theme'

const contentEl = document.getElementById('content') as HTMLElement
const filenameEl = document.getElementById('filename') as HTMLElement
const openBtn = document.getElementById('open-btn') as HTMLButtonElement
const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement
const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement

let currentPath: string | null = null
let preference: Preference = getStoredPreference()

const prefersDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches

function refreshTheme(): void {
  const resolved = resolveTheme(preference, prefersDark())
  applyTheme(resolved)
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: resolved === 'dark' ? 'dark' : 'default',
  })
  // Re-run mermaid so diagrams pick up the new theme.
  if (currentPath) runMermaid()
}

async function runMermaid(): Promise<void> {
  const nodes = contentEl.querySelectorAll<HTMLElement>('pre.mermaid')
  if (nodes.length === 0) return
  try {
    await mermaid.run({ nodes })
  } catch (e) {
    console.error('Mermaid error', e)
  }
}

function showError(message: string): void {
  contentEl.innerHTML = `<div class="error-banner">${message}</div>`
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

async function loadFile(path: string, preserveScroll = false): Promise<void> {
  const scrollY = preserveScroll ? window.scrollY : 0
  try {
    const markdown = await invoke<string>('read_markdown', { path })
    contentEl.innerHTML = render(markdown)
    await runMermaid()
    currentPath = path
    filenameEl.textContent = basename(path)
    window.scrollTo(0, scrollY)
    await invoke('start_watching', { path }).catch(() => {})
  } catch (e) {
    showError(String(e))
  }
}

openBtn.addEventListener('click', async () => {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }],
  })
  if (typeof selected === 'string') await loadFile(selected)
})

reloadBtn.addEventListener('click', () => {
  if (currentPath) loadFile(currentPath, true)
})

themeBtn.addEventListener('click', () => {
  const resolved = resolveTheme(preference, prefersDark())
  preference = nextPreference(resolved)
  storePreference(preference)
  refreshTheme()
})

// React to OS theme changes while preference is "system".
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (preference === 'system') refreshTheme()
  })

// Drag & drop files onto the window.
getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
    loadFile(event.payload.paths[0])
  }
})

// Startup: initial theme + a path passed via CLI / file association.
async function init(): Promise<void> {
  refreshTheme()
  try {
    const startup = await invoke<string | null>('get_startup_path')
    if (startup) await loadFile(startup)
  } catch {
    /* command may not exist yet during early builds */
  }
}

init()
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -15`
Expected: build succeeds. (`get_startup_path` / `start_watching` commands are added in Tasks 7–8; the frontend calls them defensively, so the build does not depend on them.)

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: wire toolbar, dialog, drag&drop, rendering and theme toggle"
```

---

## Task 7: Startup path — CLI argument and file association

**Files:**
- Modify: `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Write the failing test for arg extraction**

Add to the `tests` module in `src-tauri/src/lib.rs`:
```rust
    use super::first_markdown_arg;

    #[test]
    fn picks_first_non_flag_arg() {
        let args = vec![
            "mdviewer".to_string(),
            "--flag".to_string(),
            "/tmp/doc.md".to_string(),
        ];
        assert_eq!(first_markdown_arg(&args), Some("/tmp/doc.md".to_string()));
    }

    #[test]
    fn returns_none_without_path() {
        let args = vec!["mdviewer".to_string()];
        assert_eq!(first_markdown_arg(&args), None);
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd src-tauri && cargo test first_markdown_arg 2>&1 | tail -15`
Expected: FAIL — `cannot find function first_markdown_arg`.

- [ ] **Step 3: Implement arg extraction + startup state + command**

Add to `src-tauri/src/lib.rs` (above `run()`):
```rust
use std::sync::Mutex;
use tauri::Manager;

/// The path passed at launch (CLI arg or OS file association), if any.
pub struct StartupPath(pub Mutex<Option<String>>);

/// First argument that is not the program name and does not start with '-'.
fn first_markdown_arg(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .cloned()
}

#[tauri::command]
fn get_startup_path(state: tauri::State<StartupPath>) -> Option<String> {
    state.0.lock().unwrap().clone()
}
```

- [ ] **Step 4: Populate the state in `run()` and register the command**

In `run()`, set up the managed state and setup hook. The builder should look like:
```rust
pub fn run() {
    let startup = first_markdown_arg(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            app.manage(StartupPath(Mutex::new(startup.clone())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            get_startup_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
(Merge with any existing content of `run()` rather than duplicating the builder.)

- [ ] **Step 5: Declare the `.md` file association**

In `src-tauri/tauri.conf.json`, under `"bundle"`, add:
```json
      "fileAssociations": [
        {
          "ext": ["md", "markdown"],
          "name": "Markdown Document",
          "description": "Markdown document",
          "role": "Viewer"
        }
      ]
```

- [ ] **Step 6: Run tests and build**

Run: `cd src-tauri && cargo test 2>&1 | tail -15 && cargo build 2>&1 | tail -5`
Expected: all tests PASS; build OK.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.conf.json
git commit -m "feat: open file from CLI arg / file association at startup"
```

---

## Task 8: File watcher and live-reload

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement the `start_watching` command**

Add to `src-tauri/src/lib.rs` (above `run()`). It watches the file's *parent directory* (robust against editors that save via rename) and emits `file-changed` only for the target file:
```rust
use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

/// Holds the active watcher so it is dropped/replaced when a new file opens.
pub struct WatcherState(pub Mutex<Option<notify::RecommendedWatcher>>);

#[tauri::command]
fn start_watching(
    path: String,
    app: AppHandle,
    state: tauri::State<WatcherState>,
) -> Result<(), String> {
    let target = std::path::PathBuf::from(&path);
    let parent = target
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Kein übergeordnetes Verzeichnis".to_string())?;

    let app_handle = app.clone();
    let target_for_cb = target.clone();

    let mut watcher = notify::recommended_watcher(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let relevant = matches!(
                    event.kind,
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_)
                );
                if relevant && event.paths.iter().any(|p| p == &target_for_cb) {
                    let _ = app_handle.emit("file-changed", target_for_cb.to_string_lossy().to_string());
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}
```

- [ ] **Step 2: Manage `WatcherState` and register the command**

In `run()`, extend the `setup` closure and the handler list:
```rust
        .setup(move |app| {
            app.manage(StartupPath(Mutex::new(startup.clone())));
            app.manage(WatcherState(Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            get_startup_path,
            start_watching
        ])
```

- [ ] **Step 3: Listen for `file-changed` in the frontend**

Add to `src/main.ts`, at the top add the import:
```ts
import { listen } from '@tauri-apps/api/event'
```
And near `init()` (before the `init()` call), add:
```ts
listen<string>('file-changed', (event) => {
  if (event.payload === currentPath) {
    loadFile(event.payload, true) // preserve scroll on live reload
  }
})
```

- [ ] **Step 4: Build both sides**

Run:
```bash
cd /ext/dev2026/mdviewer && npm run build 2>&1 | tail -8
cd src-tauri && cargo build 2>&1 | tail -5
```
Expected: both succeed.

- [ ] **Step 5: Manual smoke test (requires a display)**

Run: `cd /ext/dev2026/mdviewer && npm run tauri dev`
Verify:
- Toolbar “Öffnen…” opens a dialog; selecting a `.md` renders it.
- Dragging a `.md` file onto the window renders it.
- `🌓` toggles light/dark; restart the app — the choice persists.
- Edit the open file in another editor and save — the view updates, scroll position kept.
- Quit, then run `npm run tauri dev -- -- some.md` (or the built binary with a path) — the file opens on launch.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src/main.ts
git commit -m "feat: live-reload open file via filesystem watcher"
```

---

## Wrap-up

- [ ] **Push to GitHub**

```bash
git push
```

---

## Self-Review Notes (author)

- **Spec coverage:** open via dialog (T6), drag&drop (T6), CLI arg + file association (T7), live-reload (T8); GFM/highlight/mermaid/katex (T3); theme manual+OS+persisted (T4/T6); frontend rendering + DOMPurify (T3); error banner (T6); Rust + Vitest tests (T2/T3/T4/T7). All spec sections mapped.
- **Deliberate spec refinements:** theme persistence uses `localStorage` instead of `tauri-plugin-store` (simpler, testable in jsdom, persists in the webview); file watching observes the parent directory rather than the file node (robust against atomic-save editors). Both preserve the spec's observable behavior.
- **Type consistency:** `read_markdown`, `get_startup_path`, `start_watching` command names match between `lib.rs` handler registration and `main.ts` `invoke` calls; `render()`, `resolveTheme`, `nextPreference`, `applyTheme`, `getStoredPreference`, `storePreference` signatures match between modules, tests, and `main.ts`.
