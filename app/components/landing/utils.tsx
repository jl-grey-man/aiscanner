'use client'

import { useState, useEffect, useRef } from 'react'

/* ── Reveal hook ── */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('vis'); obs.unobserve(el) } },
      { threshold: 0.01, rootMargin: '20px 0px 0px 0px' }
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
        const num = parseInt(value), t0 = performance.now(), dur = 1200
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

/* ── Blob — decorative blurred circle ── */
interface BlobProps {
  color: string
  size: string
  top?: string
  left?: string
  right?: string
  bottom?: string
  blur?: number
  opacity?: number
}

export function Blob({ color, size, top, left, right, bottom, blur = 120, opacity = 0.5 }: BlobProps) {
  return (
    <div style={{
      position: 'absolute',
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      filter: `blur(${blur}px)`,
      opacity,
      top,
      left,
      right,
      bottom,
      pointerEvents: 'none',
    }} />
  )
}
