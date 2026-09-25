import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * QA-körning juni 2026 (docs/qa-run-2026-06/RESULTS.md, "Flash-bedömning för hård"):
 * eatSignals fick "bad" av Flash för tvakanten.se, roranalys.se och bjurfors.se trots att
 * VERIFICATION-PROTOCOL.md's egen trekravsräkning (Om oss-sida + org.nr + minst en
 * certifiering/namngiven person, warning vid 1–2 av tre saknade, bad bara vid alla tre
 * saknade) ger "warning" för samtliga tre. Grundorsaken var att den gamla prompten bad
 * Flash bedöma "delvis"/"mycket svaga signaler" utan att tala om att certifiering och
 * namngiven person/Person-schema räknas som EN gemensam signal — Flash räknade dem som
 * två separata saknade krav och landade på "bad" så fort båda saknades, även när bara
 * organisationsnumret också saknades (dvs. egentligen bara 2 av 3 krav, inte 3-4 av 4).
 *
 * Detta test grep:ar prompt-texten i route.ts och låser att den explicita trekravsräkningen
 * finns kvar — en framtida omskrivning som tar bort den kan tyst återinföra samma
 * övertolkning utan att något test slår larm.
 */
const routeFile = join(__dirname, '..', 'app', 'api', 'enhanced-scan', 'route.ts')

describe('eatSignals-prompten följer VERIFICATION-PROTOCOL.md:s trekravsräkning', () => {
  const content = readFileSync(routeFile, 'utf8')

  it('anger att eatSignals bedöms mot exakt tre krav', () => {
    expect(content).toMatch(/eatSignals bedöms mot EXAKT TRE krav/)
  })

  it('anger att certifiering och namngiven person räknas som EN gemensam signal, aldrig två separata', () => {
    expect(content).toMatch(/räknas\s+ALDRIG som två separata saknade krav/)
  })

  it('anger de tre statusgränserna numeriskt (0 saknas = ok, 1–2 = warning, alla tre = bad)', () => {
    expect(content).toMatch(/"ok"\s*=\s*alla tre krav uppfyllda \(0 av 3 saknas\)/)
    expect(content).toMatch(/"warning"\s*=\s*1–2 av de tre kraven\s*\n?\s*saknas/)
    expect(content).toMatch(/"bad"\s*=\s*alla tre kraven saknas/)
  })
})
