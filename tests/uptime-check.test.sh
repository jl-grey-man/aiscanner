#!/bin/bash
# Tillståndsbyte-test för deploy/uptime-check.sh.
# Körs manuellt (inte via `npm test`/vitest — se vitest.config.ts include-mönster
# `tests/**/*.test.ts`, matchar aldrig .sh): `bash tests/uptime-check.test.sh`
#
# Verifierar: 2 misslyckade kontroller i rad mot en blockerad adress ger EXAKT
# ett "nere"-larm, och den efterföljande lyckade kontrollen mot en normal URL
# ger EXAKT ett "uppe"-larm — aldrig spam. DRY_RUN=1 skriver larmtexten till
# loggen i stället för att posta till Telegram, så testet aldrig skickar
# riktiga meddelanden.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO_DIR/deploy/uptime-check.sh"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

STATE_FILE="$TMPDIR/uptime-state"
LOG_FILE="$TMPDIR/uptime.log"
BLOCKED_URL="http://127.0.0.1:1/"   # inget lyssnar där → snabb, deterministisk connection refused
NORMAL_URL="https://robotbyran.com/"

fail() { echo "FAIL: $1"; exit 1; }

run() {
  STATE_FILE="$STATE_FILE" LOG_FILE="$LOG_FILE" DRY_RUN=1 \
    UPTIME_TARGETS="test=$1" bash "$SCRIPT"
}

echo "== Körning 1: blockerad adress =="
run "$BLOCKED_URL"
DOWN_ALERTS="$(grep -c '\[DRY_RUN\] 🔴 test' "$LOG_FILE" || true)"
[ "$DOWN_ALERTS" = "0" ] || fail "larm skickat redan efter 1 misslyckad kontroll (tröskel är 2): $DOWN_ALERTS"
read -r _label fails down <<< "$(grep '^test ' "$STATE_FILE")"
[ "$fails" = "1" ] || fail "fails efter körning 1 = $fails, väntat 1"
[ "$down" = "0" ] || fail "down efter körning 1 = $down, väntat 0"

echo "== Körning 2: blockerad adress igen =="
run "$BLOCKED_URL"
DOWN_ALERTS="$(grep -c '\[DRY_RUN\] 🔴 test' "$LOG_FILE" || true)"
[ "$DOWN_ALERTS" = "1" ] || fail "exakt 1 nere-larm väntat efter 2 misslyckade kontroller, fick $DOWN_ALERTS"
read -r _label fails down <<< "$(grep '^test ' "$STATE_FILE")"
[ "$fails" = "2" ] || fail "fails efter körning 2 = $fails, väntat 2"
[ "$down" = "1" ] || fail "down efter körning 2 = $down, väntat 1"

echo "== Körning 3: normal URL (återhämtning) =="
run "$NORMAL_URL"
UP_ALERTS="$(grep -c '\[DRY_RUN\] ✅ test' "$LOG_FILE" || true)"
[ "$UP_ALERTS" = "1" ] || fail "exakt 1 uppe-larm väntat efter återhämtning, fick $UP_ALERTS"
read -r _label fails down <<< "$(grep '^test ' "$STATE_FILE")"
[ "$fails" = "0" ] || fail "fails efter återhämtning = $fails, väntat 0"
[ "$down" = "0" ] || fail "down efter återhämtning = $down, väntat 0"

echo "== Körning 4: ytterligare en lyckad kontroll ska INTE ge nytt larm =="
run "$NORMAL_URL"
UP_ALERTS="$(grep -c '\[DRY_RUN\] ✅ test' "$LOG_FILE" || true)"
[ "$UP_ALERTS" = "1" ] || fail "ytterligare uppe-larm skickades vid redan uppe-läge: $UP_ALERTS"

echo "PASS: exakt 1 nere-larm + exakt 1 uppe-larm, ingen spam."
