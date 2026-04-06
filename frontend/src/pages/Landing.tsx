import { UrlInput } from '../components/UrlInput'

const CHECKS = [
  { icon: '🤖', label: 'AI-crawler åtkomst' },
  { icon: '📄', label: 'llms.txt standard' },
  { icon: '🏗️', label: 'Strukturerad data' },
  { icon: '🔍', label: 'Innehållstydlighet' },
]

interface Props {
  onSubmit: (url: string) => void
  loading?: boolean
}

export function Landing({ onSubmit, loading }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-20">
      <div className="text-center mb-12 max-w-3xl">
        <div className="inline-block bg-accent/10 text-accent-glow text-sm font-medium
                        px-4 py-1.5 rounded-full mb-6 border border-accent/20">
          GEO & AEO-optimering
        </div>
        <h1 className="text-5xl font-bold mb-5 leading-tight tracking-tight">
          Syns du för{' '}
          <span className="text-accent-glow">AI-sökmotorer?</span>
        </h1>
        <p className="text-slate-400 text-xl leading-relaxed">
          Skriv in din URL — vi analyserar din sida och berättar exakt vad som behöver fixas
          för att ChatGPT, Perplexity och Google AI ska hitta och citera dig.
        </p>
      </div>

      <UrlInput onSubmit={onSubmit} disabled={loading} />

      <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl w-full">
        {CHECKS.map(c => (
          <div key={c.label}
               className="bg-surface border border-border rounded-xl p-4 text-center">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
