'use client'

/**
 * RichMarkdown — Shared markdown-to-HTML renderer for report components.
 * Extracted from PremiumReport.tsx for reuse in SolutionCard and other components.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderMarkdown(md: string): string {
  // Escape all HTML first so raw tags like <link>, <head> render as visible text.
  // Markdown syntax (#, **, `, -, 1.) is unaffected by HTML escaping.
  return escapeHtml(md)
    // Code blocks (``` ... ```) — content already escaped above
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```\w*\n?/g, '').replace(/```$/g, '')
      return `<pre class="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto my-3">${code}</pre>`
    })
    // Headings: ## → h3, ### → h4
    .replace(/^### (.+)$/gm, '<h4 class="text-base font-semibold text-gray-900 mt-4 mb-2">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-lg font-semibold text-gray-900 mt-5 mb-3">$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="text-emerald-700 bg-gray-50 px-1 rounded text-xs">$1</code>')
    // Unordered lists: consecutive lines starting with "- "
    .replace(/(?:^- .+$\n?)+/gm, (block) => {
      const items = block.trim().split('\n').map(line =>
        `<li class="text-gray-600 text-sm">${line.replace(/^- /, '')}</li>`
      ).join('\n')
      return `<ul class="list-disc list-inside space-y-1 my-2">\n${items}\n</ul>`
    })
    // Ordered lists: consecutive lines starting with "1. ", "2. ", etc.
    .replace(/(?:^\d+\. .+$\n?)+/gm, (block) => {
      const items = block.trim().split('\n').map(line =>
        `<li class="text-gray-600 text-sm">${line.replace(/^\d+\.\s/, '')}</li>`
      ).join('\n')
      return `<ol class="list-decimal list-inside space-y-1 my-2">\n${items}\n</ol>`
    })
    // Paragraphs: non-empty lines that aren't already wrapped in HTML
    .replace(/^(?!<[a-z]).+$/gm, (line) => {
      if (line.trim() === '') return ''
      return `<p class="text-gray-600 text-sm mb-2">${line}</p>`
    })
}

interface RichMarkdownProps {
  content: string
  className?: string
}

export default function RichMarkdown({ content, className }: RichMarkdownProps) {
  return (
    <div
      className={className ?? 'prose-sm'}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  )
}
