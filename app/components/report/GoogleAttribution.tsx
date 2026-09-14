'use client'

import React from 'react'

/**
 * Google Places attribution — krävs enligt Places API-villkoren
 * (developers.google.com/maps/documentation/places/web-service/policies,
 * verifierat 2026-09-14): "When displaying Places API data without a Google
 * Map, you must include the Google logo." Placeras vid varje sektion som
 * visar Places-data (GBP-kort, betyg/öppettider, konkurrenter, recensioner)
 * i Free- och PremiumReport.
 *
 * Loggan är Googles egen officiella nedladdning
 * (Google_Maps_Attribution_Assets.zip, gråa icke-konturerade varianten —
 * "use... non-outlined on plain backgrounds" — som passar rapportens vita/
 * ljusgrå kort), sparad oförändrad (ingen omfärgning/förvrängning, vilket
 * riktlinjerna förbjuder) som public/google-maps-logo.svg. Höjd 16px matchar
 * minimikravet (16dp).
 */
export default function GoogleAttribution({ className = '' }: { className?: string }) {
  return (
    <img
      src="/google-maps-logo.svg"
      alt="Uppgifter från Google Maps"
      className={`h-4 w-auto shrink-0 ${className}`}
    />
  )
}
