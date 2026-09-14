/**
 * Tracks which async call is the "current" one, so a superseded call's
 * result (or error) can be safely discarded instead of overwriting newer
 * state — e.g. when a component fires a fresh fetch before a previous one
 * has resolved (rapid re-scans, toggling, etc.).
 *
 * Usage:
 *   const guard = new RequestGuard()
 *   async function go() {
 *     const token = guard.start()      // marks this call as the latest
 *     const result = await doWork()
 *     if (!guard.isCurrent(token)) return  // a newer call superseded this one — discard
 *     applyResult(result)
 *   }
 */
export class RequestGuard {
  private token = 0

  /** Marks a new call as the current one. Returns a token to check later. */
  start(): number {
    this.token += 1
    return this.token
  }

  /** True if `token` is still the most recently started call. */
  isCurrent(token: number): boolean {
    return token === this.token
  }
}
