'use client'

interface GlossaryEntry {
  term: string
  definition: string
}

const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    term: 'Schema markup',
    definition:
      'Osynlig kod på webbplatsen (vanligtvis JSON-LD) som berättar för sökmotorer och AI-motorer exakt vad ert företag är, vad ni erbjuder och hur man kontaktar er. Utan schema markup måste AI gissa.',
  },
  {
    term: 'JSON-LD',
    definition:
      'Det rekommenderade formatet för schema markup. En liten kodbit inuti <script type="application/ld+json"> i sidans HTML. Läses av Google, Bing, ChatGPT och Perplexity.',
  },
  {
    term: 'LocalBusiness',
    definition:
      'En schema.org-typ som identifierar ett företag som en lokal verksamhet med fysisk adress. Undertyper som Restaurant, Plumber och RealEstateAgent är ännu mer specifika och ger bättre synlighet.',
  },
  {
    term: 'robots.txt',
    definition:
      'En textfil på webbplatsens rot (t.ex. example.se/robots.txt) som talar om för sökmotorers crawlers vilka sidor de får besöka. Fel konfiguration kan blockera AI-crawlers från att indexera er sajt.',
  },
  {
    term: 'sitemap.xml',
    definition:
      'En XML-fil som listar alla viktiga sidor på webbplatsen. Hjälper sökmotorer att snabbt hitta och indexera allt innehåll, inklusive nya sidor.',
  },
  {
    term: 'llms.txt',
    definition:
      'En ny standard (liknande robots.txt) speciellt för AI-sökmotorer. Filen berättar för LLM-modeller som ChatGPT och Perplexity vad ert företag gör och hur AI ska tolka er sajt.',
  },
  {
    term: 'Canonical',
    definition:
      'En HTML-tagg (<link rel="canonical">) som pekar ut vilken URL som är "huvud-versionen" av en sida. Förhindrar duplicerat innehåll och samlar rankningssignaler till rätt URL.',
  },
  {
    term: 'OG-taggar (Open Graph)',
    definition:
      'Meta-taggar som styr hur er sida visas när den delas i sociala medier (Facebook, LinkedIn m.fl.). AI-motorer läser också OG-taggar för att förstå sidans titel, beskrivning och bild.',
  },
  {
    term: 'hreflang',
    definition:
      'En tagg som anger vilket språk och land en sida riktar sig till. Relevant för flerspråkiga webbplatser — talar om för sökmotorer vilken version av sidan som ska visas för användare i respektive land.',
  },
  {
    term: 'NAP',
    definition:
      'Förkortning för Name, Address, Phone (namn, adress, telefon). AI-sökmotorer jämför era kontaktuppgifter mellan webbplatsen, Google Företagsprofil, Eniro och Hitta. Inkonsekvent NAP sänker er lokala synlighet.',
  },
  {
    term: 'E-A-T',
    definition:
      'Expertis, Auktoritet, Trovärdighet (Expertise, Authoritativeness, Trustworthiness). Googles och AI-motorernas sätt att bedöma om ett företag är pålitligt. Stärks av recensioner, certifieringar, om-sidor och citeringar.',
  },
  {
    term: 'FAQ-schema',
    definition:
      'Schema markup av typen FAQPage som märker upp vanliga frågor och svar på webbplatsen. AI-motorer extraherar dessa direkt för att besvara frågor — en av de mest effektiva optimeringarna för AI-synlighet.',
  },
  {
    term: 'Alt-text',
    definition:
      'En textuell beskrivning av en bild, angiven i bildtaggens alt-attribut. Används av skärmläsare för tillgänglighet och av sökmotorer/AI för att förstå vad bilden föreställer.',
  },
  {
    term: 'CWV (Core Web Vitals)',
    definition:
      'Googles mättal för sidupplevelse: LCP (laddningstid för största innehåll), FID/INP (interaktivitet) och CLS (layoutstabilitet). Snabba sidor rankas högre av Google och upplevs bättre av besökare.',
  },
]

export default function Glossary() {
  return (
    <details className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
      <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors list-none">
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <h3 className="text-sm font-semibold text-gray-700">Ordlista — AI-sökordsoptimering</h3>
        </div>
        <span className="text-gray-400 text-xs">Visa / dölj</span>
      </summary>

      <div className="px-5 pb-5 pt-2 border-t border-gray-100">
        <dl className="space-y-4">
          {GLOSSARY_ENTRIES.map(({ term, definition }) => (
            <div key={term} className="grid grid-cols-[auto_1fr] gap-3 items-start">
              <dt className="text-sm font-semibold text-gray-800 whitespace-nowrap min-w-[9rem]">
                {term}
              </dt>
              <dd className="text-sm text-gray-500 leading-relaxed">{definition}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}
