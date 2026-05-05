import { Footer } from '@/app/components/landing/Footer'

export const metadata = {
  title: 'Om oss — AI Search Scanner',
  description: 'Läs mer om AI Search Scanner och teamet bakom verktyget.',
}

export default function OmOssPage() {
  return (
    <div className="min-h-screen bg-[var(--c-bg)]">
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: 'var(--c-ink)', color: 'white' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-24 md:py-36">
          <p className="text-sm font-semibold tracking-widest uppercase mb-6" style={{ color: 'var(--c-accent)' }}>
            Om oss
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] max-w-2xl">
            Vi hjälper svenska företag att synas när kunder frågar AI.
          </h1>
        </div>
      </section>

      {/* Profile */}
      <section className="max-w-[1080px] mx-auto px-8 py-20 md:py-28">
        <div className="grid md:grid-cols-[280px_1fr] gap-12 md:gap-20 items-start">
          {/* Image card */}
          <div className="mx-auto md:mx-0">
            <div className="w-64 h-64 md:w-full md:h-auto md:aspect-square rounded-2xl overflow-hidden shadow-lg border border-[var(--c-border)] bg-white flex items-center justify-center">
              {/* Placeholder — replace with actual image */}
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--c-accent-soft)' }}>
                <span className="text-6xl font-bold" style={{ color: 'var(--c-accent)', fontFamily: 'var(--font-display)' }}>
                  JL
                </span>
              </div>
            </div>
            <p className="text-xs text-center mt-3" style={{ color: 'var(--c-light)' }}>
              Byt ut bilden i <code className="text-[var(--c-accent)]">public/jens-lennartsson.jpg</code>
            </p>
          </div>

          {/* Text */}
          <div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--c-ink)' }}>
              Jens Lennartsson
            </h2>
            <p className="text-lg font-medium mb-8" style={{ color: 'var(--c-accent)' }}>
              Grundare & produktansvarig
            </p>

            <div className="space-y-5 text-[17px] leading-relaxed" style={{ color: 'var(--c-muted)' }}>
              <p>
                AI Search Scanner föddes ur en enkel observation: allt fler människor ställer frågor till ChatGPT, Perplexity och Google AI Overview istället för att scrolla bland blå länkar. Och när AI svarar — ger den bara <em>ett</em> svar. Inte tio.
              </p>
              <p>
                Jag byggde det här verktyget för att ge svenska företag insikt i hur synliga de är i den nya sökvärlden. Tekniken bakom är en blandning av webbskrapning, Google Places API, strukturerad dataanalys och flera parallella AI-anrop — allt sammanställt i en rapport som är begriplig även om du aldrig har hört talas om schema markup.
              </p>
              <p>
                Innan AI Search Scanner arbetade jag med digital strategi och SEO i över tio år. Jag har sett algoritmer förändras många gånger. Förändringen till AI-sök är den största hittills — och den pågår just nu.
              </p>
              <p>
                Vill du veta mer, diskutera ett samarbete eller bara prata om var sökvärlden är på väg? Skicka ett mail eller hojta på LinkedIn.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href="mailto:jens@aiscanner.se"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-colors"
                style={{ background: 'var(--c-accent)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                jens@aiscanner.se
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors border"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Values / How it works */}
      <section style={{ background: 'var(--c-bg-alt)' }}>
        <div className="max-w-[1080px] mx-auto px-8 py-20 md:py-28">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-12" style={{ fontFamily: 'var(--font-display)', color: 'var(--c-ink)' }}>
            Så här fungerar det
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                n: '01',
                title: 'Skanna',
                text: 'Du anger din webbadress och stad. Vi skrapar din sajt, analyserar din Google Business-profil och kontrollerar katalognärvaro på under en minut.',
              },
              {
                n: '02',
                title: 'Analysera',
                text: 'Tre parallella AI-modeller granskar tekniska signaler, innehållsdjup och E-A-T-faktorer. Resultatet valideras mot 37 kontrollpunkter.',
              },
              {
                n: '03',
                title: 'Förbättra',
                text: 'Du får en prioriterad åtgärdsplan med konkreta steg — från schema markup till lokal SEO — så att AI-sökmotorerna hittar och litar på dig.',
              },
            ].map((step) => (
              <div key={step.n} className="bg-white rounded-2xl p-8 border" style={{ borderColor: 'var(--c-border)' }}>
                <span className="text-sm font-bold tracking-widest mb-4 block" style={{ color: 'var(--c-accent)' }}>{step.n}</span>
                <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)', color: 'var(--c-ink)' }}>{step.title}</h3>
                <p className="text-[15px] leading-relaxed" style={{ color: 'var(--c-muted)' }}>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1080px] mx-auto px-8 py-20 md:py-28 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--c-ink)' }}>
          Nyfiken på hur du syns?
        </h2>
        <p className="text-lg mb-10 max-w-lg mx-auto" style={{ color: 'var(--c-muted)' }}>
          Testa din sajt gratis och se exakt vad AI-sökmotorerna ser — och vad de missar.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white text-lg transition-colors"
          style={{ background: 'var(--c-accent)' }}
        >
          Skanna din sajt
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </section>

      <Footer />
    </div>
  )
}
