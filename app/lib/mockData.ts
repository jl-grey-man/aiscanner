import type { FreeReportData } from '@/app/hooks/useAnalysis'

export const mockFreeReport: FreeReportData = {
  score: 62,
  summary:
    'Din hemsida har en okej teknisk grund men saknar flera viktiga signaler för AI-sökmotorer. LocalBusiness-schema och llms.txt saknas helt, vilket gör att AI:n har svårt att förstå vem du är och vad du gör.',
  categories: {
    technical: { score: 7, label: 'Teknisk grund' },
    local: { score: 4, label: 'Lokal synlighet' },
    aireadiness: { score: 3, label: 'AI-beredskap' },
    content: { score: 6, label: 'Innehåll' },
  },
  phases: [
    {
      id: 'technical',
      label: 'Teknisk grund',
      checks: [
        {
          title: 'HTTPS-säkerhet',
          status: 'good',
          finding: 'Sidan använder HTTPS.',
          what: 'HTTPS krypterar all trafik mellan besökarens webbläsare och din server.',
          why: 'AI-sökmotorer och användare litar mer på säkra sidor — osäkra sidor rankas lägre och får högre avvisningsfrekvens.',
          fix: '',
        },
        {
          title: 'Robots.txt',
          status: 'good',
          finding: 'robots.txt finns.',
          what: 'Robots.txt är en textfil som talar om för sökmotorer vilka sidor de får besöka.',
          why: 'Utan robots.txt kan AI-crawlers missförstå din webbplats eller undvika att indexera viktigt innehåll.',
          fix: '',
        },
        {
          title: 'Sitemap.xml',
          status: 'warning',
          finding: 'Ingen sitemap.xml hittades.',
          what: 'Sitemap.xml är en fil som listar alla viktiga sidor på din webbplats.',
          why: 'AI-crawlers använder sitemaps för att snabbare hitta och förstå strukturen på din webbplats.',
          fix: 'Skapa en sitemap.xml och registrera den i Google Search Console.',
        },
        {
          title: 'Språkdeklaration',
          status: 'good',
          finding: 'Sidan har språkdeklaration.',
          what: 'Språkdeklarationen (lang-attributet) talar om för sökmotorer vilket språk sidan är skriven på.',
          why: 'AI-sökmotorer använder språkdeklarationen för att matcha din sida med rätt språk och geografisk marknad.',
          fix: '',
        },
        {
          title: 'Serverrespons & hastighet',
          status: 'good',
          finding: 'Servern svarar och sidan är tillgänglig.',
          what: 'Serverrespons och laddningstid mäts i hur snabbt din server svarar och sidan visas.',
          why: 'Långsamma sidor rankas lägre — AI-motorer prioriterar sidor som ger användaren snabba svar.',
          fix: '',
        },
      ],
    },
    {
      id: 'local',
      label: 'Lokal synlighet',
      checks: [
        {
          title: 'NAP-data (namn, adress, telefon)',
          status: 'warning',
          finding: 'Telefonnummer hittade: 031-123 45 67.',
          what: 'NAP står för Name, Address, Phone — dina grundläggande företagsuppgifter.',
          why: 'AI-motorer använder NAP för att verifiera att du är ett riktigt lokalt företag — felaktiga uppgifter sänker synligheten.',
          fix: 'Lägg till företagsnamn, adress och telefonnummer tydligt på sidan, helst i sidfoten.',
        },
        {
          title: 'Ort i titel & H1',
          status: 'bad',
          finding: 'Ingen ort hittades i titel eller H1. Hittade orter: Göteborg.',
          what: 'Att ha ortnamnet i titel och H1 visar tydligt var ditt företag finns.',
          why: 'Lokala sökningar som "tandläkare Göteborg" matchar bättre när orten finns i titel och rubriker.',
          fix: 'Inkludera orten (Göteborg) i title-taggen och H1-rubriken.',
        },
        {
          title: 'LocalBusiness Schema',
          status: 'bad',
          finding: 'Inget LocalBusiness-schema hittades.',
          what: 'LocalBusiness Schema är strukturerad data (JSON-LD) som beskriver ditt företag för sökmotorer.',
          why: 'AI-motorer använder schema för att direkt extrahera öppettider, adress och telefon utan att tolka texten.',
          fix: 'Lägg till LocalBusiness JSON-LD schema med namn, adress, telefon och öppettider.',
        },
        {
          title: 'Restaurant/FoodEstablishment Schema',
          status: 'warning',
          finding: 'Inget Restaurant/FoodEstablishment-schema hittades.',
          what: 'Restaurant/FoodEstablishment Schema är strukturerad data för restauranger och caféer.',
          why: 'AI-motorer kan visa meny, öppettider och prisklass direkt i sökresultat när Restaurant-schema finns.',
          fix: 'Om du driver restaurang eller café, lägg till Restaurant-schema med meny, öppettider och prisklass.',
        },
        {
          title: 'Google Business Profile-koppling',
          status: 'good',
          finding: "Google Business Profile hittad: 'Tandläkare Johansson' (4.5⭐, 23 recensioner) på Torslandavägen 12, Göteborg.",
          what: 'Google Business Profile är din företagsprofil på Google Maps och Google Sök.',
          why: 'AI-motorer som Gemini och Google AI citerar aktivt GBP-data — utan koppling missar du lokala sökningar.',
          fix: '',
        },
      ],
    },
    {
      id: 'aireadiness',
      label: 'AI-beredskap',
      checks: [
        {
          title: 'llms.txt',
          status: 'bad',
          finding: 'Ingen llms.txt hittades.',
          what: 'llms.txt är en ny standard där du kan beskriva din webbplats specifikt för AI-modeller.',
          why: 'Med llms.txt kan du styra exakt hur AI-crawlers tolkar och använder ditt innehåll.',
          fix: 'Skapa /llms.txt med en kort beskrivning av din verksamhet.',
        },
        {
          title: 'AI-crawler tillåtelse',
          status: 'warning',
          finding: 'robots.txt finns — kontrollera att AI-crawlers inte blockeras.',
          what: 'AI-crawler tillåtelse innebär att du uttryckligen tillåter AI-bottar som GPTBot och ClaudeBot.',
          why: 'Blockerar du AI-crawlers kan ChatGPT, Perplexity och Google AI aldrig hitta eller citera din sida.',
          fix: 'Lägg till: User-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /',
        },
        {
          title: 'Strukturerad data (Schema.org)',
          status: 'warning',
          finding: 'Ingen strukturerad data (JSON-LD) hittades.',
          what: 'Schema.org är ett standardiserat sätt att märka upp information så att maskiner förstår den.',
          why: 'AI-motorer läser schema för att direkt svara på frågor — utan schema måste AI gissa vad sidan handlar om.',
          fix: 'Lägg till schema.org markup, t.ex. Organization eller LocalBusiness.',
        },
        {
          title: 'Meta-taggar & Open Graph',
          status: 'good',
          finding: 'Title (34 tecken) och meta description (142 tecken) finns.',
          what: 'Meta-taggar och Open Graph är dolda taggar som beskriver sidan för sökmotorer och sociala medier.',
          why: 'AI-motorer använder meta description och Open Graph för att generera förhandsvisningar och svar.',
          fix: '',
        },
      ],
    },
    {
      id: 'content',
      label: 'Innehåll',
      checks: [
        {
          title: 'Rubrikstruktur (H1-H3)',
          status: 'good',
          finding: 'H1: Tandläkare Johansson — Din tandläkare i Göteborg',
          what: 'Rubrikstruktur (H1–H3) organiserar ditt innehåll hierarkiskt för både läsare och sökmotorer.',
          why: 'AI-motorer använder rubrikerna för att förstå innehållets struktur och extrahera nyckelpunkter.',
          fix: '',
        },
        {
          title: 'Title & meta description',
          status: 'warning',
          finding: "Title: 'Tandläkare Johansson' (34 tecken)",
          what: 'Title-tagg och meta description är det som visas i sökresultaten.',
          why: 'AI-motorer använder dessa för att avgöra relevans — en svag title sänker både klick och ranking.',
          fix: 'Optimera title (30-60 tecken) och meta description (100-160 tecken).',
        },
        {
          title: 'Entitetstydlighet',
          status: 'good',
          finding: 'Sidan kommunicerar tydligt vad företaget gör.',
          what: 'Entitetstydlighet handlar om hur tydligt du kommunicerar VEM du är och VAD du gör.',
          why: 'AI-motorer måste kunna koppla din sida till rätt företagsentitet — annars visas du aldrig i svaren.',
          fix: '',
        },
        {
          title: 'Innehållsfräschhet',
          status: 'warning',
          finding: 'Kunde inte avgöra när innehållet senast uppdaterades.',
          what: 'Innehållsfräschhet handlar om hur nyligen ditt innehåll uppdaterades.',
          why: 'AI-motorer prioriterar aktuellt innehåll — gamla, orörda sidor rankas lägre.',
          fix: "Lägg till publiceringsdatum eller 'senast uppdaterad' i sidans innehåll.",
        },
        {
          title: 'FAQ-innehåll',
          status: 'warning',
          finding: 'Ingen FAQ-sektion hittades.',
          what: 'FAQ-innehåll är en samling vanliga frågor och svar på din webbplats.',
          why: 'AI-motorer citerar direkt från FAQ-sektioner — en bra FAQ kan ge dig toppresultat i AI-svar.',
          fix: 'Lägg till vanliga frågor och svar — det ökar chansen att AI citerar din sida.',
        },
      ],
    },
  ],
  criticalIssues: [
    {
      severity: 'high',
      category: 'local',
      title: 'LocalBusiness-schema saknas',
      description:
        'Din sida har inget LocalBusiness-schema. Detta är den viktigaste signalen för lokal AI-synlighet.',
      fix: 'Lägg till följande JSON-LD i <head>:',
      codeExample: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dentist",
  "name": "Tandläkare Johansson",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Torslandavägen 12",
    "addressLocality": "Göteborg",
    "addressRegion": "Västra Götalands län",
    "postalCode": "423 38",
    "addressCountry": "SE"
  },
  "telephone": "+46-31-123-45-67",
  "url": "https://tandlakare-johansson.se"
}
</script>`,
    },
    {
      severity: 'medium',
      category: 'content',
      title: 'Ortnamn saknas i title och H1',
      description:
        'Lokala sökningar matchar bättre när orten finns med i titel och rubriker.',
      fix: 'Byt title till "Tandläkare Johansson — Göteborg | Torslanda" och H1 till "Din tandläkare i Göteborg".',
      codeExample: null,
    },
  ],
  quickWins: [
    {
      title: 'Skapa en sitemap.xml',
      fix: 'Generera en sitemap.xml med alla dina sidor och lägg den i roten på domänen.',
      effort: 'small',
    },
    {
      title: 'Lägg till FAQ-sektion',
      fix: 'Skapa en sida med 5-10 vanliga frågor och svar om dina tjänster.',
      effort: 'small',
    },
  ],
  localSignals: {
    napFound: true,
    cityFound: true,
    cityName: 'Göteborg',
    hasLocalBusinessSchema: false,
    schemaType: null,
  },
}
