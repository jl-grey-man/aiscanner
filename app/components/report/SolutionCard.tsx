'use client'

import { useState } from 'react'
import type { CheckResult } from '@/app/lib/scanResult'
import { CHECK_REGISTRY } from '@/app/lib/scanResult'
import { CHECK_EXPLANATIONS } from '@/app/lib/checkExplanations'
import { pickSolutionCode } from '@/app/lib/reportDisplay'
import CheckBadge from './CheckBadge'
import { renderMarkdown } from './RichMarkdown'

interface SolutionCardProps {
  check: CheckResult
  /**
   * true = kortet visas i ett upplåst (betalt) läge — premiumrapporten.
   * Default false = gratisrapportens beteende (mall-kod döljs helt), oförändrat.
   */
  unlocked?: boolean
}

type Priority = NonNullable<CheckResult['priority']>

// Priority-styling: headern på kortet får en mjuk färgad bakgrund i prioritetsfärg
// så användaren ser direkt vilken nivå. Body förblir vit för läsbarhet.
const PRIORITY_STYLE: Record<
  Priority,
  {
    label: string
    pillBg: string       // bakgrund på "KRITISKT"-pillen
    pillText: string     // textfärg
    headerBg: string     // bakgrund på hela header-sektionen
    headerBorder: string // border-färg
    dotClass: string     // prick i pill
  }
> = {
  critical: {
    label: 'Kritiskt',
    pillBg: 'bg-red-100',
    pillText: 'text-red-800',
    headerBg: 'bg-gradient-to-br from-red-50 to-white',
    headerBorder: 'border-red-200',
    dotClass: 'bg-red-500',
  },
  important: {
    label: 'Viktigt',
    pillBg: 'bg-amber-100',
    pillText: 'text-amber-800',
    headerBg: 'bg-gradient-to-br from-amber-50 to-white',
    headerBorder: 'border-amber-200',
    dotClass: 'bg-amber-500',
  },
  nice: {
    label: 'Bra att ha',
    pillBg: 'bg-blue-100',
    pillText: 'text-blue-800',
    headerBg: 'bg-gradient-to-br from-blue-50 to-white',
    headerBorder: 'border-blue-200',
    dotClass: 'bg-blue-500',
  },
}

export default function SolutionCard({ check, unlocked = false }: SolutionCardProps) {
  const [copied, setCopied] = useState(false)
  const priority = check.priority ?? 'nice'
  const style = PRIORITY_STYLE[priority]
  const registryEntry = CHECK_REGISTRY.find((e) => e.key === check.key)
  const checkLabel = registryEntry?.label ?? check.key

  const explanation = CHECK_EXPLANATIONS[check.key]

  // Kod-källa + synlighet: rich > codeRef-hänvisning (+ ev. delta) > mall (bara upplåst) > flash.
  // Ett kort med codeRef visar aldrig mall- eller Flash-kod — se pickSolutionCode().
  const {
    code: codeToShow,
    isTemplate: codeIsTemplate,
    showCode,
    codeRef,
  } = pickSolutionCode(check, unlocked)

  // Hänvisning (paid): ett annat kort har redan kodblocket som täcker den här checken
  // (huvudschemat eller en dubblett).
  const codeRefLabel = codeRef
    ? CHECK_REGISTRY.find((e) => e.key === codeRef)?.label ?? codeRef
    : null

  const handleCopy = () => {
    if (codeToShow) {
      navigator.clipboard.writeText(codeToShow)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      id={`fix-${check.key}`}
      className="mb-6 last:mb-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
    >
      {/* HEADER — prioritetsfärgad bakgrund med stor titel och "Vad är detta" inbäddat */}
      <div className={`${style.headerBg} border-b ${style.headerBorder} px-6 py-5`}>
        {/* Prioritets-pill + status-badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1.5 ${style.pillBg} ${style.pillText} text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} aria-hidden="true" />
            {style.label}
          </span>
          <CheckBadge status={check.status} />
        </div>

        {/* Stor titel */}
        <h3 className="text-2xl font-bold text-gray-900 mb-3 leading-tight">
          {checkLabel}
        </h3>

        {/* "Vad är detta?" — synlig direkt i headern, läsligt typsnitt */}
        {explanation && (
          <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-white shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              Vad är detta?
            </p>
            <p className="text-gray-900 text-base leading-relaxed">{explanation}</p>
          </div>
        )}
      </div>

      {/* BODY — vita block med större luft mellan sektioner */}
      <div className="px-6 py-5 space-y-5">
        {/* Block 2: Varför spelar det roll? */}
        {check.richRelevance ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Varför spelar det roll för er?
            </p>
            <div
              className="prose-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(check.richRelevance) }}
            />
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Vi hittade
            </p>
            <p className="text-gray-700 text-sm leading-relaxed">{check.finding}</p>
          </div>
        )}

        {/* Block 3: Så här fixar ni det */}
        {(check.richSteps || check.genericSteps || check.fix) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Så här fixar ni det
            </p>
            {check.richSteps ? (
              <div
                className="prose-sm text-gray-700 leading-relaxed [&_li]:mb-1"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(check.richSteps) }}
              />
            ) : check.genericSteps ? (
              <div
                className="prose-sm text-gray-700 leading-relaxed [&_li]:mb-1"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(check.genericSteps) }}
              />
            ) : (
              <p className="text-gray-700 text-sm leading-relaxed">{check.fix}</p>
            )}
          </div>
        )}

        {/* Block 4: Kod att kopiera. Källa och synlighet avgörs av pickSolutionCode()
            (reportDisplay.ts), i prioritetsordning:
            1. richCodeExample (paid, riktig data) — med codeRef är det bara delta-koden.
            2. codeRef-hänvisning till kortet som redan har kodblocket (huvudschemat) —
               ett kort med codeRef visar ALDRIG mall- eller Flash-kod.
            3. genericCodeTemplate — free (unlocked=false): döljs helt, datan finns kvar
               i scanResult. Premium (unlocked=true): redan ifylld med kända fakta på
               servern (templateFill.ts) och visas med "Mall"-badge i stället för att
               gömmas (Task 17 / Audit #2 — betalande kunder fick tomma kort). */}
        {(showCode || codeRefLabel) && (
          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Kod att kopiera
                </p>
                {showCode && codeIsTemplate && (
                  <span className="inline-flex items-center text-[11px] font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    Mall — ersätt värden inom hakparenteser
                  </span>
                )}
              </div>
              {showCode && (
                <button
                  onClick={handleCopy}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
                >
                  {copied ? (
                    <span className="text-emerald-600 font-medium">Kopierat!</span>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Kopiera
                    </>
                  )}
                </button>
              )}
            </div>
            {codeRefLabel && (
              <div className={`rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-gray-800 leading-relaxed${showCode ? ' mb-3' : ''}`}>
                <p>
                  {showCode ? (
                    <>
                      Grundkoden ingår i kodblocket under <strong>”{codeRefLabel}”</strong>. Nedan finns bara det som tillkommer för just den här punkten.
                    </>
                  ) : (
                    <>
                      Koden för den här punkten ingår redan i kodblocket under <strong>”{codeRefLabel}”</strong>. Lägg in det blocket en gång – det täcker flera punkter i rapporten.
                    </>
                  )}
                </p>
                <a
                  href={`#fix-${check.codeRef}`}
                  className="mt-2 inline-flex items-center gap-1 font-medium text-blue-700 hover:text-blue-900 hover:underline underline-offset-2"
                >
                  Gå till kodblocket
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            )}
            {showCode && (
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed">
                <code className="font-mono">{codeToShow}</code>
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
