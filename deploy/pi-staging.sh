#!/usr/bin/env bash
# Deploy-flöde för staging på Pi:n (analyze.pipod.net), INTE Railway/produktion.
# Körs manuellt efter varje kodändring, INNAN `git push` (push till master
# auto-deployar produktion på Railway/robotbyran.com — se CLAUDE.md).
#
# Steg: tester -> produktionsbygge -> starta om ai-scanner-api.service ->
# vänta tills tjänsten svarar lokalt -> röktester mot den publika
# analyze.pipod.net-adressen. Avslutar med icke-noll exitkod om något steg
# misslyckas, så den kan användas som ett grindvillkor (t.ex. i en CI-liknande
# manuell rutin) och inte bara som en logg att läsa i efterhand.
#
# Användning:
#   deploy/pi-staging.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

SERVICE="ai-scanner-api.service"
LOCAL_URL="http://127.0.0.1:8010/"
PUBLIC_BASE="https://analyze.pipod.net"
SCAN_URL="${PUBLIC_BASE}/api/enhanced-scan"
LOCAL_WAIT_SEC=30

PASS_LIST=()
FAIL_LIST=()

pass() {
  PASS_LIST+=("$1")
  echo "[PASS] $1"
}

fail() {
  FAIL_LIST+=("$1")
  echo "[FAIL] $1" >&2
}

echo "==> 1/5 npm test"
npm test

echo "==> 2/5 npm run build"
npm run build

echo "==> 3/5 restart ${SERVICE}"
sudo systemctl reset-failed "$SERVICE" || true
sudo systemctl restart "$SERVICE"

echo "==> 4/5 väntar på ${LOCAL_URL} (upp till ${LOCAL_WAIT_SEC}s)"
local_code="000"
local_ok=0
for _ in $(seq 1 "$LOCAL_WAIT_SEC"); do
  local_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$LOCAL_URL" 2>/dev/null || echo "000")"
  if [ "$local_code" = "200" ]; then
    local_ok=1
    break
  fi
  sleep 1
done
if [ "$local_ok" = "1" ]; then
  pass "Lokal tjänst ${LOCAL_URL} svarade 200 efter omstart"
else
  fail "Lokal tjänst ${LOCAL_URL} svarade aldrig 200 inom ${LOCAL_WAIT_SEC}s (sist: ${local_code})"
  echo "Avbryter — röktester mot ${PUBLIC_BASE} skulle ändå misslyckas." >&2
  echo ""
  echo "Resultat: FAIL"
  exit 1
fi

echo "==> 5/5 röktester mot ${PUBLIC_BASE}"

# --- GET / -> 200 ---
root_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${PUBLIC_BASE}/" 2>/dev/null || echo "000")"
if [ "$root_code" = "200" ]; then
  pass "GET ${PUBLIC_BASE}/ -> 200"
else
  fail "GET ${PUBLIC_BASE}/ -> ${root_code} (väntat 200)"
fi

# --- SSRF-block: privat/lokal IP ska ge 400 ---
ssrf_body="$(mktemp)"
ssrf_code="$(curl -s -o "$ssrf_body" -w '%{http_code}' --max-time 15 -X POST "$SCAN_URL" \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://192.168.1.1/"}' 2>/dev/null || echo "000")"
if [ "$ssrf_code" = "400" ]; then
  pass "POST ${SCAN_URL} (privat IP) -> 400"
else
  fail "POST ${SCAN_URL} (privat IP) -> ${ssrf_code} (väntat 400): $(cat "$ssrf_body")"
fi
rm -f "$ssrf_body"

# --- Riktig gratis-scan: 200, exakt 37 checks, inga "Kunde inte analyseras" ---
scan_body="$(mktemp)"
scan_code="$(curl -s -o "$scan_body" -w '%{http_code}' --max-time 90 -X POST "$SCAN_URL" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.tvakanten.se"}' 2>/dev/null || echo "000")"
if [ "$scan_code" != "200" ]; then
  fail "POST ${SCAN_URL} (gratis-scan tvakanten.se) -> ${scan_code} (väntat 200)"
else
  # ScanResult är top-level JSON: { checks: CheckResult[37], ... } — se app/lib/scanResult.ts
  scan_summary="$(python3 - "$scan_body" <<'PYEOF'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    raw = f.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError as exc:
    print(f"error|invalid JSON: {exc}")
    sys.exit(0)

checks = data.get("checks")
if not isinstance(checks, list):
    print("error|no top-level 'checks' array in response")
    sys.exit(0)

occurrences = raw.count("Kunde inte analyseras")
print(f"ok|{len(checks)}|{occurrences}")
PYEOF
)"
  scan_status="${scan_summary%%|*}"
  if [ "$scan_status" = "error" ]; then
    fail "POST ${SCAN_URL} (gratis-scan tvakanten.se) -> svaret kunde inte tolkas: ${scan_summary#error|}"
  else
    rest="${scan_summary#ok|}"
    check_count="${rest%%|*}"
    occurrence_count="${rest##*|}"

    if [ "$check_count" = "37" ]; then
      pass "POST ${SCAN_URL} (gratis-scan tvakanten.se) -> 37 checks"
    else
      fail "POST ${SCAN_URL} (gratis-scan tvakanten.se) -> ${check_count} checks (väntat 37)"
    fi

    if [ "$occurrence_count" = "0" ]; then
      pass "POST ${SCAN_URL} (gratis-scan tvakanten.se) -> 0 st 'Kunde inte analyseras'"
    else
      fail "POST ${SCAN_URL} (gratis-scan tvakanten.se) -> ${occurrence_count} st 'Kunde inte analyseras' (väntat 0)"
    fi
  fi
fi
rm -f "$scan_body"

echo ""
echo "===================== SAMMANFATTNING ====================="
for p in "${PASS_LIST[@]:-}"; do
  [ -n "$p" ] && echo "  [PASS] $p"
done
for f in "${FAIL_LIST[@]:-}"; do
  [ -n "$f" ] && echo "  [FAIL] $f"
done
echo "PASS: ${#PASS_LIST[@]}   FAIL: ${#FAIL_LIST[@]}"

if [ "${#FAIL_LIST[@]}" -gt 0 ]; then
  echo "Resultat: FAIL"
  exit 1
fi

echo "Resultat: PASS"
