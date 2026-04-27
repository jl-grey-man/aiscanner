'use client'

import { useState, type FormEvent } from 'react'

interface Props {
  show: boolean
}

export function PremiumCTA({ show }: Props) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (!show) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    localStorage.setItem('premium_interest_email', email.trim())
    setSubmitted(true)
  }

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '16px',
        padding: '36px 40px',
        maxWidth: '480px',
        margin: '0 auto',
        color: 'var(--c3-ink)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          background: 'var(--c3-pop-soft)',
          color: 'var(--c3-pop)',
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '4px 12px',
          borderRadius: '999px',
          marginBottom: '16px',
        }}
      >
        Premium
      </div>

      <h3
        style={{
          fontSize: '24px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: '12px',
        }}
      >
        Vill du ha hela analysen?
      </h3>

      <p
        style={{
          fontSize: '15px',
          color: 'var(--c3-muted)',
          lineHeight: 1.6,
          marginBottom: '20px',
        }}
      >
        Vi går igenom din sajt manuellt och skickar en komplett rapport med kodsnuttar och handlingsplan.
      </p>

      <div
        style={{
          fontSize: '28px',
          fontWeight: 800,
          color: 'var(--c3-ink)',
          marginBottom: '24px',
          letterSpacing: '-0.02em',
        }}
      >
        499 kr
      </div>

      {submitted ? (
        <p
          style={{
            fontSize: '16px',
            color: 'var(--c3-green)',
            fontWeight: 600,
            padding: '14px',
            background: '#f0fdf4',
            borderRadius: '10px',
          }}
        >
          Tack! Vi hör av oss.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="din@epost.se"
            required
            style={{
              flex: 1,
              border: '1.5px solid var(--c3-border)',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '15px',
              outline: 'none',
              color: 'var(--c3-ink)',
              background: 'white',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            style={{
              background: 'var(--c3-pop)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 20px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            Beställ rapport
          </button>
        </form>
      )}
    </div>
  )
}
