// Ambient module declarations for CJS-only packages that ship no TypeScript types.
// These stubs let tsc accept the imports; runtime behavior is unchanged.
declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  function markdownItTaskLists(md: MarkdownIt, options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean }): void
  export = markdownItTaskLists
}

declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function texmath(md: MarkdownIt, options?: Record<string, any>): void
  export = texmath
}
