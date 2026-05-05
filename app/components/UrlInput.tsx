import { useState, type FormEvent } from 'react'

interface Props {
  onSubmit: (url: string, city: string) => void
  disabled?: boolean
  compact?: boolean
}

export function UrlInput({ onSubmit, disabled, compact }: Props) {
  const [url, setUrl] = useState('')
  const [city, setCity] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (url.trim()) onSubmit(url.trim(), city.trim())
  }

  const sizeClasses = compact
    ? {
        wrap: 'flex flex-col sm:flex-row gap-2',
        url: 'flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#D94F1E] focus:ring-2 focus:ring-[#D94F1E]/20 transition-all disabled:opacity-50 shadow-sm',
        city: 'sm:w-44 bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#D94F1E] focus:ring-2 focus:ring-[#D94F1E]/20 transition-all disabled:opacity-50 shadow-sm',
        btn: 'bg-[#D94F1E] hover:bg-[#B33D12] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shadow-sm text-sm',
      }
    : {
        wrap: 'flex gap-3',
        url: 'flex-1 bg-surface border border-border rounded-xl px-5 py-4 text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 shadow-sm',
        city: 'w-48 bg-surface border border-border rounded-xl px-4 py-4 text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 shadow-sm',
        btn: 'bg-accent hover:bg-accent-glow text-white font-semibold px-8 py-4 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shadow-sm',
      }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={sizeClasses.wrap}>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://dittforetag.se"
          disabled={disabled}
          className={sizeClasses.url}
        />
        <input
          type="text"
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="Stad (t.ex. Göteborg)"
          disabled={disabled}
          className={sizeClasses.city}
        />
        <button
          type="submit"
          disabled={disabled || !url.trim()}
          className={sizeClasses.btn}
        >
          {disabled ? 'Analyserar...' : 'Skanna sidan'}
        </button>
      </div>
    </form>
  )
}
