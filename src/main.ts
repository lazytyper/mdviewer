/// <reference types="vite/client" />
import hljsLightUrl from 'highlight.js/styles/github.css?url'
import hljsDarkUrl from 'highlight.js/styles/github-dark.css?url'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import { render } from './render'
import { openPrintSetup, closePrintSetup } from './print/preview'
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

// --- hljs theme <link> elements (created before first refreshTheme call) ---
const hljsLightLink = document.createElement('link')
hljsLightLink.rel = 'stylesheet'
hljsLightLink.href = hljsLightUrl
document.head.appendChild(hljsLightLink)

const hljsDarkLink = document.createElement('link')
hljsDarkLink.rel = 'stylesheet'
hljsDarkLink.href = hljsDarkUrl
document.head.appendChild(hljsDarkLink)

let currentPath: string | null = null
let currentMarkdown: string | null = null
let preference: Preference = getStoredPreference()

const prefersDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches

/** Render currentMarkdown into contentEl and re-run mermaid, restoring scroll. */
async function renderCurrent(preserveScroll: boolean): Promise<void> {
  if (currentMarkdown === null) return
  const scrollY = preserveScroll ? window.scrollY : 0
  contentEl.innerHTML = render(currentMarkdown)
  await runMermaid()
  requestAnimationFrame(() => window.scrollTo(0, scrollY))
}

function refreshTheme(): void {
  const resolved = resolveTheme(preference, prefersDark())
  applyTheme(resolved)
  // Toggle hljs stylesheet links so exactly one is active
  if (resolved === 'dark') {
    hljsLightLink.disabled = true
    hljsDarkLink.disabled = false
  } else {
    hljsLightLink.disabled = false
    hljsDarkLink.disabled = true
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: resolved === 'dark' ? 'dark' : 'default',
  })
  // Re-render so mermaid diagrams pick up the new theme; skip if no doc loaded yet
  if (currentMarkdown !== null) {
    renderCurrent(true).catch((e) => console.error('Mermaid re-theme error', e))
  }
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
  const div = document.createElement('div')
  div.className = 'error-banner'
  div.textContent = message
  contentEl.replaceChildren(div)
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

async function loadFile(path: string, preserveScroll = false): Promise<void> {
  const scrollY = preserveScroll ? window.scrollY : 0
  try {
    const markdown = await invoke<string>('read_markdown', { path })
    currentMarkdown = markdown
    closePrintSetup()
    contentEl.innerHTML = render(markdown)
    await runMermaid()
    currentPath = path
    filenameEl.textContent = basename(path)
    requestAnimationFrame(() => window.scrollTo(0, scrollY))
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

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (preference === 'system') refreshTheme()
  })

getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
    loadFile(event.payload.paths[0])
  }
})

// Debounce live-reload: editors often emit several write events per save.
let reloadTimer: ReturnType<typeof setTimeout> | undefined
listen<string>('file-changed', (event) => {
  if (event.payload !== currentPath) return
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => loadFile(event.payload, true), 80)
})
listen('menu-print', () => openPrintSetup(contentEl))

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
