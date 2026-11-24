---
name: waha-admin
description: "WAHA container and session administration. Use when: WAHA errors occur, WhatsApp API returns 400/401/422, session is FAILED/SCAN_QR_CODE/stuck in STARTING, 'Connection Failure' in logs, session won't connect after a WhatsApp update, container won't start, 'Enable NOWEB store' error, stale group messages / 'bad decrypt', Docker issues with waha container, or any WhatsApp infrastructure problem. NOT for sending/reading messages — that's the whatsapp skill."
---

# WAHA Admin

**First:** Read `config.local.md` in this skill's directory for your WAHA host details (IP/URL, SSH alias, dashboard URL, hosting panel).

## Infrastructure

WAHA runs on a remote host (see config.local.md for connection details).

| What | Where |
|------|-------|
| Docker Compose | `/opt/waha/docker-compose.yml` (on host) |
| Session data | `/opt/waha/sessions/` (WhatsApp auth keys + NOWEB SQLite store) |
| Media files | `/opt/waha/media/` |
| Credentials | `/opt/waha/.env` (on host, chmod 600) |
| Dashboard | See config.local.md for URL |
| Local skill .env | The whatsapp skill's `scripts/.env` (points to host) |

## Auto-recovery after crash/reboot

The setup is designed to self-heal without manual intervention:

1. **Host reboots** → Docker starts automatically (systemd enabled)
2. **Docker starts** → WAHA container starts automatically (`restart: unless-stopped`)
3. **Container starts** → WhatsApp session starts automatically (`WHATSAPP_RESTART_ALL_SESSIONS=True`)
4. **Session starts** → Auth keys + store config are preserved (bind-mount at `/opt/waha/sessions/`)

After a crash or reboot, give it ~30 seconds and check `check-instance.ts state`. It should show WORKING. If it shows FAILED, a simple reboot usually fixes it. **Do not logout or recreate the session** unless the triage rule below says to — the two failure modes that look like dead credentials usually aren't.

## Quick reference

Replace `SSH_ALIAS` below with the SSH alias from config.local.md. Commands ending in `.ts` are whatsapp skill scripts: run them as that skill's Running Commands section shows.

```bash
# Check session status (from local machine, via skill scripts)
check-instance.ts state

# Restart session (recovers from FAILED, preserves auth + store)
check-instance.ts reboot

# View container logs
ssh SSH_ALIAS 'docker logs waha --tail 100'

# Full container restart (picks up .env changes)
ssh SSH_ALIAS 'cd /opt/waha && docker compose down && docker compose up -d'

# Start container if stopped
ssh SSH_ALIAS 'cd /opt/waha && docker compose up -d'

# Check disk space (sessions + media can grow)
ssh SSH_ALIAS 'df -h / && du -sh /opt/waha/sessions /opt/waha/media'
```

## Creating a fresh session

Only needed after a logout or first-time setup. Create via API (not the dashboard) to ensure store config is applied:

```bash
ssh SSH_ALIAS 'source /opt/waha/.env && curl -s -H "X-Api-Key: $WAHA_API_KEY" -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '"'"'{"name":"default","start":true,"config":{"noweb":{"store":{"enabled":true,"fullSync":true}}}}'"'"''
```

Then open the dashboard (URL from config.local.md) and scan QR with WhatsApp (Linked Devices > Link a Device).

**Why not the dashboard?** The dashboard may not apply `store.enabled` and `store.fullSync` when creating sessions. These must be set at creation time — changing them later corrupts message sync.

## Health Monitoring

A health check script runs on the VPS every 6 hours via cron.

| What | Where |
|------|-------|
| Script | `/opt/waha/health-check.sh` |
| Log | `/opt/waha/health-check.log` |
| Cron | `0 */6 * * *` (00:00, 06:00, 12:00, 18:00 CET) |
| Source | `waha-health-check.sh` in this skill directory |

**What it checks:**
1. Session status is WORKING
2. Message freshness in 3 groups (weekday + weekend coverage)
3. Bad decrypt error rate (logged, not primary alert trigger)

**Alert method:** WhatsApp self-chat message (sending works even when reading/sync is broken).

**Alert triggers:**
- Session is not WORKING
- ALL 3 monitored groups have no new messages in 24+ hours (one quiet group is normal; all stale = sync is broken)

To check logs: `ssh SSH_ALIAS 'tail -50 /opt/waha/health-check.log'`

## Troubleshooting

**Session FAILED:**
Most common issue. Usually recovers with a reboot:
```bash
check-instance.ts reboot
```
If reboot doesn't help, check logs: `ssh SSH_ALIAS 'docker logs waha --tail 200'`

A session that repeatedly `FAILED`s and **never reaches `WORKING`** — especially with
`Error: Connection Failure` in the logs — is a **version gate**, not dead credentials.
Run the triage rule below before you consider a logout.

**401 Unauthorized from skill scripts:**
API key mismatch between host `.env` and local skill `.env`. After rotating credentials, do a full container restart (`docker compose down && up`), not just `docker compose restart`.

**Messages returning empty / store not syncing:**
Check `check-instance.ts state` — verify `store.enabled: true` and `store.fullSync: true` in the config. If missing, the session was created without store config. Must logout and recreate.

**SCAN_QR_CODE status:**
Open the WAHA dashboard (URL from config.local.md) and scan the QR code.

**Container not running:**
```bash
ssh SSH_ALIAS 'cd /opt/waha && docker compose up -d'
```

**Host unreachable via SSH:**
Check your hosting panel (URL from config.local.md) — the host may be down or rebooting.

## ⛔ Before ANY logout — the triage rule

Logout is **irreversible**. It wipes the credentials *and the LID map* (the LID↔phone mapping needed to resolve DMs, @mentions, and group participants), so everything has to re-resolve from scratch. Two failure modes below end in "logout + fresh session" — **neither is the right call until you have confirmed WhatsApp actually logged the session out.**

```bash
ssh SSH_ALIAS 'docker logs waha --since 48h 2>&1 | grep -iE "loggedOut|401|Unauthorized|conflict|replaced"'
```

| What you find | Diagnosis | Do this |
|---|---|---|
| A `loggedOut` / `401` event | Creds really are dead — unlinked on the phone, or replaced by another device. | Logout + fresh session (below). |
| **Nothing**, session `FAILED` or stuck `STARTING`, `Error: Connection Failure` in logs | **Version gate** — creds are fine. | **Bump the WAHA image.** Never log out. |
| **Nothing**, session `WORKING` but group messages stale, `bad decrypt` in logs | State corruption. | Logout is the fix — but confirm the bad-decrypt signature first. |

## Version gate — session won't connect after a WhatsApp update

WhatsApp refuses the handshake when the WhatsApp Web version WAHA advertises has aged out. The credentials are untouched; WhatsApp simply won't talk to a client that old. **A re-pair "works" only by destroying and rebuilding state that was never broken.**

### Signature

- Session sits `FAILED`, or bounces `STARTING` → `FAILED`, and **never reaches `WORKING`**
- `Error: Connection Failure` in the logs, from Baileys' **noise-handler**
- **No `loggedOut` and no `401`** anywhere in the logs
- Restarts and reboots change nothing — every attempt fails identically
- Nothing changed on your side: no config edit, no key rotation, no phone action

### Diagnosis

```bash
# The signature: connection failures with NO logout event
ssh SSH_ALIAS 'docker logs waha --since 48h 2>&1 | grep -iE "Connection Failure|noise|loggedOut|401"'

# Which image is actually running
ssh SSH_ALIAS 'docker inspect waha --format "{{.Config.Image}}"'
```

Compare the running tag against https://waha.devlike.pro/docs/overview/changelog/ — look for a recent "fix WhatsApp Web version" / "up engine" entry.

### The fix: bump the WAHA image

Update the pinned tag in the host's `docker-compose.yml`, then recreate:

```bash
ssh SSH_ALIAS 'cd /opt/waha && docker compose pull && docker compose up -d'
```

The session comes back on the **existing** credentials — no QR scan, LID map intact.

### If no release has fixed it yet

WAHA **2026.7.2** added two env vars for pinning the WhatsApp Web version by hand:

| Variable | Purpose |
|---|---|
| `WAHA_NOWEB_WA_VERSION` | Override the WhatsApp Web version NOWEB advertises |
| `WAHA_NOWEB_WA_VERSION_FORCE` | Force it even when WAHA would otherwise pick its own |

Set them in the host `.env`, then do a **full** restart (`docker compose down && docker compose up -d`) — `docker compose restart` does not re-read `.env`.

> **Seen in production.** A session sat `FAILED` for hours with `Error: Connection Failure` in the noise-handler and **no `loggedOut`/401 anywhere** in the logs. Every runbook to hand said "dead creds → re-pair". The actual fix was bumping WAHA `2026.6.1` → `2026.7.2`, a release whose notes include "NOWEB — fix WhatsApp Web version"; the session recovered on the existing credentials. A logout would have wiped the LID map for nothing.
>
> The failure mode is engine-level: it applies to **any** NOWEB instance, on any host.

## "Bad decrypt" / stale group messages

This is the most complex failure mode. The session shows WORKING but group messages (and sometimes private chat messages) stop updating. This happens because of a known, unfixable Baileys library limitation.

### What happens

WhatsApp syncs app state (group metadata, contacts, settings) across devices using AES-encrypted patch mutations. The NOWEB engine (built on Baileys) sometimes can't decrypt these patches — the local encryption keys don't match what WhatsApp's servers send. This causes `critical_unblock_low` state sync to fail in a retry loop until WhatsApp rate-limits (429), at which point the sync is abandoned.

### Key facts (researched 2026-03-23)

- Bad decrypt errors are **universal in NOWEB/Baileys** — they happen on every session, including brand new ones
- They are NOT caused by fullSync, sleep/wake, or any specific configuration
- Accounts in many groups have higher error rates (more state patches = more decrypt opportunities)
- A fresh session typically has an initial burst of errors (~20 min) during first sync, then stabilizes
- Over days/weeks, connection drops trigger reconnects, each producing a new error burst
- Eventually, accumulated failed resyncs cause the session to lose track of chat state
- The session status stays WORKING — only symptom is stale messages
- Sending messages still works when reading is broken
- The WAHA maintainer recommends GOWS engine as the more stable alternative (avoids Baileys entirely)

### Diagnosis

```bash
# Check error count in recent logs
ssh SSH_ALIAS 'docker logs waha --since 24h 2>&1 | grep -c "bad decrypt\|failed to find key"'

# Check message freshness (should show recent timestamps)
get-chat-history.ts --group "120363xxxxxxxxxxxx@g.us" --count 1

# Check for connection drop events
ssh SSH_ALIAS 'docker logs waha --since 24h 2>&1 | grep -c "stream errored\|connection errored\|Connection closed"'
```

### What does NOT fix it

- Session reboot (`check-instance.ts reboot`) — reconnects but state sync still fails
- Deleting `app-state-sync-version-*` files — Baileys already resyncs from v0, that's not the issue
- Deleting `app-state-sync-key-*` files — Baileys cannot re-request keys; makes it worse ("failed to find key" instead of "bad decrypt")
- Container restart — same as reboot, no effect on corrupted state

### The fix — logout + fresh session

⚠️ **Only after the triage rule above.** This is the right remedy for *bad decrypt specifically* — a session that reports `WORKING` while messages go stale, with `bad decrypt` in the logs. It is the **wrong** remedy for a session that never connects at all (that's the version gate), and it destroys the LID map either way.

```bash
# 1. Stop session
ssh SSH_ALIAS 'source /opt/waha/.env && curl -s -X POST "http://localhost:3000/api/sessions/default/stop" -H "X-Api-Key: $WAHA_API_KEY"'

# 2. Logout (wipes session data)
ssh SSH_ALIAS 'source /opt/waha/.env && curl -s -X POST "http://localhost:3000/api/sessions/logout" -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" -d '"'"'{"name":"default"}'"'"''

# 3. Create fresh session
ssh SSH_ALIAS 'source /opt/waha/.env && curl -s -X POST http://localhost:3000/api/sessions -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" -d '"'"'{"name":"default","start":true,"config":{"noweb":{"store":{"enabled":true,"fullSync":true}}}}'"'"''

# 4. Scan QR code on dashboard
```

### GOWS engine as alternative

GOWS (Go-based engine) avoids Baileys entirely and doesn't have the bad decrypt issue. As of 2026-03, GOWS has feature parity for most operations but has gaps: no documented fullSync, no custom link preview, missing some webhook events (label changes, poll.vote.failed), and some active bugs (duplicate webhooks, album messages not grouped, mentions). Evaluate before switching.
