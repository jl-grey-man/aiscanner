'use client'

import Link from 'next/link'
import { useState } from 'react'

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'rgba(250,248,245,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      <div
        className="mx-auto flex items-center justify-between px-8 py-4"
        style={{ maxWidth: 1200 }}
      >
        {/* Logo */}
        <Link href="/" className="transition-opacity hover:opacity-80">
          <img
            src="/robotlogo.webp"
            alt="Robotbyrån"
            width={583}
            height={96}
            className="h-8 md:h-10 w-auto"
            style={{ display: 'block' }}
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/"
            className="text-sm font-medium transition-colors hover:text-[var(--c-accent)]"
            style={{ color: 'var(--c-muted)' }}
          >
            Hem
          </Link>
          <Link
            href="/om-oss"
            className="text-sm font-medium transition-colors hover:text-[var(--c-accent)]"
            style={{ color: 'var(--c-muted)' }}
          >
            Om oss
          </Link>
          <a
            href="/#analysera"
            className="text-sm font-semibold text-white px-4 py-2 rounded-lg transition-colors hover:opacity-90"
            style={{ background: 'var(--c-accent)' }}
          >
            Skanna din sajt
          </a>
        </nav>

        {/* Mobile nav */}
        <div className="flex md:hidden items-center gap-3">
          <a
            href="/#analysera"
            className="text-sm font-semibold text-white px-4 py-2 rounded-lg transition-colors hover:opacity-90"
            style={{ background: 'var(--c-accent)' }}
          >
            Skanna
          </a>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg"
            style={{ color: 'var(--c-ink)' }}
            aria-label="Meny"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div
          className="md:hidden px-8 pb-4 flex flex-col gap-3"
          style={{ borderTop: '1px solid var(--c-border)' }}
        >
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="text-sm font-medium py-2 transition-colors hover:text-[var(--c-accent)]"
            style={{ color: 'var(--c-muted)' }}
          >
            Hem
          </Link>
          <Link
            href="/om-oss"
            onClick={() => setMenuOpen(false)}
            className="text-sm font-medium py-2 transition-colors hover:text-[var(--c-accent)]"
            style={{ color: 'var(--c-muted)' }}
          >
            Om oss
          </Link>
        </div>
      )}
    </header>
  )
}
