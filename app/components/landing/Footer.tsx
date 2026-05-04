'use client'

import { APP_URL, APP_DOMAIN } from '@/app/lib/config'

export function Footer() {
  return (
    <footer className="site-footer">
      <span>AI Search Scanner — byggd för svenska företag</span>
      <a href={APP_URL}>{APP_DOMAIN}</a>
    </footer>
  )
}
