import { lookup } from 'node:dns/promises'
import net from 'node:net'

// SSRF-skydd: servern sitter i privat nät (Tailscale + LAN) och scrapar
// användarangivna URL:er. Blockera allt icke-publikt adressutrymme.
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
]

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0)
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask)
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
    if (lower.startsWith('::ffff:')) return isBlockedIp(lower.slice(7))
    return false
  }
  if (!net.isIPv4(ip)) return true
  return BLOCKED_V4.some(([base, bits]) => inCidr(ip, base, bits))
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let u: URL
  try { u = new URL(rawUrl) } catch { throw new Error('Ogiltig URL') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Endast http/https tillåts')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Blockerad adress')
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('Blockerad adress')
    return u
  }
  const addrs = await lookup(host, { all: true })
  if (addrs.length === 0 || addrs.some(a => isBlockedIp(a.address))) {
    throw new Error('Blockerad adress')
  }
  return u
}

/** fetch som validerar URL:en och varje redirect-hopp (max 5). */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = rawUrl
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(current)
    const res = await fetch(current, { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      current = new URL(loc, current).toString()
      continue
    }
    return res
  }
  throw new Error('För många redirects')
}
