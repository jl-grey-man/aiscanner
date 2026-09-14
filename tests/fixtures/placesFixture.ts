/**
 * Testfixtur för Places-efterlevnaden (placesContent.ts). paidReportPlaces.json är härledd
 * ur en riktig paid-scan (struktur, statusar, fix-texter) men allt Places-innehåll och all
 * AI-text är påhittat — Places-innehåll får inte lagras, inte heller i git.
 *
 * `buildPaidReport()` gör rapporten till exakt det route.ts returnerar i paid: kodmallar
 * ifyllda med fillTemplate() och huvudschemat som ägarens richCodeExample.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ScanResult } from '@/app/lib/scanResult'
import type { NearbyCompetitor } from '@/app/lib/places'
import type { PlaceData } from '@/app/lib/placesContent'
import { getGenericFix } from '@/app/lib/genericFixes'
import { fillTemplate } from '@/app/lib/templateFill'
import { buildMasterSchema } from '@/app/lib/masterSchema'

export interface PlacesFixture {
  report: ScanResult
  freshPlace: PlaceData
  freshCompetitors: NearbyCompetitor[]
}

export function loadPlacesFixture(): PlacesFixture {
  return JSON.parse(readFileSync(path.join(__dirname, 'paidReportPlaces.json'), 'utf8'))
}

/** Alla Places-värden i fixturen som aldrig får finnas i en lagrad rapport. */
export const FIXTURE_PLACES_VALUES = [
  'Testgatan 12',
  '031-700 12 34',
  '+46 31 700 12 34',
  '"rating":4.6',
  '4.6/5',
  '321 recensioner',
  'totalt 321',
  'tisdag: 11:00–22:00',
  'söndag: 12:00–21:00',
  '57.7001',
  '11.9701',
  'point_of_interest',
  'scandinavian_restaurant',
  'Konkurrent Alfa',
  'Konkurrent Beta',
  'Konkurrent Gamma',
  'Konkurrent Delta',
  'Konkurrent Epsilon',
  'alfakrog.se',
  'betakrog.se',
  'gammavin.se',
  'facebook.com/epsilon',
  'Mysig uteservering och härlig stämning en solig dag.',
  'Maten var riktigt god och personalen snabb.',
  'Lite väl högt pris för portionerna.',
  'Lisa Larsson',
  'Johan Öberg',
  'Sara Nilsson',
  'https://www.google.com/maps/contrib/1000000001',
  'https://www.google.com/maps/contrib/1000000002',
  'https://www.google.com/maps/contrib/1000000003',
  // GBP-profilens websiteUri (http) — sajtens egen canonical (https) är skrapad data och får finnas kvar.
  'http://www.krogentest.se/',
]

export function buildPaidReport(fixture: PlacesFixture = loadPlacesFixture()): ScanResult {
  const report = fixture.report
  const place = fixture.freshPlace
  const site = report.placesRef!.site
  const templateMeta = {
    companyName: 'Krogen Test',
    phone: '031-700 12 34',
    streetAddress: 'Testgatan 12',
    city: 'Göteborg',
    postalCode: '411 36',
    domain: 'krogentest.se',
    url: 'https://www.krogentest.se',
    email: site.email,
  }
  for (const check of report.checks) {
    if (check.status !== 'bad' && check.status !== 'warning') continue
    const fix = getGenericFix(check.key, check.status)
    if (!fix) continue
    check.genericSteps = fix.steps
    check.genericCodeTemplate = fix.codeTemplate ? fillTemplate(fix.codeTemplate, templateMeta) : fix.codeTemplate
  }
  const owner = report.checks.find(c => c.key === 'localBusiness')!
  owner.richCodeExample = buildMasterSchema({
    companyName: 'Krogen Test',
    url: report.meta.url,
    city: 'Göteborg',
    phone: '031-700 12 34',
    streetAddress: 'Testgatan 12',
    postalCode: '411 36',
    formattedAddress: place.formattedAddress,
    email: site.email,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    placeId: place.id,
    primaryType: place.primaryType,
    openingPeriods: place.regularOpeningHours.periods,
    schemaTypes: site.schemaTypes,
    socialLinks: site.socialLinks,
  })!.code
  return report
}

/** Färsk Places-data som motsvarar rapporten (som om Google svarade likadant vid läsningen). */
export function freshPlacesFor(
  fixture: PlacesFixture = loadPlacesFixture(),
): { place: PlaceData; competitors: Map<string, NearbyCompetitor> } {
  return {
    place: { ...fixture.freshPlace, _domainMatch: true },
    competitors: new Map(fixture.freshCompetitors.map(c => [c.placeId, c])),
  }
}
