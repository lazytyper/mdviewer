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
