/**
 * templateFill.ts — Fyller generiska kodmallar (genericCodeTemplate) med kända
 * fakta om företaget, server-side, innan premiumrapporten renderas.
 *
 * Mallarna i genericFixes.ts innehåller platshållare enligt konventionen
 * <FÖRETAGSNAMN>, <TELEFONNUMMER>, <GATUADRESS>, <STAD>, <POSTNUMMER>, <DOMÄN>,
 * <URL>, <EPOST> m.fl. fillTemplate() ersätter BARA de platshållare där vi har
 * en verklig, bekräftad uppgift (Places API / skrapning) — aldrig påhittat.
 *
 * Fyller medvetet inte branschord (<TJÄNST>) eller fritextfält (<VERKSAMHETSTYP>,
 * <ORGNUMMER>, <BESKRIVNING> osv) — de kräver antingen en schema.org-mappning vi
 * inte har, eller grammatisk böjning vi inte kan garantera blir korrekt svenska.
 * Kvarvarande platshållare lämnas orörda i strängen; SolutionCard.tsx visar då
 * en tydlig "Mall"-badge i stället för att gissa eller dölja koden.
 *
 * Task 17 / Audit #2 (docs/plans/2026-09-01-golive-fixes.md,
 * scratchpad/paid-audit.md): premiumkunder såg inget kodblock alls för checks
 * där bara genericCodeTemplate fanns — se SolutionCard.tsx.
 */

export interface TemplateFillMeta {
  companyName?: string | null
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  postalCode?: string | null
  domain?: string | null
  url?: string | null
  email?: string | null
}

// Rena sakuppgifter (namn/adress/telefon/domän) — inga ord som kräver
// grammatisk böjning i sin kontext.
const TOKEN_FIELDS: ReadonlyArray<readonly [string, keyof TemplateFillMeta]> = [
  ['FÖRETAGSNAMN', 'companyName'],
  ['TELEFONNUMMER', 'phone'],
  ['GATUADRESS', 'streetAddress'],
  ['STAD', 'city'],
  ['POSTNUMMER', 'postalCode'],
  ['DOMÄN', 'domain'],
  ['URL', 'url'],
  ['EPOST', 'email'],
]

/**
 * Ersätter kända platshållare i en kodmall med verkliga företagsuppgifter.
 * Platshållare vi saknar data för (t.ex. <VERKSAMHETSTYP>, <ORGNUMMER>) eller
 * inte hanterar (t.ex. <TJÄNST>) lämnas oförändrade — se modul-kommentaren.
 */
export function fillTemplate(template: string, meta: TemplateFillMeta): string {
  let result = template
  for (const [token, field] of TOKEN_FIELDS) {
    const value = meta[field]
    if (typeof value === 'string' && value.trim().length > 0) {
      result = result.split(`<${token}>`).join(value.trim())
    }
  }
  return result
}
