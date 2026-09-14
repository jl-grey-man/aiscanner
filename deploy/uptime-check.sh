#!/bin/bash
# Cron-vakt (var 5:e minut): kollar att robotbyran.com (riktig prod) och
# analyze.pipod.net (spegel) svarar HTTP 200. Larmar via Telegram (claudebot)
# EN gång vid nere och EN gång vid återhämtning — aldrig spam. Kräver 2
# misslyckade kontroller i rad innan ett läge räknas som "nere".
#
# Miljövariabler (för test/override, se tests/uptime-check.test.sh):
#   UPTIME_TARGETS  "label=url label2=url2 ..." (default: robotbyran + pipod)
#   DRY_RUN=1       skriv larmtexten till loggen i stället för att posta till Telegram
#   FAIL_THRESHOLD  antal misslyckade kontroller i rad innan "nere" (default 2)
#
# Larm: BOT_TOKEN läses från /mnt/storage/secrets.env (utanför detta repo),
# eller — om den nyckeln saknas — från data/.telegram (gitignorerad, chmod 600).
# Token skrivs ALDRIG till stdout/loggen.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${STATE_FILE:-$REPO_DIR/data/uptime-state}"
LOG_FILE="${LOG_FILE:-$REPO_DIR/data/uptime.log}"
SECRETS_ENV="${SECRETS_ENV:-/mnt/storage/secrets.env}"
TELEGRAM_TOKEN_FILE="${TELEGRAM_TOKEN_FILE:-$REPO_DIR/data/.telegram}"
CHAT_ID="8296186575"
TIMEOUT_SEC=15
FAIL_THRESHOLD="${FAIL_THRESHOLD:-2}"
DRY_RUN="${DRY_RUN:-0}"

DEFAULT_TARGETS="robotbyran=https://robotbyran.com/ pipod=https://analyze.pipod.net/"
TARGETS="${UPTIME_TARGETS:-$DEFAULT_TARGETS}"

mkdir -p "$(dirname "$STATE_FILE")"
touch "$STATE_FILE" "$LOG_FILE"

log() {
  echo "$(date -Is) $1" >> "$LOG_FILE"
}

# Läser BOT_TOKEN utan att skriva ut den. Ekar ENDAST till stdout via command
# substitution i get_bot_token — anropande kod skickar den direkt vidare till
# curl, aldrig till log()/echo.
get_bot_token() {
  local token=""
  if [ -f "$SECRETS_ENV" ]; then
    token="$(grep -E '^BOT_TOKEN=' "$SECRETS_ENV" | head -1 | sed 's/^BOT_TOKEN=//')"
  fi
  if [ -z "$token" ] && [ -f "$TELEGRAM_TOKEN_FILE" ]; then
    token="$(head -1 "$TELEGRAM_TOKEN_FILE")"
  fi
  printf '%s' "$token"
}

# send_alert MESSAGE — DRY_RUN=1 skriver till loggen i stället för Telegram
# (används av tillståndsbyte-testet). Annars POST:as meddelandet till
# claudebot. Misslyckad Telegram-post loggas men kraschar aldrig skriptet.
send_alert() {
  local message="$1"
  if [ "$DRY_RUN" = "1" ]; then
    log "[DRY_RUN] $message"
    return 0
  fi
  local token
  token="$(get_bot_token)"
  if [ -z "$token" ]; then
    log "FEL: ingen Telegram-token hittades (varken $SECRETS_ENV eller $TELEGRAM_TOKEN_FILE) — larm EJ skickat: $message"
    return 1
  fi
  local http_code
  http_code="$(curl -s -o /dev/null -m 10 -w "%{http_code}" -X POST \
    "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="$CHAT_ID" \
    --data-urlencode "text=$message")"
  if [ "$http_code" != "200" ]; then
    log "FEL: Telegram-larm misslyckades (HTTP $http_code): $message"
    return 1
  fi
  log "Larm skickat: $message"
  return 0
}

# read_state LABEL — skriver ut "fails down" (default "0 0" om okänd label)
read_state() {
  local label="$1"
  awk -v l="$label" '$1==l {print $2, $3; found=1} END {if (!found) print "0 0"}' "$STATE_FILE"
}

# write_state LABEL FAILS DOWN — uppdaterar/lägger till raden för denna label,
# rör inte andra labels rader.
write_state() {
  local label="$1" fails="$2" down="$3"
  local tmp
  tmp="$(mktemp "$STATE_FILE.XXXXXX")"
  awk -v l="$label" -v f="$fails" -v d="$down" \
    '$1==l {print l, f, d; found=1; next} {print} END {if (!found) print l, f, d}' \
    "$STATE_FILE" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

for pair in $TARGETS; do
  label="${pair%%=*}"
  url="${pair#*=}"

  code="$(curl -s -o /dev/null -m "$TIMEOUT_SEC" -w "%{http_code}" "$url" 2>/dev/null)"
  [ -z "$code" ] && code="000"

  read -r fails down <<< "$(read_state "$label")"

  if [ "$code" != "200" ]; then
    fails=$((fails + 1))
    log "$label ($url) misslyckades (HTTP $code), $fails/$FAIL_THRESHOLD i rad"
    if [ "$fails" -ge "$FAIL_THRESHOLD" ] && [ "$down" != "1" ]; then
      send_alert "🔴 $label ($url) är nere (HTTP $code, $fails misslyckade kontroller i rad)"
      down=1
    fi
  else
    if [ "$down" = "1" ]; then
      send_alert "✅ $label ($url) är uppe igen"
    fi
    fails=0
    down=0
  fi

  write_state "$label" "$fails" "$down"
done

exit 0
