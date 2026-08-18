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
    expect(html).toContain('A--&gt;B')
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
