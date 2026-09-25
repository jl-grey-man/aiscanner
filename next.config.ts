import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

// `next dev` and the production build (`next build`) must never share a
// build directory — running `next dev` in this repo used to overwrite
// `.next/` and delete `.next/standalone`, crashing the staging systemd
// service on its next restart. `next dev` now builds into DEV_DIST_DIR
// instead, decided from Next's own build phase (see next/constants) so it
// works with zero extra config on the caller's part — no env var needed.
export const DEV_DIST_DIR = '.next-dev'

const baseConfig: NextConfig = {
  // Production build MUST keep outputting to .next/standalone —
  // railway.toml and the ai-scanner-api.service systemd unit both run
  // `node .next/standalone/server.js` and depend on the default distDir.
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        ],
      },
    ]
  },
}

export function buildConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return { ...baseConfig, distDir: DEV_DIST_DIR }
  }
  return baseConfig
}

export default buildConfig
