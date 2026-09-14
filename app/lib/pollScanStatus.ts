/**
 * pollScanStatus.ts — klientens väntan på det asynkrona paid-scannet (Task 13).
 *
 * /report anropar POST /api/checkout/finalize; svarar den 202 { status: 'running' }
 * pollas GET /api/checkout/status tills scannet är klart, har misslyckats eller
 * tidsgränsen passerats. Tillfälliga fel (nätverk, 5xx, 429, trasig JSON)
 * avbryter inte pollningen — bara ett definitivt svar gör det.
 */

import type { ScanResult } from './scanResult'

export const POLL_INTERVAL_MS = 5_000
export const POLL_TIMEOUT_MS = 10 * 60 * 1000

export type PollOutcome =
  | { status: 'done'; scanResult: ScanResult }
  | { status: 'failed' }
  | { status: 'notFound' }
  | { status: 'timeout' }

export interface PollOptions {
  sessionId: string
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  intervalMs?: number
  timeoutMs?: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function pollScanStatus({
  sessionId,
  fetchFn = (input, init) => fetch(input, init),
  sleep = defaultSleep,
  now = Date.now,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
}: PollOptions): Promise<PollOutcome> {
  const deadline = now() + timeoutMs
  const url = `/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`

  while (now() < deadline) {
    await sleep(intervalMs)
    try {
      const res = await fetchFn(url, { cache: 'no-store' })
      if (res.status === 404) return { status: 'notFound' }
      if (res.ok) {
        const json = (await res.json()) as { status?: string; scanResult?: ScanResult }
        if (json.status === 'done' && json.scanResult) return { status: 'done', scanResult: json.scanResult }
        if (json.status === 'failed') return { status: 'failed' }
        // 'running' / 'pending' → fortsätt vänta
      }
      // 5xx / 429 / övriga → tillfälligt, försök igen nästa varv
    } catch {
      // Nätverksfel eller trasig JSON → försök igen nästa varv
    }
  }
  return { status: 'timeout' }
}
