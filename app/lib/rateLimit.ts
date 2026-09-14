// In-memory sliding-window rate limiter.
//
// The app runs as a single long-lived Node process (systemd unit on pipod,
// Railway's standalone server in prod) — not a serverless/multi-instance
// deployment — so a shared in-process Map is a correct, simple limiter.
// It is NOT distributed: if the app ever runs as multiple instances behind
// a load balancer, this needs to move to a shared store (Redis etc).

export interface LimitResult {
  ok: boolean
  /** Seconds until the caller may retry. 0 when ok=true. */
  retryAfterSec: number
}

const hitsByKey = new Map<string, number[]>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // sweep stale keys every 5 min
// Longest window any caller in this app uses today (the 20/day per-IP limit).
// Anything older than this can never affect a future checkLimit() call, so it's
// safe to drop during cleanup regardless of which window the key was created for.
const MAX_RETENTION_MS = 24 * 60 * 60 * 1000

let lastCleanup = Date.now()

function cleanupStaleKeys(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, timestamps] of hitsByKey) {
    const fresh = timestamps.filter((t) => now - t < MAX_RETENTION_MS)
    if (fresh.length === 0) hitsByKey.delete(key)
    else if (fresh.length !== timestamps.length) hitsByKey.set(key, fresh)
  }
}

/**
 * Sliding-window rate limit check. Records a hit and reports whether `key`
 * is still under `limit` hits within the trailing `windowMs`.
 *
 * `key` must encode both the bucket and the identity being limited, e.g.
 * `` `scan:ip10m:${ip}` `` — reusing the same key across different
 * limit/windowMs pairs mixes unrelated limits together.
 */
export function checkLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now()
  cleanupStaleKeys(now)

  const windowStart = now - windowMs
  const existing = hitsByKey.get(key) ?? []
  const recent = existing.filter((t) => t > windowStart)

  if (recent.length >= limit) {
    // Over the limit — don't record this attempt as a new hit, just report
    // when the oldest hit in the window will fall out of it.
    hitsByKey.set(key, recent)
    const oldest = recent[0]
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { ok: false, retryAfterSec }
  }

  recent.push(now)
  hitsByKey.set(key, recent)
  return { ok: true, retryAfterSec: 0 }
}

/**
 * Resolve the client IP to rate-limit on.
 *
 * - pipod (analyze.pipod.net): Cloudflare Tunnel -> nginx -> this app. Set
 *   TRUST_CF_HEADER=1 there so we trust Cloudflare's `cf-connecting-ip`
 *   (nginx/tunnel don't rewrite it, and Cloudflare is the only path in).
 * - Railway (robotbyran.com, real production): no CF in front, so we fall
 *   back to `x-forwarded-for` (set by Railway's edge) / `x-real-ip`.
 */
export function getClientIp(req: NextRequestLike): string {
  const headers = req.headers
  if (process.env.TRUST_CF_HEADER === '1') {
    const cf = headers.get('cf-connecting-ip')
    if (cf) return cf.trim()
  }
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

/** Minimal shape we need — matches both NextRequest and the standard Request. */
interface NextRequestLike {
  headers: { get(name: string): string | null }
}
