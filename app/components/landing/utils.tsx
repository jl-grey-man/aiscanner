'use client'

import { useState, useEffect, useRef } from 'react'

/* ── Reveal hook — checks if already in viewport on mount ── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Check if already in viewport
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('vis')
      return
    }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('vis'); obs.unobserve(el) } },
      { threshold, rootMargin: '0px 0px -60px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

/* ── R — scroll reveal wrapper ── */
interface RProps {
  children: React.ReactNode
  className?: string
  delay?: number
  style?: React.CSSProperties
}

export function R({ children, className = '', delay = 0, style = {} }: RProps) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      className={`rv ${className}`}
      style={{ transitionDelay: `${delay * 0.1}s`, ...style }}
    >
      {children}
    </div>
  )
}

/* ── AnimNum — animated counter ── */
interface AnimNumProps {
  value: string
  suffix?: string
}

export function AnimNum({ value, suffix = '' }: AnimNumProps) {
  const [n, setN] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const ran = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !ran.current) {
        ran.current = true
        const num = parseInt(value)
        const t0 = performance.now()
        const dur = 1400
        const tick = (now: number) => {
          const p = Math.min((now - t0) / dur, 1)
          setN(Math.round((1 - Math.pow(1 - p, 3)) * num))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value])
  return <span ref={ref}>{n}{suffix}</span>
}
