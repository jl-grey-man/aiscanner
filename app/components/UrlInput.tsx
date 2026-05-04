import { useState, type FormEvent } from 'react'

interface Props {
  onSubmit: (url: string, city: string) => void
  disabled?: boolean
}

export function UrlInput({ onSubmit, disabled }: Props) {
  const [url, setUrl] = useState('')
  const [city, setCity] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (url.trim()) onSubmit(url.trim(), city.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://dittforetag.se"
          disabled={disabled}
          className="flex-1 bg-surface border border-border rounded-xl px-5 py-4 text-lg
                     text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent
                     focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 shadow-sm"
        />
        <input
          type="text"
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="Stad (t.ex. Göteborg)"
          disabled={disabled}
          className="w-48 bg-surface border border-border rounded-xl px-4 py-4 text-lg
                     text-gray-900 placeholder-gray-400 focus:outline-none focus:border-accent
                     focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 shadow-sm"
        />
        <button
          type="submit"
          disabled={disabled || !url.trim()}
          className="bg-accent hover:bg-accent-glow text-white font-semibold
                     px-8 py-4 rounded-xl transition-colors disabled:opacity-40
                     disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
        >
          {disabled ? 'Analyserar...' : 'Skanna sidan'}
        </button>
      </div>
    </form>
  )
}
