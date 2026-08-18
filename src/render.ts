import MarkdownIt from 'markdown-it'
// markdown-it-task-lists and markdown-it-texmath are CJS-only packages with no
// bundled TypeScript types. Ambient declarations live in src/types.d.ts.
// They use `export =` so we import them with `import ... = require(...)` style,
// but since moduleResolution is "bundler" (ESM), we use the default import form
// which Vite/vitest resolve correctly via CJS interop.
import taskLists from 'markdown-it-task-lists'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, lang): string {
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
