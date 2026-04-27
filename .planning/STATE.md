# State: AI Search Scanner

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-27)

**Core value:** En svensk företagare kan skanna sin sajt gratis, förstå vad som saknas, och beställa en komplett analys som granskas manuellt och levereras per email.
**Current focus:** Phase 1 — Landing Page & Scan Flow

## Current Phase

Phase 1: Landing Page & Scan Flow — Context klar, redo för planning.

## Next Action

Kör `/clear` sedan `/gsd-plan-phase 1` för att planera Phase 1.

## Active Decisions

- Produktmodell: gratis scan direkt på sidan → premium via email-leverans med manuell review
- Enhanced scan (`/api/enhanced-scan`) är aktiv endpoint — inga ändringar i Phase 1
- 8-sektions landningssida från handoff-design (AI Analys-handoff.zip)
- Mörkt tema (bg-zinc-950) konsekvent
- Dev-toggle: bort helt (inte env-gated)
- Premium i Phase 1: bara email-capture, ingen leverans
- Roadmap omstrukturerat 2026-04-27: Phase 1=Landing, Phase 2=Premium Pipeline, Phase 3=Cleanup

## Blockers

None.

## Notes

- Context-filen: `.planning/phases/01-launch-readiness/01-CONTEXT.md`
- Tre inkompatibla output-typer (FreeReportData/PremiumReportData/EnhancedReportData) är teknisk skuld — inte akut, adresseras i Phase 3 eller v2
- Handoff-zip extraheras av planner/executor vid implementering
