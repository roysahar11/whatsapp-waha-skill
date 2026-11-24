#!/bin/bash
# WAHA Health Check — Monitors message sync freshness
# Deployed to VPS at /opt/waha/health-check.sh
# Runs via cron every 6 hours
#
# Checks:
# 1. Session status (WORKING or not)
# 2. Message freshness across 3 groups (weekday + weekend coverage)
# 3. Bad decrypt error rate (logged for reference, not primary alert trigger)
#
# Alerts via WhatsApp self-chat (sending works even when reading is broken)

set -euo pipefail

# --- Config ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source /opt/waha/.env
API_URL="http://localhost:3000"

# Load personal config (group IDs, self-chat number, thresholds)
CONF_FILE="${SCRIPT_DIR}/health-check.conf"
if [ ! -f "$CONF_FILE" ]; then
  echo "Missing config: $CONF_FILE (copy health-check.conf.example and fill in your values)"
  exit 1
fi
source "$CONF_FILE"

# --- Helper functions ---
api_get() {
  curl -sf -H "X-Api-Key: $WAHA_API_KEY" "$API_URL$1" 2>/dev/null
}

api_post() {
  curl -sf -X POST -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" "$API_URL$1" -d "$2" 2>/dev/null
}

send_alert() {
  local message="$1"
  api_post "/api/sendText" "{\"chatId\":\"$SELF_CHAT\",\"text\":\"$message\",\"session\":\"default\"}" > /dev/null
  echo "[ALERT SENT] $message"
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# --- Check 1: Session status ---
session_status=$(api_get "/api/sessions/default" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null || echo "UNREACHABLE")

if [ "$session_status" != "WORKING" ]; then
  log "Session status: $session_status"
  if [ "$session_status" != "UNREACHABLE" ]; then
    send_alert "WAHA session is $session_status — not WORKING. Check /waha-admin."
  else
    log "WAHA API unreachable — container may be down"
  fi
  exit 1
fi

log "Session status: WORKING"

# --- Check 2: Bad decrypt error rate (informational) ---
# Bad decrypt errors are always present on NOWEB — they're background noise.
# We log the count for diagnostics but don't alert on it alone.
bad_decrypt_count=$(docker logs waha --since "7h" 2>&1 | grep -c "bad decrypt\|failed to find key" || true)
log "Bad decrypt errors (last 7h): $bad_decrypt_count"

# --- Check 3: Message freshness (primary alert) ---
now=$(date +%s)
stale_threshold=$((now - STALE_HOURS * 3600))

check_group_freshness() {
  local group_id="$1"
  local group_name="$2"

  local response
  response=$(api_get "/api/default/chats/$group_id/messages?limit=1&downloadMedia=false")

  if [ -z "$response" ] || [ "$response" = "[]" ]; then
    log "  $group_name: no messages (store may still be syncing)" >&2
    echo "NO_MESSAGES"
    return
  fi

  local timestamp
  timestamp=$(echo "$response" | python3 -c "import sys,json; msgs=json.load(sys.stdin); print(msgs[0]['timestamp'] if msgs else 0)" 2>/dev/null || echo "0")

  if [ "$timestamp" = "0" ]; then
    log "  $group_name: could not parse timestamp" >&2
    echo "PARSE_ERROR"
    return
  fi

  local age_hours=$(( (now - timestamp) / 3600 ))
  log "  $group_name: latest message ${age_hours}h ago" >&2

  if [ "$timestamp" -lt "$stale_threshold" ]; then
    echo "STALE"
  else
    echo "FRESH"
  fi
}

stale_count=0
total_count=0
results=()

for entry in "${MONITOR_GROUPS[@]}"; do
  group_id="${entry%%|*}"
  group_name="${entry#*|}"

  status=$(check_group_freshness "$group_id" "$group_name")
  results+=("${group_name}=${status}")
  total_count=$((total_count + 1))
  if [ "$status" = "STALE" ]; then
    stale_count=$((stale_count + 1))
  fi
done

# Alert if ALL monitored groups are stale — one quiet group is normal, all stale = sync broken
if [ "$stale_count" -eq "$total_count" ] && [ "$total_count" -gt 0 ]; then
  send_alert "WAHA message sync broken: all $total_count monitored groups stale (>${STALE_HOURS}h). State sync has likely failed (bad decrypt errors: $bad_decrypt_count in last 7h). Logout + QR re-scan needed — run /waha-admin."
fi

log "Result: ${results[*]}"
