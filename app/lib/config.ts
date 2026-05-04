function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'https://analyze.pipod.net'
  if (url.startsWith('http')) return url
  return `https://${url}`
}

export const APP_URL = getAppUrl()

export const APP_DOMAIN = (() => {
  try {
    return new URL(APP_URL).hostname
  } catch {
    return 'analyze.pipod.net'
  }
})()
