---
name: waha-admin
description: "WAHA container and session administration. Use when: WAHA errors occur, WhatsApp API returns 400/401/422, session is FAILED/SCAN_QR_CODE, container won't start, 'Enable NOWEB store' error, Docker issues with waha container, or any WhatsApp infrastructure problem. NOT for sending/reading messages — that's the whatsapp skill."
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
| Local skill .env | `~/.claude/skills/whatsapp/scripts/.env` (points to host) |

## Auto-recovery after crash/reboot

The setup is designed to self-heal without manual intervention:

1. **Host reboots** → Docker starts automatically (systemd enabled)
2. **Docker starts** → WAHA container starts automatically (`restart: unless-stopped`)
3. **Container starts** → WhatsApp session starts automatically (`WHATSAPP_RESTART_ALL_SESSIONS=True`)
4. **Session starts** → Auth keys + store config are preserved (bind-mount at `/opt/waha/sessions/`)

After a crash or reboot, give it ~30 seconds and check `wa.sh check-instance.ts state`. It should show WORKING. If it shows FAILED, a simple reboot usually fixes it. **Do not logout or recreate the session** unless you've confirmed the session data is actually corrupted (bad decrypt errors in logs).

## Quick reference

Replace `SSH_ALIAS` below with the SSH alias from config.local.md.

```bash
# Check session status (from local machine, via skill scripts)
wa.sh check-instance.ts state

# Restart session (recovers from FAILED, preserves auth + store)
wa.sh check-instance.ts reboot

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

## Troubleshooting

**Session FAILED:**
Most common issue. Usually recovers with a reboot:
```bash
wa.sh check-instance.ts reboot
```
If reboot doesn't help, check logs: `ssh SSH_ALIAS 'docker logs waha --tail 200'`

**401 Unauthorized from skill scripts:**
API key mismatch between host `.env` and local skill `.env`. After rotating credentials, do a full container restart (`docker compose down && up`), not just `docker compose restart`.

**Messages returning empty / store not syncing:**
Check `wa.sh check-instance.ts state` — verify `store.enabled: true` and `store.fullSync: true` in the config. If missing, the session was created without store config. Must logout and recreate.

**"bad decrypt" sync errors in logs:**
Encryption keys are corrupted. Logout (`wa.sh check-instance.ts logout`) and recreate the session (QR re-scan required).

**SCAN_QR_CODE status:**
Open the WAHA dashboard (URL from config.local.md) and scan the QR code.

**Container not running:**
```bash
ssh SSH_ALIAS 'cd /opt/waha && docker compose up -d'
```

**Host unreachable via SSH:**
Check your hosting panel (URL from config.local.md) — the host may be down or rebooting.
