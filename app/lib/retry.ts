export interface RetryOpts {
  attempts?: number
  baseDelayMs?: number
  isRetryable?: (err: unknown) => boolean
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000, isRetryable = () => true } = opts
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      if (i === attempts - 1 || !isRetryable(err)) throw err
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** i))
    }
  }
  throw lastErr
}
