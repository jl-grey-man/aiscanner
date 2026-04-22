export function SeoFlow() {
  const forrSteps = [
    { icon: '🧑', label: 'Användaren söker' },
    { icon: '🔍', label: 'Google visar 10 blå länkar' },
    { icon: '📋', label: 'Din sida på plats #3' },
    { icon: '🖱️', label: 'Besökaren klickar — kanske' },
  ]

  const nuSteps = [
    { icon: '🧑', label: 'Användaren frågar AI:n' },
    { icon: '🤖', label: 'AI genererar ett svar' },
    { icon: '📌', label: '1–2 källor citeras' },
    { icon: '✅', label: 'Antingen är det du — eller inte' },
  ]

  return (
    <div className="w-full max-w-2xl mx-auto mt-12">
      <div className="grid grid-cols-2 gap-4">
        {/* FÖRR */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Förr</div>
          <div className="flex flex-col items-center gap-0 w-full">
            {forrSteps.map((step, i) => (
              <div key={i} className="flex flex-col items-center w-full">
                <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-4 py-3 w-full shadow-sm">
                  <span className="text-lg">{step.icon}</span>
                  <span className="text-sm text-gray-700">{step.label}</span>
                </div>
                {i < forrSteps.length - 1 && (
                  <div className="text-muted text-lg leading-none py-1">↓</div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-green-700 font-medium">10 platser att vinna</span>
          </div>
        </div>

        {/* NU */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-accent mb-4">Nu</div>
          <div className="flex flex-col items-center gap-0 w-full">
            {nuSteps.map((step, i) => (
              <div key={i} className="flex flex-col items-center w-full">
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 w-full shadow-sm border ${
                  i === 3
                    ? 'bg-accent/5 border-accent/30'
                    : 'bg-surface border-border'
                }`}>
                  <span className="text-lg">{step.icon}</span>
                  <span className={`text-sm ${i === 3 ? 'text-accent font-medium' : 'text-gray-700'}`}>
                    {step.label}
                  </span>
                </div>
                {i < nuSteps.length - 1 && (
                  <div className="text-muted text-lg leading-none py-1">↓</div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-red-600 font-medium">1 plats — ta den eller syns inte</span>
          </div>
        </div>
      </div>
    </div>
  )
}
