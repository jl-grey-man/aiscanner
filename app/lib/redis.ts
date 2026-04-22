// Stub Redis client — replace with real Redis (e.g. Upstash, ioredis) for production
const memory = new Map<string, { value: string; expiresAt: number }>()

export const redis = {
  async get(key: string): Promise<string | null> {
    const entry = memory.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      memory.delete(key)
      return null
    }
    return entry.value
  },

  async setex(key: string, seconds: number, value: string): Promise<void> {
    memory.set(key, { value, expiresAt: Date.now() + seconds * 1000 })
  },

  async incr(key: string): Promise<number> {
    const entry = memory.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      memory.set(key, { value: '1', expiresAt: Date.now() + 3600 * 1000 })
      return 1
    }
    const next = parseInt(entry.value, 10) + 1
    entry.value = String(next)
    return next
  },

  async expire(key: string, seconds: number): Promise<void> {
    const entry = memory.get(key)
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000
    }
  },
}
