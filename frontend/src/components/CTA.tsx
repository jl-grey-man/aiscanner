export function CTA() {
  return (
    <div className="mt-16 grid md:grid-cols-2 gap-6">
      <div className="bg-surface border border-border rounded-2xl p-8">
        <h3 className="text-xl font-semibold mb-3">Fixa det själv</h3>
        <p className="text-slate-400 mb-5 text-sm leading-relaxed">
          Rapporten ovan berättar exakt vad som behöver göras. Skicka den till din webbutvecklare eller webbyrå.
        </p>
        <span className="text-slate-500 text-sm">Ladda ner som PDF — kommer snart</span>
      </div>
      <div className="bg-accent/10 border border-accent/30 rounded-2xl p-8">
        <h3 className="text-xl font-semibold mb-3">Vi fixar det åt dig</h3>
        <p className="text-slate-400 mb-5 text-sm leading-relaxed">
          Vi implementerar alla förbättringar och ser till att du syns i AI-sökmotorer.
        </p>
        <a
          href="mailto:hej@example.com"
          className="inline-block bg-accent hover:bg-accent-glow text-white font-semibold
                     px-6 py-3 rounded-xl transition-colors text-sm"
        >
          Kontakta oss →
        </a>
      </div>
    </div>
  )
}
