import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Search Scanner — Syns du för AI-sökmotorer?',
  description: 'Analysera din hemsida och få reda på exakt vad som behöver fixas för att ChatGPT, Perplexity och Google AI ska hitta och citera dig.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv">
      <body className="antialiased">{children}</body>
    </html>
  )
}
