/**
 * genericFixes.ts — Hårdkodade generiska "så här fixar du det"-mallar
 *
 * Används i FREE-rapporten för att ge användaren konkreta steg utan att
 * köra en dyr Pro-modell. Skillnad mot Report Writer (paid):
 *   - Generic: steg + kod med <PLACEHOLDERS> som användaren fyller i själv
 *   - Rich (paid): samma struktur men ifylld med företagets faktiska data
 *
 * Båda visas i SolutionCard via samma block ("Så här fixar ni det" + kod-block).
 *
 * Placeholders som används konsekvent:
 *   <FÖRETAGSNAMN>, <TJÄNST>, <STAD>, <TELEFONNUMMER>,
 *   <GATUADRESS>, <POSTNUMMER>, <DOMÄN>, <URL>
 */

import type { CheckKey, CheckResult } from './scanResult'

type Status = CheckResult['status']

export interface GenericFix {
  steps: string                       // numbered markdown
  codeTemplate: string | null         // copy-paste-ready or null when no code applies
}

type FixesByStatus = Partial<Record<Status, GenericFix>>

// ---------------------------------------------------------------------------
// Topp 10 (hög vikt, ofta bad/warning) — skrivna manuellt
// ---------------------------------------------------------------------------

export const GENERIC_FIXES: Partial<Record<CheckKey, FixesByStatus>> = {
  // ---- #1 HTTPS (vikt 3) — bara bad-status (saknas helt) ----
  https: {
    bad: {
      steps:
`1. Logga in hos er webbhotell-leverantör (One.com, Loopia, Binero, Webhotell24 m.fl.).
2. Hitta sektionen "SSL-certifikat" eller "Säkerhet" i kontrollpanelen — de flesta erbjuder gratis Let's Encrypt med ett klick.
3. Aktivera SSL för er huvuddomän och alla underdomäner.
4. Vänta 5–15 minuter på att certifikatet utfärdas.
5. Aktivera "tvinga HTTPS" / "redirect to HTTPS" så att besökare på \`http://\` automatiskt skickas till \`https://\`.
6. Kontrollera att alla länkar internt och i sitemap använder \`https://\`.`,
      codeTemplate: null,
    },
  },

  // ---- #3 AI-crawlers (vikt 4) — bad = viktiga blockerade ----
  aiCrawlers: {
    bad: {
      steps:
`1. Öppna er robots.txt på \`https://<DOMÄN>/robots.txt\`.
2. Leta efter rader som blockerar AI-crawlers (\`Disallow: /\` under \`User-agent: GPTBot\`, \`ClaudeBot\`, \`Google-Extended\`, \`PerplexityBot\` eller \`CCBot\`).
3. Ta bort \`Disallow: /\`-raderna under dessa user-agents, eller ersätt dem med \`Disallow:\` (tom = tillåt allt).
4. Ladda upp den uppdaterade robots.txt via FTP eller ert CMS roten.
5. Verifiera på \`https://<DOMÄN>/robots.txt\` att ändringen syns och att AI-crawlers nu är tillåtna.`,
      codeTemplate:
`# robots.txt — tillåt AI-crawlers så ert företag syns i ChatGPT, Perplexity och Google AI Overview
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://<DOMÄN>/sitemap.xml`,
    },
    warning: {
      steps:
`1. Granska er robots.txt på \`https://<DOMÄN>/robots.txt\`.
2. Säkerställ att inga AI-crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, CCBot) är blockerade.
3. Lägg till explicita \`Allow\`-regler för AI-crawlers — det dokumenterar er intention och förhindrar oavsiktlig blockering.`,
      codeTemplate:
`# Lägg till dessa rader i robots.txt för att explicit tillåta AI-crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /`,
    },
  },

  // ---- #10 CWV (vikt 3) — bad = flera värden över Googles gränser ----
  cwv: {
    bad: {
      steps:
`1. Öppna PageSpeed Insights (\`https://pagespeed.web.dev/\`) och kör en analys av \`<URL>\` på mobil.
2. **LCP > 2,5 s:** komprimera hero-bilder till WebP (\`https://squoosh.app\`), använd \`<img loading="eager" fetchpriority="high">\` på hero-bilden, och preload webbfonter med \`<link rel="preload" as="font">\`.
3. **CLS > 0,1:** sätt explicit \`width\` och \`height\` på alla \`<img>\` och \`<iframe>\`. Reservera utrymme för annonser/embeds med CSS \`aspect-ratio\`.
4. **INP > 200 ms:** minska tunga JavaScript-bibliotek, ladda tredjepartsskript (chatt, analys) med \`async\` eller \`defer\`, och flytta dem under \`</body>\`.
5. Kör om PageSpeed-testet efter varje ändring — målet är grönt på alla tre mått (LCP, CLS, INP).`,
      codeTemplate:
`<!-- 1. Preload hero-bild (i <head>) -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">

<!-- 2. Hero-bilden med explicit storlek (förhindrar layout-shift) -->
<img src="/hero.webp" alt="<BESKRIVNING>" width="1200" height="600" loading="eager" fetchpriority="high">

<!-- 3. Preload viktig webbfont -->
<link rel="preload" as="font" type="font/woff2" href="/fonts/main.woff2" crossorigin>

<!-- 4. Ladda tredjepartsskript icke-blockerande -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>`,
    },
    warning: {
      steps:
`1. Ett av era Core Web Vitals-mått ligger i "behöver förbättras"-zonen — kör PageSpeed Insights på \`<URL>\` för att se exakt vilket.
2. Optimera det specifika måttet: LCP → komprimera hero-bilder + preload, CLS → explicit storlek på bilder, INP → lazy-load tunga skript.
3. Kör om testet — målet är grönt (under Googles "Good"-tröskel).`,
      codeTemplate: null,
    },
  },

  // ---- #14 LocalBusiness-schema (vikt 5) — viktigast av alla ----
  localBusiness: {
    bad: {
      steps:
`1. Identifiera er specifika verksamhetstyp på schema.org/docs/full.html under "LocalBusiness" — t.ex. \`Restaurant\`, \`Plumber\`, \`Dentist\`, \`HairSalon\`, \`AutoRepair\` eller \`AccountingService\`.
2. Kopiera mallen nedan och fyll i alla \`<PLACEHOLDERS>\` med era riktiga uppgifter.
3. Lägg in koden mellan \`<head>\` och \`</head>\` på er startsida — om ni har WordPress: använd ett plugin som "Insert Headers and Footers" eller redigera \`header.php\`.
4. Validera resultatet på \`https://validator.schema.org/\` — klistra in er URL och kontrollera att inga fel rapporteras.
5. Testa även Googles "Rich Results Test" (\`https://search.google.com/test/rich-results\`) — det visar hur Google ser er strukturerade data.`,
      codeTemplate:
`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "<VERKSAMHETSTYP>",
  "name": "<FÖRETAGSNAMN>",
  "image": "https://<DOMÄN>/logo.png",
  "@id": "https://<DOMÄN>/#business",
  "url": "https://<DOMÄN>",
  "telephone": "<TELEFONNUMMER>",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "<GATUADRESS>",
    "addressLocality": "<STAD>",
    "postalCode": "<POSTNUMMER>",
    "addressCountry": "SE"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": <LATITUD>,
    "longitude": <LONGITUD>
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "09:00",
      "closes": "17:00"
    }
  ],
  "sameAs": [
    "https://www.facebook.com/<FACEBOOKSIDA>",
    "https://www.instagram.com/<INSTAGRAMKONTO>"
  ]
}
</script>`,
    },
    warning: {
      steps:
`1. Ert schema markup finns men är inte en specifik LocalBusiness-subtyp — er typ är troligen \`Organization\` eller bara \`LocalBusiness\`.
2. Byt \`@type\` till den mest specifika typen för er bransch (t.ex. \`Restaurant\`, \`Plumber\`, \`Dentist\`).
3. Validera på \`https://validator.schema.org/\` och \`https://search.google.com/test/rich-results\`.`,
      codeTemplate:
`<!-- Byt bara raden för @type i ert existerande schema -->
"@type": "<VERKSAMHETSTYP>",`,
    },
  },

  // ---- #16 NAP-konsistens (vikt 4) — bad = inkonsekvent ----
  napConsistency: {
    bad: {
      steps:
`1. Skriv ner ert **exakta** företagsnamn, adress och telefonnummer i den form ni vill att de alltid ska skrivas. Detta är er NAP-bas.
2. Uppdatera samtliga ställen i denna ordning:
   a) Egen webbplats — footern, kontaktsidan och JSON-LD-schemat i \`<head>\`.
   b) Google Business Profile (\`https://business.google.com\`).
   c) Eniro (\`https://foretag.eniro.se\`) — sök er själva och uppdatera via "Är detta ditt företag?".
   d) Hitta.se (\`https://www.hitta.se/foretag\`) — samma princip.
   e) Facebook-sida, Instagram-bio, LinkedIn-företagssida.
3. Använd **exakt samma** stavning, mellanslag och förkortningar överallt. Skriv inte "AB" på en plats och "Aktiebolag" på en annan.
4. Lägg in NAP synligt i footern på varje sida — gärna inom \`<address>\`-elementet för semantisk korrekthet.`,
      codeTemplate:
`<!-- Lägg detta synligt i footern på alla sidor -->
<address>
  <strong><FÖRETAGSNAMN></strong><br>
  <GATUADRESS><br>
  <POSTNUMMER> <STAD><br>
  Tel: <a href="tel:<TELEFONNUMMER>"><TELEFONNUMMER></a><br>
  E-post: <a href="mailto:<EPOST>"><EPOST></a>
</address>

<!-- Och säkerställ att JSON-LD i <head> innehåller exakt samma värden -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "<VERKSAMHETSTYP>",
  "name": "<FÖRETAGSNAMN>",
  "telephone": "<TELEFONNUMMER>",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "<GATUADRESS>",
    "addressLocality": "<STAD>",
    "postalCode": "<POSTNUMMER>"
  }
}
</script>`,
    },
  },

  // ---- #21 Meta-taggar (vikt 3) — bad = båda saknas, warning = en saknas ----
  metaTags: {
    bad: {
      steps:
`1. Öppna er HTML-källkod (\`Visa källkod\` i webbläsaren) och leta i \`<head>\` efter \`<title>\` och \`<meta name="description">\`.
2. Lägg till båda — title ska vara 50–60 tecken, description 120–160 tecken.
3. Båda ska innehålla: vad ni gör + var ni gör det + er identitet.
4. Varje sida bör ha unika meta-taggar (inte samma på startsida och tjänstesidor).`,
      codeTemplate:
`<head>
  <title><FÖRETAGSNAMN> — <TJÄNST> i <STAD></title>
  <meta name="description" content="<FÖRETAGSNAMN> är <TJÄNST> i <STAD>. Vi erbjuder <KORT BESKRIVNING AV TJÄNSTER>. Boka via <TELEFONNUMMER>.">
</head>`,
    },
    warning: {
      steps:
`1. En av era meta-taggar saknas (title eller meta description).
2. Komplettera den som saknas — title 50–60 tecken, description 120–160 tecken.
3. Säkerställ att båda nämner verksamhet + stad + erbjudande.`,
      codeTemplate:
`<title><FÖRETAGSNAMN> — <TJÄNST> i <STAD></title>
<meta name="description" content="<FÖRETAGSNAMN> erbjuder <TJÄNST> i <STAD>. <KORT VÄRDESÄTT>. Kontakta oss på <TELEFONNUMMER>.">`,
    },
  },

  // ---- #22 FAQ-schema (vikt 4) — bad = saknas, warning = få ----
  faqSchema: {
    bad: {
      steps:
`1. Lista 5–10 vanliga frågor ni faktiskt får från kunder (t.ex. "Hur lång är leveranstiden?", "Tar ni emot betalkort?", "Hur bokar jag?").
2. Lägg in dem som synlig FAQ-sektion på er sajt — gärna på startsidan eller en \`/vanliga-fragor\`-sida.
3. Lägg in JSON-LD med \`@type: FAQPage\` på samma sida. Frågorna och svaren måste matcha exakt det som syns på sidan.
4. Validera på \`https://validator.schema.org/\` och \`https://search.google.com/test/rich-results\`.
5. FAQ-schema är en av de starkaste signalerna för AI-sökmotorer — det är ofta det de citerar direkt i svar.`,
      codeTemplate:
`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "<FRÅGA 1, t.ex. 'Hur bokar jag tid hos er?'>",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "<SVAR 1, 2-4 meningar>"
      }
    },
    {
      "@type": "Question",
      "name": "<FRÅGA 2, t.ex. 'Vilka betalningsmetoder accepterar ni?'>",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "<SVAR 2>"
      }
    },
    {
      "@type": "Question",
      "name": "<FRÅGA 3>",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "<SVAR 3>"
      }
    }
  ]
}
</script>`,
    },
    warning: {
      steps:
`1. Ni har FAQ-schema men för få frågor (1–2). AI-modeller behöver bredd för att kunna citera er.
2. Lägg till minst 5 frågor totalt — fokusera på de mest sökta frågorna inom er bransch i <STAD>.
3. Säkerställ att alla frågor + svar finns synligt på sidan (inte bara i JSON-LD).`,
      codeTemplate:
`<!-- Lägg till fler frågor i den befintliga FAQPage-arrayen -->
{
  "@type": "Question",
  "name": "<NY FRÅGA>",
  "acceptedAnswer": {
    "@type": "Answer",
    "text": "<NYTT SVAR>"
  }
}`,
    },
  },

  // ---- #25 E-A-T-signaler (vikt 4) — bad = få signaler, warning = en del saknas ----
  eatSignals: {
    bad: {
      steps:
`1. **Skapa en "Om oss"-sida** (\`/om-oss\` eller \`/about\`) som beskriver er historia, ert team och era värderingar.
2. **Visa organisationsnumret** synligt — i footern eller på "Om oss"-sidan. För svenska företag är detta en stark trovärdighetssignal.
3. **Namnge nyckelpersoner** med titlar och kort bakgrund (kock, ägare, verksamhetschef). Lägg till \`Person\`-schema för varje.
4. **Visa certifieringar** — branschorganisationer, miljömärkningar, utbildningsbevis. Lägg in logotyper med alt-text.
5. **Länka till externa profiler** (LinkedIn, branschföreningar) via \`sameAs\` i schema markup.
6. E-A-T (Expertise, Authoritativeness, Trustworthiness) är avgörande för att AI-modeller ska lita på er som källa.`,
      codeTemplate:
`<!-- 1. Organisationsnummer i footern -->
<footer>
  <p>Org.nr: <ORGNUMMER> · <FÖRETAGSNAMN></p>
</footer>

<!-- 2. Person-schema för nyckelpersoner -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "<PERSONNAMN>",
  "jobTitle": "<TITEL, t.ex. 'Verksamhetschef' eller 'Köksmästare'>",
  "worksFor": {
    "@type": "<VERKSAMHETSTYP>",
    "name": "<FÖRETAGSNAMN>"
  },
  "sameAs": [
    "https://www.linkedin.com/in/<LINKEDIN-PROFIL>"
  ]
}
</script>`,
    },
    warning: {
      steps:
`1. Ni har en del E-A-T-signaler men det saknas några viktiga.
2. Komplettera de som saknas (se er finding-text för exakt vilka).
3. Vanligast att lägga till: organisationsnummer i footern, namngivna nyckelpersoner med titlar, certifieringar/medlemskap i branschorganisationer.`,
      codeTemplate: null,
    },
  },

  // ---- #28 Title-tagg (vikt 3) — bad = saknas, warning = för kort/lång ----
  title: {
    bad: {
      steps:
`1. Öppna er sidmall (header.php i WordPress, eller motsvarande) och lägg till \`<title>\` i \`<head>\`.
2. Skriv 50–60 tecken som innehåller: företagsnamn + tjänst + stad.
3. Varje sida bör ha en unik title — startsida, tjänstesidor, kontakt.
4. Använd Googles "Rich Results Test" (\`https://search.google.com/test/rich-results\`) för att kontrollera hur er title visas i sökresultaten.`,
      codeTemplate:
`<head>
  <title><FÖRETAGSNAMN> — <TJÄNST> i <STAD></title>
</head>`,
    },
    warning: {
      steps:
`1. Er title finns men är inte optimal — för kort, för lång eller saknar nyckelord.
2. Skriv om till 50–60 tecken med formeln: \`<FÖRETAGSNAMN> — <TJÄNST> i <STAD>\` eller liknande.
3. Säkerställ att stadens namn finns med — det är avgörande för lokala AI-sökningar.`,
      codeTemplate:
`<!-- Byt ut innehållet i <title> -->
<title><FÖRETAGSNAMN> — <TJÄNST> i <STAD></title>`,
    },
  },

  // ---- #29 Metabeskrivning (vikt 3) — bad = saknas, warning = för kort/lång ----
  metaDescription: {
    bad: {
      steps:
`1. Öppna er sidmall och lägg till \`<meta name="description">\` i \`<head>\`.
2. Skriv 120–160 tecken som svarar på: vad ni gör, var ni gör det, vad som gör er unika.
3. Inkludera ett tydligt anrop till handling — t.ex. "Boka via <TELEFONNUMMER>" eller "Beställ online".
4. Varje sida bör ha unik meta-beskrivning som matchar sidans innehåll.`,
      codeTemplate:
`<head>
  <meta name="description" content="<FÖRETAGSNAMN> är <TJÄNST> i <STAD>. Vi erbjuder <KORT BESKRIVNING AV TJÄNSTER>. Boka på <TELEFONNUMMER>.">
</head>`,
    },
    warning: {
      steps:
`1. Er meta-beskrivning finns men är för kort (<80 tecken) eller för lång (>180 tecken).
2. Mål: 120–160 tecken. För kort → Google fyller på med slumpvis text. För lång → Google trunkerar med "...".
3. Säkerställ att de första 120 tecknen innehåller verksamhet + stad + viktigaste fördelen.`,
      codeTemplate:
`<!-- Justera content-attributet till 120-160 tecken -->
<meta name="description" content="<FÖRETAGSNAMN> är <TJÄNST> i <STAD>. <KORT VÄRDESÄTT>. Boka på <TELEFONNUMMER>.">`,
    },
  },
}

// ---------------------------------------------------------------------------
// Resterande 19 free-tier checks
// ---------------------------------------------------------------------------

// #2 Robots.txt — bad = saknas helt, warning = finns men saknar sitemap
GENERIC_FIXES.robotsTxt = {
  bad: {
    steps:
`1. Skapa en textfil med namnet \`robots.txt\` med innehållet nedan (anpassa Disallow-rader om ni har sektioner som inte ska indexeras).
2. Ladda upp filen till webbplatsens rot — den ska vara åtkomlig på \`https://<DOMÄN>/robots.txt\`.
3. Lägg till \`Sitemap:\`-raden så crawlers hittar er sitemap.
4. Verifiera genom att besöka \`https://<DOMÄN>/robots.txt\` i webbläsaren.`,
    codeTemplate:
`User-agent: *
Allow: /
Disallow: /wp-admin/
Disallow: /admin/

Sitemap: https://<DOMÄN>/sitemap.xml`,
  },
  warning: {
    steps:
`1. Er robots.txt finns men saknar antingen \`Sitemap:\`-raden eller har för restriktiva regler.
2. Lägg till \`Sitemap: https://<DOMÄN>/sitemap.xml\` i slutet av filen.
3. Granska \`Disallow\`-rader — blockera bara verkliga admin-sektioner, inte hela sajten.`,
    codeTemplate:
`# Lägg till denna rad i robots.txt
Sitemap: https://<DOMÄN>/sitemap.xml`,
  },
}

// #4 Sitemap.xml — bad = saknas, warning = finns men få URL:er
GENERIC_FIXES.sitemap = {
  bad: {
    steps:
`1. Om ni har WordPress: installera ett SEO-plugin (Yoast SEO, RankMath eller All in One SEO) — de genererar sitemap automatiskt på \`https://<DOMÄN>/sitemap.xml\`.
2. Om ni inte har WordPress: skapa en sitemap.xml manuellt med koden nedan eller använd en gratis tjänst som \`https://www.xml-sitemaps.com\`.
3. Lägg sitemap.xml i webbplatsens rot.
4. Lägg till \`Sitemap: https://<DOMÄN>/sitemap.xml\` i er robots.txt.
5. Skicka in sitemap till Google Search Console (\`https://search.google.com/search-console\`).`,
    codeTemplate:
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://<DOMÄN>/</loc>
    <lastmod>2026-01-01</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://<DOMÄN>/om-oss</loc>
    <lastmod>2026-01-01</lastmod>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://<DOMÄN>/tjanster</loc>
    <lastmod>2026-01-01</lastmod>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://<DOMÄN>/kontakt</loc>
    <lastmod>2026-01-01</lastmod>
    <priority>0.7</priority>
  </url>
</urlset>`,
  },
  warning: {
    steps:
`1. Er sitemap finns men innehåller få URL:er — den når inte alla undersidor.
2. Om ni har WordPress: kontrollera att ert SEO-plugin (Yoast/RankMath) inkluderar alla sidtyper (sidor, inlägg, kategorier).
3. Om manuell sitemap: lägg till alla aktiva sidor, även tjänstesidor och blogginlägg.
4. Skicka in den uppdaterade sitemap till Google Search Console.`,
    codeTemplate: null,
  },
}

// #5 llms.txt — bad = saknas, warning = finns men tunn
GENERIC_FIXES.llmsTxt = {
  bad: {
    steps:
`1. Skapa en textfil med namnet \`llms.txt\` i webbplatsens rot — den fungerar som "robots.txt för AI-modeller".
2. Strukturera innehållet enligt mallen: H1 med företagsnamn, kort summering, sedan länkar till viktiga sidor med beskrivningar.
3. Ladda upp filen så den är åtkomlig på \`https://<DOMÄN>/llms.txt\`.
4. Filen ska vara ren markdown, max 50 KB. AI-modeller läser den för att förstå er sajt utan att crawla varje sida.
5. Mer info: \`https://llmstxt.org\`.`,
    codeTemplate:
`# <FÖRETAGSNAMN>

> <FÖRETAGSNAMN> är <TJÄNST> i <STAD>. Vi erbjuder <KORT BESKRIVNING AV ERBJUDANDE>.

Kontakt: <TELEFONNUMMER> · <EPOST> · <GATUADRESS>, <POSTNUMMER> <STAD>

## Tjänster

- [Tjänst 1](https://<DOMÄN>/tjanst-1): <KORT BESKRIVNING>
- [Tjänst 2](https://<DOMÄN>/tjanst-2): <KORT BESKRIVNING>
- [Tjänst 3](https://<DOMÄN>/tjanst-3): <KORT BESKRIVNING>

## Information

- [Om oss](https://<DOMÄN>/om-oss): Vår historia och vårt team
- [Vanliga frågor](https://<DOMÄN>/faq): Svar på de vanligaste frågorna
- [Kontakt](https://<DOMÄN>/kontakt): Öppettider, telefon, adress

## Optional

- [Blogg](https://<DOMÄN>/blogg): Branschnyheter och guider`,
  },
  warning: {
    steps:
`1. Er llms.txt finns men saknar viktigt innehåll (tjänster, om oss, kontakt).
2. Komplettera filen med länkar till de viktigaste undersidorna inom \`## Tjänster\` och \`## Information\`.
3. Lägg till en kort \`> blockquote\`-summering högst upp som beskriver vad företaget gör.`,
    codeTemplate: null,
  },
}

// #6 Canonical-tagg — bad = saknas
GENERIC_FIXES.canonical = {
  bad: {
    steps:
`1. Lägg till en \`<link rel="canonical">\`-tagg i \`<head>\` på varje sida.
2. \`href\` ska peka på den definitiva URL:en för sidan — utan trailing slash, utan query-parametrar (om inte de är meningsbärande).
3. Om ni har WordPress: SEO-plugins (Yoast, RankMath) gör detta automatiskt.
4. Manuellt: använd absoluta URL:er (\`https://<DOMÄN>/sida\`), inte relativa.
5. Validera med Googles "Rich Results Test" att canonical syns.`,
    codeTemplate:
`<head>
  <link rel="canonical" href="https://<DOMÄN>/<SIDANS-SLUG>">
</head>`,
  },
}

// #7 Open Graph-taggar — bad = alla saknas, warning = någon saknas
GENERIC_FIXES.ogTags = {
  bad: {
    steps:
`1. Lägg till de tre Open Graph-taggarna (\`og:title\`, \`og:description\`, \`og:image\`) i \`<head>\`.
2. \`og:image\` ska vara minst 1200×630 px (Facebooks rekommendation) — gärna en kvalitativ bild av er produkt, lokal eller logotyp på bakgrund.
3. \`og:title\` får vara längre än \`<title>\` — upp till 90 tecken.
4. Validera på Facebooks "Sharing Debugger" (\`https://developers.facebook.com/tools/debug/\`) och Twitters "Card Validator".`,
    codeTemplate:
`<head>
  <meta property="og:title" content="<FÖRETAGSNAMN> — <TJÄNST> i <STAD>">
  <meta property="og:description" content="<KORT BESKRIVNING — vad ni erbjuder + var + unikt värde>">
  <meta property="og:image" content="https://<DOMÄN>/og-image.jpg">
  <meta property="og:url" content="https://<DOMÄN>/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="sv_SE">
</head>`,
  },
  warning: {
    steps:
`1. Någon eller några av era Open Graph-taggar saknas (titel, beskrivning eller bild).
2. Komplettera de som saknas — särskilt \`og:image\` är viktig för delningar på sociala medier och AI-chattar.
3. Säkerställ att \`og:image\` är minst 1200×630 px.`,
    codeTemplate:
`<!-- Lägg till de som saknas -->
<meta property="og:image" content="https://<DOMÄN>/og-image.jpg">
<meta property="og:description" content="<KORT BESKRIVNING>">`,
  },
}

// #11 Telefonnummer — bad = saknas synligt
GENERIC_FIXES.phone = {
  bad: {
    steps:
`1. Lägg till ert telefonnummer synligt på startsidan och i footern på alla sidor.
2. Använd ett klickbart \`tel:\`-länk så besökare på mobil kan ringa direkt.
3. Skriv numret i internationellt format: \`+46 31 220 30 05\` eller nationellt med bindestreck: \`031-220 30 05\`.
4. Lägg också in numret i ert JSON-LD-schema (LocalBusiness-fältet \`telephone\`).
5. Undvik att visa telefonnumret som bild eller inuti JavaScript — AI-crawlers kan inte läsa sådant.`,
    codeTemplate:
`<!-- I footern eller header -->
<a href="tel:<TELEFONNUMMER>" class="phone-link">
  <TELEFONNUMMER>
</a>

<!-- I JSON-LD-schemat -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "<VERKSAMHETSTYP>",
  "telephone": "<TELEFONNUMMER>"
}
</script>`,
  },
}

// #12 Stad nämns — bad = ingen stad i sidans text
GENERIC_FIXES.cityMentioned = {
  bad: {
    steps:
`1. Lägg till stadens namn i flera nyckelplatser:
   - \`<title>\`-taggen ("<FÖRETAGSNAMN> — <TJÄNST> i <STAD>")
   - \`<h1>\` på startsidan
   - \`<meta name="description">\`
   - Brödtext på startsidan (minst 2 gånger)
   - \`<footer>\` med fullständig adress
2. Använd staden i naturlig fras — inte bara som lista. "<TJÄNST> i <STAD>" är bättre än bara "<STAD>".
3. Om ni servar flera städer: skapa separata landningssidor per stad (\`/<TJÄNST>-<STAD>\`).`,
    codeTemplate:
`<title><FÖRETAGSNAMN> — <TJÄNST> i <STAD></title>
<meta name="description" content="<FÖRETAGSNAMN> är <TJÄNST> i <STAD>. <ERBJUDANDE>.">

<h1><TJÄNST> i <STAD> — <FÖRETAGSNAMN></h1>
<p>Vi är <TJÄNST> baserade i <STAD> och har <ANTAL> års erfarenhet av <SPECIALITET>.</p>`,
  },
}

// #13 Google Maps — bad = ingen embed hittad
GENERIC_FIXES.googleMaps = {
  bad: {
    steps:
`1. Gå till \`https://www.google.com/maps\` och sök upp er adress.
2. Klicka på "Dela" → "Bädda in en karta" → välj storlek "Medel" → kopiera iframe-koden.
3. Klistra in koden på er kontaktsida — gärna under adressen i ett \`<section>\`-block.
4. Säkerställ att kartan länkar till er Google Business Profile (via "Visa större karta"-länken).
5. Detta stärker lokala signaler — Google validerar att er angivna adress matchar kartdatan.`,
    codeTemplate:
`<!-- Klistra in på kontaktsidan, mellan adress och kontaktformulär -->
<section aria-label="Hitta hit">
  <iframe
    src="https://www.google.com/maps/embed?pb=<DIN-EMBED-KOD-HÄR>"
    width="600"
    height="450"
    style="border:0"
    allowfullscreen=""
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
    title="Karta till <FÖRETAGSNAMN> i <STAD>">
  </iframe>
</section>`,
  },
}

// #15 Katalogregistrering — bad = saknas på flera, warning = saknas på någon
GENERIC_FIXES.directories = {
  bad: {
    steps:
`1. **Eniro** (\`https://foretag.eniro.se\`): sök er själva → "Är detta ditt företag?" → skapa konto och uppdatera uppgifter.
2. **Hitta.se** (\`https://www.hitta.se/foretag\`): samma princip — registrera er om ni inte finns.
3. **Google Business Profile** (\`https://business.google.com\`): grundläggande, oftast viktigast av alla.
4. Använd **exakt samma** företagsnamn, adress och telefonnummer i alla kataloger som på er egen webbplats (NAP-konsistens).
5. Lägg in länkar till era profiler i JSON-LD-schemats \`sameAs\`-array.`,
    codeTemplate:
`<!-- Lägg till sameAs-länkar i ert LocalBusiness-schema -->
"sameAs": [
  "https://foretag.eniro.se/<FÖRETAGS-SLUG>",
  "https://www.hitta.se/<FÖRETAGS-SLUG>",
  "https://business.google.com/<GBP-ID>",
  "https://www.facebook.com/<FACEBOOK-SIDA>",
  "https://www.instagram.com/<INSTAGRAM-KONTO>"
]`,
  },
  warning: {
    steps:
`1. Ni saknas i någon viktig katalog (vanligen Eniro eller Hitta.se).
2. Registrera er hos den som saknas — länkarna ovan.
3. Säkerställ att uppgifterna matchar er egen sajt exakt (samma stavning, format, mellanslag).`,
    codeTemplate: null,
  },
}

// #17 Öppettider — bad = saknas i strukturerad data
GENERIC_FIXES.openingHours = {
  bad: {
    steps:
`1. **Google Business Profile** är primär källa — logga in på \`https://business.google.com\` och lägg in öppettider där.
2. Lägg också in öppettider synligt på er kontaktsida.
3. Lägg till \`openingHoursSpecification\` i ert LocalBusiness-schema så AI-modeller kan läsa dem maskinellt.
4. Använd ISO-tidsformat (\`09:00\`, inte \`9\`). Stängda dagar utelämnas eller markeras explicit.
5. Glöm inte att uppdatera vid helgdagar — Google Business Profile har särskilda "speciella öppettider".`,
    codeTemplate:
`<!-- I LocalBusiness JSON-LD -->
"openingHoursSpecification": [
  {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "opens": "09:00",
    "closes": "17:00"
  },
  {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": "Saturday",
    "opens": "10:00",
    "closes": "14:00"
  }
]`,
  },
}

// #18 Schema markup (någon typ) — bad = inget schema alls
GENERIC_FIXES.schemaAny = {
  bad: {
    steps:
`1. Schema markup är strukturerad data som hjälper sökmotorer och AI-modeller förstå er sajt maskinellt.
2. Börja med minst \`Organization\` eller \`LocalBusiness\`-schema i \`<head>\` på startsidan.
3. Använd JSON-LD-format (rekommenderat av Google), inte microdata eller RDFa.
4. Validera på \`https://validator.schema.org/\` efter implementation.
5. För specifika rekommendationer per bransch: se \`#14 LocalBusiness-schema\`-fixen.`,
    codeTemplate:
`<!-- Minst Organization-schema som första steg -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "<FÖRETAGSNAMN>",
  "url": "https://<DOMÄN>",
  "logo": "https://<DOMÄN>/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "<TELEFONNUMMER>",
    "contactType": "customer service",
    "areaServed": "SE",
    "availableLanguage": ["Swedish"]
  }
}
</script>`,
  },
}

// #19 LocalBusiness-subtyp — bad = ingen specifik subtyp
GENERIC_FIXES.localSubtype = {
  bad: {
    steps:
`1. Schema.org har specifika underkategorier för olika branscher — använd den mest exakta.
2. Vanliga svenska exempel:
   - Restaurang → \`Restaurant\`, \`Cafe\`, \`Bakery\`, \`Bar\`
   - Hantverkare → \`Plumber\`, \`Electrician\`, \`Painter\`, \`HVACBusiness\`
   - Vård → \`Dentist\`, \`Physician\`, \`MedicalBusiness\`
   - Skönhet → \`HairSalon\`, \`BeautySalon\`, \`NailSalon\`
   - Bil → \`AutoRepair\`, \`CarDealer\`, \`AutoBodyShop\`
3. Byt \`@type\` i ert existerande schema till den specifika typen.
4. Komplett lista: \`https://schema.org/docs/full.html\` under "LocalBusiness".`,
    codeTemplate:
`<!-- Byt ut "LocalBusiness" eller "Organization" mot rätt subtyp -->
"@type": "<VERKSAMHETSTYP>",`,
  },
}

// #20 JSON-LD format — bad = inga JSON-LD-block
GENERIC_FIXES.jsonLd = {
  bad: {
    steps:
`1. JSON-LD är det format Google och AI-tjänster föredrar för strukturerad data — lättare att implementera och tolka än microdata/RDFa.
2. Lägg in JSON-LD som \`<script type="application/ld+json">\`-block i \`<head>\` (eller före \`</body>\`).
3. Börja med minst \`Organization\` eller \`LocalBusiness\` på startsidan — se \`#14 LocalBusiness-schema\` för mall.
4. Lägg på fler scheman per sidtyp: \`Product\` för produktsidor, \`Article\` för bloggar, \`FAQPage\` för FAQ-sidor.
5. Validera på \`https://validator.schema.org/\`.`,
    codeTemplate:
`<!-- Grundläggande JSON-LD i <head> -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "<VERKSAMHETSTYP>",
  "name": "<FÖRETAGSNAMN>",
  "url": "https://<DOMÄN>",
  "telephone": "<TELEFONNUMMER>",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "<GATUADRESS>",
    "addressLocality": "<STAD>",
    "postalCode": "<POSTNUMMER>",
    "addressCountry": "SE"
  }
}
</script>`,
  },
}

// #23 Innehållsdjup — bad = för få sidor / inget djup
GENERIC_FIXES.contentDepth = {
  bad: {
    steps:
`1. AI-modeller behöver "läsmaterial" om er bransch och era tjänster för att kunna citera er som källa.
2. Skapa **dedikerade tjänstesidor** — en sida per tjänst, inte alla tjänster på startsidan. Minst 500 ord per sida.
3. Skapa en **blogg eller guidesektion** med 5–10 artiklar som svarar på vanliga branschfrågor (t.ex. "Hur ofta bör man rengöra X?", "Vad kostar Y i <STAD>?").
4. Strukturera innehållet med tydliga \`<h2>\` och \`<h3>\` — AI-modeller följer rubrikhierarkin.
5. Inkludera relevanta sökord naturligt, fokus på lokala fraser ("<TJÄNST> i <STAD>", "bästa <TJÄNST> <STAD>").`,
    codeTemplate: null,
  },
  warning: {
    steps:
`1. Ni har innehåll men det räcker inte för att bli en stark AI-källa.
2. Lägg till 3–5 nya tjänstesidor eller blogginlägg under nästa kvartal.
3. Fokusera på frågor era kunder faktiskt ställer — använd Google Search Console eller AnswerThePublic för idéer.`,
    codeTemplate: null,
  },
}

// #26 Semantisk HTML — bad = inga semantiska element, warning = något saknas
GENERIC_FIXES.semanticHtml = {
  bad: {
    steps:
`1. Byt ut generiska \`<div>\`-element mot semantiska HTML5-element så AI-crawlers och skärmläsare förstår sidans struktur.
2. Använd \`<header>\` för sidhuvudet, \`<nav>\` för menyn, \`<main>\` för huvudinnehållet, \`<footer>\` för sidfoten.
3. Använd \`<article>\` för fristående innehåll (blogginlägg, produktbeskrivning) och \`<section>\` för tematiska sektioner inom en sida.
4. Sätt \`lang="sv"\` på \`<html>\`-elementet så det är tydligt att sidan är på svenska.`,
    codeTemplate:
`<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <title><FÖRETAGSNAMN> — <TJÄNST> i <STAD></title>
</head>
<body>
  <header>
    <nav>
      <a href="/">Hem</a>
      <a href="/tjanster">Tjänster</a>
      <a href="/kontakt">Kontakt</a>
    </nav>
  </header>

  <main>
    <article>
      <h1><TJÄNST> i <STAD></h1>
      <section>
        <h2>Våra tjänster</h2>
        <p>...</p>
      </section>
    </article>
  </main>

  <footer>
    <address>
      <FÖRETAGSNAMN><br>
      <GATUADRESS>, <POSTNUMMER> <STAD>
    </address>
  </footer>
</body>
</html>`,
  },
  warning: {
    steps:
`1. Ni har vissa semantiska element men det saknas några viktiga (\`<main>\`, \`<nav>\` eller \`<article>\`).
2. Komplettera de som saknas — se er finding-text för specifika rekommendationer.
3. Strukturen ovan är minimum för en välbyggd HTML5-sida.`,
    codeTemplate: null,
  },
}

// #27 H1-rubrik — bad = saknas helt
GENERIC_FIXES.h1 = {
  bad: {
    steps:
`1. Varje sida ska ha **exakt en** \`<h1>\`-rubrik — det är den viktigaste rubriken för AI-modeller och skärmläsare.
2. Skriv en H1 som innehåller: vad ni gör + var ni gör det + er identitet.
3. Placera H1 högst upp i \`<main>\`, innan annat innehåll.
4. Varje undersida bör ha unik H1 (inte samma som startsidan).
5. Undvik H1 som bild eller logotyp — AI kan inte läsa det.`,
    codeTemplate:
`<main>
  <h1><TJÄNST> i <STAD> — <FÖRETAGSNAMN></h1>
  <p>Korta säljande underrubrik som beskriver vad ni erbjuder och vad som gör er unika.</p>
</main>`,
  },
}

// #30 Kontaktinfo — bad = ingen synlig kontaktinfo
GENERIC_FIXES.contactInfo = {
  bad: {
    steps:
`1. Lägg in fullständig kontaktinformation synligt på varje sida — i footern och på en dedikerad kontaktsida.
2. Innehåll: företagsnamn, fullständig adress, telefon, e-post, eventuellt organisationsnummer.
3. Använd semantiska \`<address>\`-elementet för att markera kontaktblocket.
4. Gör telefon och e-post klickbara med \`tel:\` och \`mailto:\`-länkar.
5. Lägg också in samma uppgifter i ert LocalBusiness JSON-LD-schema.`,
    codeTemplate:
`<footer>
  <address>
    <strong><FÖRETAGSNAMN></strong><br>
    <GATUADRESS><br>
    <POSTNUMMER> <STAD><br>
    Tel: <a href="tel:<TELEFONNUMMER>"><TELEFONNUMMER></a><br>
    E-post: <a href="mailto:<EPOST>"><EPOST></a><br>
    Org.nr: <ORGNUMMER>
  </address>
</footer>`,
  },
}

// #31 Alt-texter — bad = <50%, warning = 50-80%
GENERIC_FIXES.altTexts = {
  bad: {
    steps:
`1. Gå igenom alla bilder på sajten och lägg till \`alt\`-attribut på \`<img>\`-taggarna.
2. Alt-texten ska beskriva bildens **innehåll**, inte att det är en bild ("Köksmästaren tillagar pasta" — inte "bild av kock").
3. Dekorativa bilder utan informationsvärde: använd tomt alt (\`alt=""\`) för att markera som dekorativ.
4. Logotyper: använd företagsnamnet som alt-text.
5. Om ni har WordPress: alt-text fylls i Mediabiblioteket — gå igenom era befintliga bilder.`,
    codeTemplate:
`<!-- Innehållsbärande bild -->
<img src="/restaurang-interior.jpg" alt="Matsalen på <FÖRETAGSNAMN> med vita dukar och stort fönster mot <GATA>">

<!-- Logotyp -->
<img src="/logo.png" alt="<FÖRETAGSNAMN>">

<!-- Dekorativ bild (utan informationsvärde) -->
<img src="/divider.png" alt="">`,
  },
  warning: {
    steps:
`1. En del bilder saknar alt-text — gå igenom de som har bra alt-text och kopiera tonen till de som saknar.
2. Mål: alla informationsbärande bilder ska ha beskrivande alt-text. Dekorativa bilder får \`alt=""\`.
3. Om ni har WordPress: filtrera mediabiblioteket på "saknar alt-text".`,
    codeTemplate:
`<img src="/<bildfil>" alt="<BESKRIVNING AV VAD BILDEN VISAR — inte 'bild av X', utan 'X som gör Y'>">`,
  },
}

// #32 Internlänkning — bad = för få interna länkar, warning = något saknas
GENERIC_FIXES.internalLinks = {
  bad: {
    steps:
`1. Skapa en tydlig huvudnavigation som länkar till de viktigaste undersidorna: \`Tjänster\`, \`Om oss\`, \`Kontakt\`.
2. Länka från startsidan till **alla tjänstesidor** — inte bara "Läs mer om våra tjänster" utan direktlänkar till varje tjänst.
3. Lägg till "brödsmulor" (breadcrumbs) på undersidor: \`Hem > Tjänster > <Tjänstenamn>\`.
4. På varje sida: länka relaterat innehåll i brödtext eller via "Relaterade tjänster"-block.
5. AI-modeller följer interna länkar för att förstå sajtens struktur — bristfällig internlänkning betyder att djupare sidor inte indexeras.`,
    codeTemplate:
`<!-- Navigation i header -->
<nav>
  <a href="/">Hem</a>
  <a href="/tjanster">Tjänster</a>
  <a href="/om-oss">Om oss</a>
  <a href="/kontakt">Kontakt</a>
</nav>

<!-- Brödsmulor på undersidor -->
<nav aria-label="Brödsmulor">
  <ol>
    <li><a href="/">Hem</a></li>
    <li><a href="/tjanster">Tjänster</a></li>
    <li aria-current="page"><TJÄNSTENAMN></li>
  </ol>
</nav>

<!-- Brödsmule-schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Hem", "item": "https://<DOMÄN>" },
    { "@type": "ListItem", "position": 2, "name": "Tjänster", "item": "https://<DOMÄN>/tjanster" },
    { "@type": "ListItem", "position": 3, "name": "<TJÄNSTENAMN>" }
  ]
}
</script>`,
  },
  warning: {
    steps:
`1. Ni har internlänkning men viktiga sidor saknar länkar (vanligen Kontakt, Om oss eller Tjänster).
2. Säkerställ att huvudnavigationen länkar till alla nyckelsidor.
3. Lägg till brödsmulor på undersidor om de saknas.`,
    codeTemplate: null,
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getGenericFix(key: CheckKey, status: Status): GenericFix | null {
  return GENERIC_FIXES[key]?.[status] ?? null
}
