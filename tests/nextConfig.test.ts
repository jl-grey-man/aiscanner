import { describe, it, expect } from 'vitest'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'
import buildConfig, { DEV_DIST_DIR } from '../next.config'

// Regression test for the outage where `next dev` overwrote `.next/` and
// deleted `.next/standalone`, crashing the staging systemd service. `next
// dev` must build into a separate directory so it can never touch the
// production build output again.
describe('next.config distDir', () => {
  it('builds into .next-dev in the dev server phase', () => {
    expect(DEV_DIST_DIR).toBe('.next-dev')
    expect(buildConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe('.next-dev')
  })

  it('keeps the default .next distDir for production builds', () => {
    expect(buildConfig(PHASE_PRODUCTION_BUILD).distDir).toBeUndefined()
  })

  it('always outputs standalone — railway.toml and the systemd unit run .next/standalone/server.js', () => {
    expect(buildConfig(PHASE_PRODUCTION_BUILD).output).toBe('standalone')
    expect(buildConfig(PHASE_DEVELOPMENT_SERVER).output).toBe('standalone')
  })
})
