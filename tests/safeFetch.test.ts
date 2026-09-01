import { describe, it, expect } from 'vitest'
import { isBlockedIp, assertPublicUrl } from '@/app/lib/safeFetch'

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '100.72.180.20', '0.0.0.0', '::1',
    '::ffff:192.168.1.1', 'fe80::1', 'fd00::1',
  ])('blockerar %s', (ip) => { expect(isBlockedIp(ip)).toBe(true) })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111'])(
    'tillåter %s', (ip) => { expect(isBlockedIp(ip)).toBe(false) })
})

describe('assertPublicUrl', () => {
  it('avvisar file://', async () => { await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow() })
  it('avvisar localhost', async () => { await expect(assertPublicUrl('http://localhost:8010/')).rejects.toThrow() })
  it('avvisar direkt privat IP', async () => { await expect(assertPublicUrl('http://192.168.1.1/')).rejects.toThrow() })
  it('avvisar Tailscale-IP', async () => { await expect(assertPublicUrl('http://100.72.180.20/')).rejects.toThrow() })
  it('avvisar trasig URL', async () => { await expect(assertPublicUrl('inte en url')).rejects.toThrow() })
  it('tillåter publik domän', async () => {
    const u = await assertPublicUrl('https://www.google.com/')
    expect(u.hostname).toBe('www.google.com')
  })
})
