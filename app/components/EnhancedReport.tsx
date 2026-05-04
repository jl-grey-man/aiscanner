'use client'

import type { EnhancedReportData } from '@/app/hooks/useAnalysis'

interface Props {
  data: EnhancedReportData
}

// ── Status badge ────────────────────────────────────────────────────────────

type StatusLevel = 'ok' | 'warning' | 'bad' | 'unknown'

function worstStatus(statuses: (string | undefined)[]): StatusLevel {
  const s = statuses.map(x => x || 'unknown')
  if (s.includes('bad')) return 'bad'
  if (s.includes('warning')) return 'warning'
  if (s.includes('ok')) return 'ok'
  return 'unknown'
}

function StatusBadge({ label, status }: { label: string; status: StatusLevel }) {
  const styles: Record<StatusLevel, string> = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    bad: 'bg-red-50 border-red-200 text-red-700',
    unknown: 'bg-gray-50 border-gray-200 text-gray-500',
  }
  const icons: Record<StatusLevel, string> = {
    ok: '✓',
    warning: '⚠',
    bad: '✗',
    unknown: '?',
  }
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${styles[status]}`}>
      <span>{icons[status]}</span>
      <span>{label}</span>
    </div>
  )
}

// ── Inline markdown formatter ────────────────────────────────────────────────

function inlineHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-xs font-mono text-gray-800">$1</code>')
}

// ── Markdown block renderer ──────────────────────────────────────────────────

function SynthesisMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={elements.length} className="mt-3 mb-3 p-4 bg-gray-800 text-green-400 text-xs overflow-auto rounded-lg leading-relaxed">
          {codeLines.join('\n')}
        </pre>
      )
      i++
      continue
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={elements.length} className="text-xl font-bold mt-10 mb-3 text-gray-900 border-b border-gray-200 pb-2 first:mt-0">
          {line.slice(3)}
        </h2>
      )
      i++
      continue
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={elements.length} className="text-base font-semibold mt-6 mb-2 text-accent">
          {line.slice(4)}
        </h3>
      )
      i++
      continue
    }

    // Numbered list — collect consecutive items
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={elements.length} className="list-decimal list-outside ml-5 space-y-1.5 my-2">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: inlineHtml(item) }} />
          ))}
        </ol>
      )
      continue
    }

    // Bullet list — collect consecutive items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={elements.length} className="list-disc list-outside ml-5 space-y-1.5 my-2">
          {items.map((item, j) => (
            <li key={j} className="text-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: inlineHtml(item) }} />
          ))}
        </ul>
      )
      continue
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph
    elements.push(
      <p key={elements.length} className="text-sm text-gray-700 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: inlineHtml(line) }} />
    )
    i++
  }

  return <div className="space-y-1">{elements}</div>
}

// ── Main component ───────────────────────────────────────────────────────────

export function EnhancedReport({ data }: Props) {
  const technicalStatus = worstStatus([
    data.technical?.aiCrawlers?.status,
    data.technical?.ogTags?.status,
    data.technical?.socialPresence?.status,
  ])
  const faqStatus = worstStatus([
    data.faqContent?.faqSchema?.status,
    data.faqContent?.contentDepth?.status,
    data.faqContent?.serviceSchema?.status,
  ])
  const eatStatus = worstStatus([
    data.eat?.eatSignals?.status,
    data.eat?.orgNumber?.status,
    data.eat?.certifications?.status,
  ])

  const domainLabel = data.url.replace(/^https?:\/\//, '').replace(/\/$/, '')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gray-900 text-white rounded-xl p-6">
        <div className="text-center mb-5">
          <span className="inline-block bg-accent/20 text-accent text-xs font-bold tracking-wide uppercase px-4 py-1.5 rounded-full border border-accent/40">
            ANALYS: {domainLabel}
          </span>
          {data.city && (
            <span className="ml-2 inline-block bg-white/10 text-gray-300 text-xs font-semibold px-3 py-1.5 rounded-full">
              {data.city}
            </span>
          )}
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap justify-center gap-2">
          {data.aiMentions && (
            <StatusBadge label="AI-omnämnanden" status={data.aiMentions.status as StatusLevel} />
          )}
          {data.directories && (
            <StatusBadge label="Kataloger" status={data.directories.status as StatusLevel} />
          )}
          {data.reviewReplies && (
            <StatusBadge label="Recensionssvar" status={data.reviewReplies.status as StatusLevel} />
          )}
          <StatusBadge label="Teknisk" status={technicalStatus} />
          <StatusBadge label="FAQ & Innehåll" status={faqStatus} />
          <StatusBadge label="E-A-T" status={eatStatus} />
        </div>

        {/* Review sample disclaimer */}
        {data.reviewReplies?.sampleNote && (
          <p className="text-center text-xs text-gray-400 mt-3 italic">
            {data.reviewReplies.sampleNote}
          </p>
        )}
      </div>

      {/* GBP quick card */}
      {data.placeData && (
        <div className="p-4 bg-frame border border-border rounded-xl flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900">{data.placeData.name}</div>
            {data.placeData.address && (
              <div className="text-sm text-muted mt-0.5">{data.placeData.address}</div>
            )}
            {data.placeData.phone && (
              <div className="text-sm text-muted">{data.placeData.phone}</div>
            )}
          </div>
          {data.placeData.rating > 0 && (
            <div className="text-center shrink-0">
              <div className="text-2xl font-bold text-amber-500">{data.placeData.rating}</div>
              <div className="text-xs text-muted">{data.placeData.reviewCount} rec.</div>
            </div>
          )}
          {!data.placeData.verified && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 shrink-0">
              Ej verifierad domänmatch
            </div>
          )}
        </div>
      )}

      {/* Synthesis */}
      <div className="p-6 md:p-8 bg-frame border border-border rounded-xl">
        <SynthesisMarkdown text={data.synthesis} />
      </div>
    </div>
  )
}
