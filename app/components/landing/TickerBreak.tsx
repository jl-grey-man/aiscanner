'use client'

interface TickerProps {
  items: string[]
  speed?: number
}

function Ticker({ items, speed = 30 }: TickerProps) {
  const doubled = [...items, ...items]
  return (
    <div className="ticker-wrap">
      <div className="ticker-track" style={{ animationDuration: `${speed}s` }}>
        {doubled.map((t, i) => (
          <span key={i} className="ticker-item">{t}<span className="ticker-sep">✦</span></span>
        ))}
      </div>
    </div>
  )
}

export function TickerBreak() {
  return (
    <Ticker items={[
      'ChatGPT', 'Perplexity', 'Google AI', 'Copilot', 'Claude',
      '1–2 företag nämns', 'Resten ignoreras', 'Sökning förändras',
    ]} speed={40} />
  )
}
