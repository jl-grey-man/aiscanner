import { useState } from 'react'
import type { FormEvent } from 'react'

interface Props {
  onSubmit: (url: string) => void
  disabled?: boolean
}

export function UrlInput({ onSubmit, disabled }: Props) {
  const [url, setUrl] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (url.trim()) onSubmit(url.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://dittforetag.se"
          disabled={disabled}
          className="flex-1 bg-surface border border-border rounded-xl px-5 py-4 text-lg
                     placeholder-slate-500 focus:outline-none focus:border-accent
                     transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !url.trim()}
          className="bg-accent hover:bg-accent-glow text-white font-semibold
                     px-8 py-4 rounded-xl transition-colors disabled:opacity-40
                     disabled:cursor-not-allowed whitespace-nowrap"
        >
          Skanna sidan
        </button>
      </div>
    </form>
  )
}
