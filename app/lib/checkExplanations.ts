/**
 * checkExplanations.ts — Hårdkodade "Vad är detta?"-texter för alla checks
 *
 * Används i SolutionCard för att ge användaren en generell förklaring
 * av varje koncept (samma för alla företag).
 */

import type { CheckKey } from './scanResult'

export const CHECK_EXPLANATIONS: Partial<Record<CheckKey, string>> = {
  https: 'HTTPS innebär att trafiken mellan besökaren och webbplatsen är krypterad. Sökmotorer och AI-tjänster nedprioriterar osäkra sajter, och webbläsare visar varningar för sidor utan HTTPS.',

  robotsTxt: 'Robots.txt är en fil i roten av din webbplats som styr vilka sökmotorer och AI-crawlers som får indexera ditt innehåll. Utan den kan viktiga crawlers missa din sajt — eller blockeras av misstag.',

  aiCrawlers: 'AI-crawlers som GPTBot (OpenAI), ClaudeBot (Anthropic) och Google-Extended samlar information som AI-sökmotorer använder för att svara på frågor. Om dessa blockeras i robots.txt syns ditt företag inte i AI-genererade svar.',

  sitemap: 'Sitemap.xml är en maskinläsbar karta över alla sidor på din webbplats. Den hjälper sökmotorer och AI-crawlers att hitta och indexera allt innehåll — särskilt sidor som inte är länkade direkt från startsidan.',

  llmsTxt: 'llms.txt är en ny standardfil (liknande robots.txt) som talar om för AI-modeller hur de ska förstå din webbplats. Den ger AI:n en sammanfattning av vad företaget gör, vilka tjänster ni erbjuder och hur informationen är organiserad.',

  canonical: 'En canonical-tagg talar om för sökmotorer vilken version av en sida som är "originalet" när samma innehåll finns på flera URL:er. Utan den kan AI-motorer bli förvirrade av dubbletter och missa viktig information.',

  ogTags: 'Open Graph-taggar (og:title, og:description, og:image) styr hur din sida visas när den delas på sociala medier och i AI-chattar. De ger AI-motorer en tydlig sammanfattning av sidans innehåll.',

  socialPresence: 'Social närvaro via sameAs-länkar i schema.org berättar för AI-motorer vilka sociala profiler som tillhör ditt företag. Det stärker er digitala identitet och hjälper AI att verifiera att ni är ett legitimt företag.',

  hreflang: 'Hreflang-taggar berättar för sökmotorer och AI-tjänster att en sida finns på flera språk och vilken version som ska visas för vilka användare. Relevant om sajten har innehåll på mer än ett språk.',

  cwv: 'Core Web Vitals mäter hur snabbt och stabilt din sajt laddar. Långsamma sajter straffas i Google-ranking och kan ge sämre upplevelse för AI-crawlers som indexerar innehåll.',

  phone: 'Ett synligt telefonnummer på webbplatsen hjälper AI-sökmotorer att bekräfta att företaget är riktigt och lokalt. Det används också direkt i AI-svar som "ring X för att boka".',

  cityMentioned: 'När stadens namn nämns tydligt på sidan kan AI-sökmotorer koppla ditt företag till en specifik plats. Det är avgörande för att dyka upp i lokala AI-svar som "bästa X i [stad]".',

  googleMaps: 'En Google Maps-inbäddning bekräftar din fysiska plats visuellt och stärker lokala signaler. AI-motorer som Google AI Overview kan använda kartdata för att validera din adress.',

  localBusiness: 'LocalBusiness-schema är strukturerad data som berättar för sökmotorer att du är ett lokalt företag — med namn, adress, telefon, öppettider och bransch. Det är grunden för att synas i AI-sökresultat för lokala frågor.',

  directories: 'Att finnas på katalogsajter som Eniro och Hitta.se stärker din trovärdighet i AI-sökmotorers ögon. Varje katalogregistrering fungerar som en "röst" för att ditt företag existerar och är pålitligt.',

  napConsistency: 'NAP-konsistens innebär att ert namn, adress och telefonnummer är identiskt överallt på nätet. Om uppgifterna skiljer sig mellan sajter blir AI-motorer osäkra på vilken information som stämmer.',

  openingHours: 'Öppettider i strukturerad data (JSON-LD) gör det möjligt för AI-sökmotorer att ge exakta svar som "Är X öppet nu?" utan att behöva tolka fritext på webbsidan.',

  schemaAny: 'Schema.org-markup är strukturerad data som hjälper sökmotorer och AI att förstå innehållet maskinellt. Utan det måste AI:n gissa sig till vad sidan handlar om baserat på fritext.',

  localSubtype: 'En specifik LocalBusiness-subtyp (t.ex. Restaurant, Dentist, RealEstateAgent) ger AI-motorer exakt information om vilken typ av företag ni är. Det ökar chansen att dyka upp i branschspecifika AI-svar.',

  jsonLd: 'JSON-LD är det format Google och AI-tjänster föredrar för strukturerad data. Det är lättare att implementera och tolka korrekt än äldre format som Microdata eller RDFa.',

  metaTags: 'Meta-taggar (title och description) är det första AI-motorer och sökmotorer ser. En välskriven title och description ökar chansen att ert innehåll används i AI-genererade svar.',

  faqSchema: 'FAQ-schema (FAQPage) är strukturerad data som talar om för sökmotorer att din sida innehåller vanliga frågor och svar. AI-sökmotorer som ChatGPT och Perplexity använder detta för att ge direkta svar från din webbplats.',

  contentDepth: 'Innehållsdjup mäter mängden och kvaliteten på information på sajten. AI-motorer föredrar sajter med djupgående, informativt innehåll framför tunna sidor med minimal text.',

  serviceSchema: 'Service/Product-schema berättar för AI-motorer exakt vilka tjänster eller produkter ni erbjuder, med pris, beskrivning och tillgänglighet. Det gör att AI kan rekommendera er för specifika behov.',

  eatSignals: 'E-A-T (Experience, Authoritativeness, Trustworthiness) är signaler som visar att ert företag är trovärdigt och kompetent. Om oss-sida, organisationsnummer, certifieringar och namngivna personer stärker dessa signaler.',

  semanticHtml: 'Semantisk HTML (header, nav, main, article, section) hjälper AI-motorer att förstå sidans struktur och vad som är huvudinnehåll vs navigation. Det förbättrar hur AI tolkar och citerar ert innehåll.',

  h1: 'H1-rubriken är sidans huvudrubrik och talar om för AI-motorer vad sidan handlar om. En tydlig, beskrivande H1 ökar chansen att innehållet används korrekt i AI-svar.',

  title: 'Title-taggen är det viktigaste enskilda SEO-elementet. Den syns i sökresultat, webbläsarflikar och AI-svar. En bra title är unik, beskrivande och innehåller relevanta nyckelord.',

  metaDescription: 'Metabeskrivningen syns som förhandsvisning i sökresultat och används av AI-motorer som kort sammanfattning av sidans innehåll. En välskriven metabeskrivning ökar klickfrekvensen och AI-relevansen.',

  contactInfo: 'Synlig kontaktinformation (telefon, e-post, adress) bekräftar att företaget är legitimt. AI-motorer kan extrahera dessa uppgifter direkt och presentera dem i svar.',

  altTexts: 'Alt-texter på bilder beskriver vad bilden föreställer. AI-motorer kan inte "se" bilder — de förlitar sig på alt-texter för att förstå visuellt innehåll och inkludera det i sina svar.',

  internalLinks: 'Internlänkning hjälper AI-crawlers att navigera mellan relaterade sidor och förstå hur sajten hänger ihop. God internlänkning gör att mer av ert innehåll indexeras och används i AI-svar.',

  aiMentions: 'AI-omnämnandetest kontrollerar om AI-modeller (som GPT-4) redan känner till ert företag och nämner er spontant vid branschrelaterade frågor. Det mäter er faktiska synlighet i AI-sökmotorer.',

  reviewReplies: 'Recensionssvar visar AI-motorer att företaget är aktivt och engagerat. Google AI Overviews inkluderar företagssvar i sin analys, och ett högt svarsfrekvens signalerar god kundservice.',

  gbpData: 'Google Business Profile är er digitala skylt i Googles ekosystem. Fullständig GBP-data (betyg, öppettider, foton, tjänster) används direkt av Google AI Overviews och Maps-baserade AI-svar.',

  competitors: 'Konkurrentanalys visar hur ni presterar jämfört med andra i samma bransch och stad. Det ger kontext för vilka åtgärder som ger störst fördel i AI-sökresultat.',
}
