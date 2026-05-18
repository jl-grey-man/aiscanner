'use client'

import React from 'react'

interface LockedSectionProps {
  title: string
  children: React.ReactNode
  ctaText?: string
  /** Callback när användaren klickar "Lås upp" — om satt anropas den, annars är knappen disabled */
  onUnlock?: () => void
  /** Visas på knappen när onUnlock pågår (t.ex. när vi väntar på Stripe-redirect) */
  loading?: boolean
  /** Felmeddelande visat under knappen */
  error?: string | null
}

export default function LockedSection({
  title,
  children,
  ctaText = 'Lås upp med fullständig rapport — 499 kr',
  onUnlock,
  loading,
  error,
}: LockedSectionProps) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm mb-8">
      {/* Section header */}
      <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-gray-100">
        <span className="text-amber-500 text-lg">&#9733;</span>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full ml-1">
          Premiumfunktion
        </span>
      </div>

      {/* Content with blur overlay */}
      <div className="relative px-6 pb-6 pt-4">
        {/* Actual children — visually blurred */}
        <div className="pointer-events-none select-none blur-sm opacity-60" aria-hidden="true">
          {children}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm rounded-b-xl">
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            {/* Lock icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-amber-500"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>

            <p className="text-gray-700 font-medium text-sm max-w-xs">
              {ctaText}
            </p>

            <button
              type="button"
              onClick={onUnlock}
              disabled={loading || !onUnlock}
              className="mt-1 px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              {loading ? 'Laddar betalning...' : 'Lås upp fullständig rapport'}
            </button>
            {error && (
              <p className="text-red-600 text-xs mt-1 max-w-xs">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
