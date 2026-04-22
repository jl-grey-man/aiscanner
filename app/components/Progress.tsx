interface Props {
  currentStep: string
  progressPct: number
  stepIndex?: number
}

interface SubStep {
  label: string
  detail: string
  tools: string[]
}

const PHASES = [
  {
    id: 'technical',
    label: 'Teknisk grund',
    icon: '🔧',
    description: 'Hur stabilt din webbplats är byggd — som husets grund. Utan en bra grund kan inte AI-sökmotorer hitta eller lita på din sida.',
    stepRange: [0, 1],
    checks: [
      { label: 'HTTPS-säkerhet', detail: 'Kontrollerar SSL-certifikat och kryptering' },
      { label: 'Robots.txt', detail: 'Läser crawl-direktiv för AI-bottar' },
      { label: 'Sitemap.xml', detail: 'Hittar och parsar sidkarta' },
      { label: 'Språkdeklaration', detail: 'Kontrollerar lang-attribut' },
      { label: 'Serverrespons', detail: 'Mäter svarstid och tillgänglighet' },
    ],
  },
  {
    id: 'discovery',
    label: 'Sidupptäckt',
    icon: '🔎',
    description: 'Vi letar efter alla viktiga sidor på din webbplats — inte bara förstasidan. På samma sätt som du vill visa hela huset, inte bara entrén.',
    stepRange: [2, 2],
    checks: [
      { label: 'Sök efter sitemap', detail: 'Letar efter sitemap.xml → väljer relevanta sidor' },
      { label: 'Interna länkar', detail: 'Fallback: skannar länkar på förstasidan' },
      { label: 'Kontaktsida', detail: 'Letar efter /kontakt, /contact' },
      { label: 'Om oss / Tjänster', detail: 'Letar efter /om, /tjanster, /services' },
      { label: 'Lokal landningssida', detail: 'Letar efter orts-specifika sidor' },
    ],
  },
  {
    id: 'fetch',
    label: 'Hämtar sidor',
    icon: '📥',
    description: 'Nu hämtar vi alla viktiga sidor parallellt — förstasidan, kontakt, tjänster och mer. Ju mer vi vet, desto bättre kan AI förstå ditt företag.',
    stepRange: [3, 3],
    checks: [
      { label: 'Förstasidan', detail: 'Hämtar HTML, titel, meta, schema' },
      { label: 'Kontaktsida', detail: 'Extraherar NAP, adress, telefon' },
      { label: 'Övriga sidor', detail: 'Hämtar upp till 3 sidor parallellt' },
      { label: 'NAP-extraktion', detail: 'Extraherar telefon, adress, ort' },
      { label: 'Schema-markup', detail: 'Letar efter JSON-LD strukturerad data' },
    ],
  },
  {
    id: 'local',
    label: 'Lokal synlighet',
    icon: '📍',
    description: 'Hur tydligt du visar var ditt företag finns — adress, telefon och ort. AI behöver detta för att koppla dig till rätt stad när någon söker "tandläkare i Göteborg".',
    stepRange: [4, 4],
    checks: [
      { label: 'NAP-data', detail: 'Kontrollerar namn, adress, telefon' },
      { label: 'Ort i titel & H1', detail: 'Letar efter ort i rubriker' },
      { label: 'LocalBusiness Schema', detail: 'Kontrollerar JSON-LD för lokalt företag' },
      { label: 'Google Business Profile', detail: 'Kontrollerar koppling till GBP' },
    ],
  },
  {
    id: 'aireadiness',
    label: 'AI-beredskap',
    icon: '🤖',
    description: 'Hur väl din webbplats är förberedd för AI-sökmotorer som ChatGPT och Perplexity. Det handlar om att göra det lätt för AI att förstå vem du är och vad du erbjuder.',
    stepRange: [5, 5],
    checks: [
      { label: 'llms.txt', detail: 'Letar efter AI-specifik fil' },
      { label: 'AI-crawler tillåtelse', detail: 'Kontrollerar robots.txt för GPTBot, ClaudeBot' },
      { label: 'Strukturerad data', detail: 'Kontrollerar Schema.org markup' },
      { label: 'Meta-taggar & Open Graph', detail: 'Kontrollerar title, description, OG-tags' },
    ],
  },
  {
    id: 'content',
    label: 'Innehållsanalys',
    icon: '📝',
    description: 'Hur bra ditt innehåll är strukturerat och skrivet — rubriker, texter och frågor/svar. AI citerar innehåll som är tydligt, aktuellt och lätt att förstå.',
    stepRange: [6, 7],
    checks: [
      { label: 'Rubrikstruktur (H1–H3)', detail: 'Analyserar heading-hierarki' },
      { label: 'Title & meta description', detail: 'Kontrollerar längd och kvalitet' },
      { label: 'Entitetstydlighet', detail: 'Bedömer om AI förstår vad företaget gör' },
      { label: 'Innehållsfräschhet', detail: 'Letar efter datum för senaste uppdatering' },
      { label: 'FAQ-innehåll', detail: 'Letar efter frågor och svar' },
    ],
  },
]

const STEP_DETAILS: Record<number, SubStep> = {
  0: { label: 'Hämtar hemsidan...', detail: 'Skickar HTTP-request, väntar på svar', tools: ['HTTP Client', 'BeautifulSoup'] },
  1: { label: 'Analyserar teknisk struktur...', detail: 'Kontrollerar HTTPS, robots.txt, sitemap, headers', tools: ['SSL Checker', 'Robots Parser', 'Sitemap Parser'] },
  2: { label: 'Upptäcker sidor...', detail: 'Läser sitemap.xml eller skannar interna länkar', tools: ['Sitemap Parser', 'Link Extractor'] },
  3: { label: 'Hämtar extra sidor...', detail: 'Kontakt, Om oss, Tjänster — parallellt', tools: ['Async HTTP ×4', 'HTML Parser ×4'] },
  4: { label: 'Kontrollerar lokal närvaro...', detail: 'NAP, ort, LocalBusiness schema, GBP', tools: ['NAP Extractor', 'Schema Validator', 'GBP API'] },
  5: { label: 'Analyserar AI-beredskap...', detail: 'llms.txt, AI-crawlers, Schema.org, meta-taggar', tools: ['llms.txt Checker', 'Schema.org Parser', 'Meta Analyzer'] },
  6: { label: 'Bearbetar AI-svar...', detail: 'Väntar på och tolkar AI-analysen', tools: ['Gemini 2.0 Flash', 'JSON Parser', 'Prompt Builder'] },
  7: { label: 'Klar!', detail: 'Analysen är färdig', tools: ['Rapportgenerator'] },
}

export function Progress({ progressPct, stepIndex = 0 }: Props) {
  const detail = STEP_DETAILS[stepIndex] || STEP_DETAILS[7]
  const pagesScanned = stepIndex >= 3 ? (stepIndex >= 4 ? '5 sidor' : 'Hämtar...') : '1 sida'
  const toolsCount = detail.tools.length

  return (
    <div className="w-full">
      {/* Live Status Header */}
      <div className="bg-gray-900 text-white rounded-xl p-5 mb-6 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-6 h-6">
            <div className="absolute inset-0 rounded-full border-2 border-white/30" />
            <div className="absolute inset-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
          </div>
          <div>
            <div className="font-bold text-lg">{detail.label}</div>
            <div className="text-sm text-gray-300">{detail.detail}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-extrabold tabular-nums">{progressPct}%</div>
            <div className="text-xs text-gray-400">{pagesScanned} skannade</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progressPct, 5)}%` }}
          />
        </div>

        {/* Tools row */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Tools aktiva:</span>
          {detail.tools.map((tool, i) => (
            <span key={i} className="text-[10px] bg-white/10 text-gray-200 px-2 py-1 rounded font-medium">
              {tool}
            </span>
          ))}
          <span className="text-[10px] text-gray-400 ml-auto">{toolsCount} verktyg</span>
        </div>
      </div>

      {/* Phases with checks */}
      <div className="space-y-3">
        {PHASES.map((phase) => {
          const isDone = stepIndex > phase.stepRange[1]
          const isActive = stepIndex >= phase.stepRange[0] && stepIndex <= phase.stepRange[1]
          const isPending = stepIndex < phase.stepRange[0]

          return (
            <div
              key={phase.id}
              className={`border-2 rounded-xl transition-all duration-500 ${
                isDone
                  ? 'bg-white border-emerald-400 shadow-sm'
                  : isActive
                  ? 'bg-white border-accent shadow-md'
                  : 'bg-gray-50 border-gray-200 opacity-50'
              }`}
            >
              {/* Phase header */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-xl shrink-0">{phase.icon}</span>
                  <span className={`font-bold ${isDone ? 'text-gray-900' : isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                    {phase.label}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {isDone && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">
                        ✅ Klar
                      </span>
                    )}
                    {isActive && (
                      <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-full font-bold animate-pulse">
                        🔍 Aktiv
                      </span>
                    )}
                    {isPending && (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-1 rounded-full font-bold">
                        ⏳ Väntar
                      </span>
                    )}
                  </div>
                </div>
                <p className={`text-xs leading-relaxed pl-8 ${isDone ? 'text-gray-600' : isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                  {phase.description}
                </p>
              </div>

              {/* Checks list */}
              <div className="px-4 pb-3 pl-11 space-y-1">
                {phase.checks.map((check, i) => {
                  const checkIsDone = isDone || (isActive && i <= (stepIndex - phase.stepRange[0]) * 2)
                  return (
                    <div
                      key={i}
                      className={`flex flex-col transition-all duration-300 ${
                        checkIsDone ? 'text-gray-800' : 'text-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs shrink-0 w-4">
                          {checkIsDone ? '✓' : '○'}
                        </span>
                        <span className={`text-sm ${checkIsDone ? 'font-medium' : ''}`}>{check.label}</span>
                      </div>
                      {checkIsDone && (
                        <span className="text-[11px] text-gray-500 pl-6">{check.detail}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
