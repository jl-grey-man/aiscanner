import type { Metadata } from 'next'
import { Syne, DM_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const syne = Syne({ subsets: ['latin'], weight: ['400', '700', '800'], variable: '--font-display', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-body', display: 'swap' })
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: ['400'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono', display: 'swap' })

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
    <html lang="sv" className={`${syne.variable} ${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
