# Claude Code WhatsApp Skill

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill for sending and reading WhatsApp messages via [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API).

## What It Does

This project adds WhatsApp capabilities to Claude Code as a **skill** — a set of instructions and scripts that Claude Code loads automatically when you ask it to do anything involving WhatsApp. Just talk to Claude naturally:

- *"Send mom a happy birthday message"* — drafts a message, resolves "mom" from your contact aliases, asks for approval, sends
- *"What did I miss in the family group?"* — fetches recent group messages and summarizes
- *"Send this PDF to 972501234567"* — sends the file via WhatsApp
- *"Read my last 10 self-chat messages"* — reads notes you sent to yourself

### Capabilities

| | |
|---|---|
| **Send** | Text messages, images, voice notes, files (PDF, DOCX, etc.), contact cards |
| **Read** | Chat history, group messages, recent messages across all chats |
| **Contacts** | Search contacts, get info, list group members, resolve aliases |
| **Groups** | Send to groups, broadcast DMs to all members, find who joined recently |
| **Autonomous mode** | For cron jobs and agents — sends to self without approval prompts |
| **Safety** | Default-to-self recipient, two-step send approval, dry-run, credential isolation |

Includes a companion **waha-admin** skill for WAHA infrastructure troubleshooting (session recovery, container management, log inspection).

## How It Works

```
You ──→ Claude Code ──→ WhatsApp Skill (TypeScript scripts) ──→ WAHA API ──→ WhatsApp
```

[WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API) is a self-hosted server that exposes WhatsApp functionality as a REST API. It runs as a Docker container and connects to WhatsApp via the multi-device protocol — your phone doesn't need to stay online.

The skill's TypeScript scripts call WAHA's API endpoints to send messages, read chats, manage contacts, etc. Claude Code orchestrates everything: it resolves recipients, drafts messages, asks for your approval, and executes the right script.

### WAHA Plus vs. WAHA Free

WAHA comes in two versions. This skill uses **WAHA Plus** (`devlikeapro/waha-plus:noweb`), but most features work with the free version too.

| Feature | Free | Plus |
|---------|:----:|:----:|
| Send/receive messages | Yes | Yes |
| Send images, files, voice notes | Yes | Yes |
| Contact search and info | Yes | Yes |
| Group management | Yes | Yes |
| **Message history & store** | **No** | **Yes** |
| **Full message sync** | **No** | **Yes** |

**The key difference is message history.** WAHA Plus includes a built-in message store (SQLite) that syncs your full chat history. Without it, you can only read messages received *after* the WAHA session was created — no historical messages.

If you only need to **send** messages and read **new incoming** messages, WAHA Free works fine. If you need to **read chat history** (e.g., "what did I miss in this group?"), you'll need [WAHA Plus](https://waha.devlike.pro/docs/how-to/plus-version/).

> To use the free version, replace `devlikeapro/waha-plus:noweb` with `devlikeapro/waha:noweb` in the Docker commands below.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [WAHA](https://waha.devlike.pro/) instance (self-hosted via Docker)
- Node.js (v18+)
- `ffmpeg` (optional — required only for sending voice notes)

## Installation

### 1. Clone and symlink

```bash
git clone https://github.com/roysahar11/claude-code-whatsapp.git
ln -s "$(pwd)/claude-code-whatsapp/whatsapp" ~/.claude/skills/whatsapp
ln -s "$(pwd)/claude-code-whatsapp/waha-admin" ~/.claude/skills/waha-admin
```

### 2. Install dependencies

```bash
cd ~/.claude/skills/whatsapp/scripts
npm install
```

### 3. Set up WAHA

**Option A: Local Docker**
```bash
docker run -d \
  --name waha \
  -p 3000:3000 \
  -e WHATSAPP_RESTART_ALL_SESSIONS=True \
  -e WAHA_DASHBOARD_ENABLED=true \
  -e WAHA_API_KEY=your-secret-key \
  -v ./sessions:/tmp/sessions \
  devlikeapro/waha-plus:noweb
```

**Option B: Remote VPS**

Run the same Docker setup on a VPS for 24/7 availability. Any provider works (DigitalOcean, Hetzner, Contabo, etc.). A remote setup keeps your WhatsApp connection alive even when your computer is off.

### 4. Create WAHA session

Create via API to ensure the message store is configured correctly:

```bash
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-secret-key" \
  -d '{"name":"default","start":true,"config":{"noweb":{"store":{"enabled":true,"fullSync":true}}}}'
```

> **Why via API and not the dashboard?** The dashboard may not apply `store.enabled` and `store.fullSync` when creating sessions. These must be set at creation time — changing them later breaks message sync.

Then open `http://localhost:3000/dashboard` and scan the QR code with WhatsApp (Settings > Linked Devices > Link a Device).

### 5. Configure

```bash
# Script credentials
cp ~/.claude/skills/whatsapp/scripts/.env.example ~/.claude/skills/whatsapp/scripts/.env
# Edit .env with your WAHA URL and API key

# Personal config (default phone, preferences)
cp ~/.claude/skills/whatsapp/config.example.md ~/.claude/skills/whatsapp/config.local.md
# Edit config.local.md with your phone number

# Optional: contact aliases
cp ~/.claude/skills/whatsapp/scripts/contacts-aliases.example.json ~/.claude/skills/whatsapp/scripts/contacts-aliases.json
# Edit with your frequently used contacts

# WAHA admin config (if using remote host)
cp ~/.claude/skills/waha-admin/config.example.md ~/.claude/skills/waha-admin/config.local.md
# Edit with your host details
```

### 6. Verify

Open Claude Code and test:
```
Send a test message to myself on WhatsApp
```

## Contact Aliases

Contact aliases let you refer to people by name instead of phone number. When you say *"send a message to mom"*, Claude resolves "mom" to the right phone number instantly — no API lookup needed.

### Why aliases exist

Without aliases, Claude would need to search the WAHA contacts API every time you mention someone by name. This is slow, may return multiple matches, and doesn't work well with nicknames or non-Latin names. Aliases solve this by providing:

- **Instant resolution** — no API call, no ambiguity
- **Nicknames and multiple aliases** — define both "mom" and "אמא" for the same contact
- **Language preferences** — specify whether to draft messages in Hebrew or English for each contact
- **Reliability** — works even if the contact's WhatsApp name doesn't match what you call them

### Setup

Copy the example file and add your contacts:

```bash
cp ~/.claude/skills/whatsapp/scripts/contacts-aliases.example.json \
   ~/.claude/skills/whatsapp/scripts/contacts-aliases.json
```

```json
{
  "aliases": {
    "mom": {
      "phone": "972509876543",
      "name": "Mom",
      "language": "hebrew"
    },
    "אמא": {
      "phone": "972509876543",
      "name": "Mom",
      "language": "hebrew"
    },
    "partner": {
      "phone": "972501234567",
      "name": "Partner Name",
      "language": "english"
    }
  }
}
```

You can define multiple aliases for the same person (e.g., one in English and one in Hebrew). The `language` field tells Claude which language to use when drafting messages for that contact.

If a name doesn't match any alias, Claude falls back to searching contacts via the WAHA API.

## Usage

Once installed, Claude Code automatically invokes the skill when you ask it to do anything with WhatsApp. Just talk naturally:

- "Send a message to myself: hello world"
- "Read my last 10 WhatsApp messages"
- "What's new in the family group?"
- "Send this PDF to 972501234567"
- "Message dad: I'll be there at 8"
- "Who joined the event group this week?"

### Autonomous mode

For agents and cron jobs that send notifications without user interaction:

```
/whatsapp autonomous send-message --phone "self" --message "Daily report ready"
```

Autonomous mode only sends to your own number (no approval prompts). Useful for automated daily reports, monitoring alerts, or agent-to-user notifications.

## File Structure

```
claude-code-whatsapp/
├── whatsapp/
│   ├── SKILL.md              # Skill instructions (loaded by Claude Code)
│   ├── config.local.md       # Your personal config (gitignored)
│   ├── config.example.md     # Template for config.local.md
│   └── scripts/
│       ├── wa.sh             # Wrapper script (entry point for all commands)
│       ├── waha-utils.ts     # Shared WAHA API utilities
│       ├── send-message.ts   # Send text messages (individual, group, broadcast)
│       ├── send-image.ts     # Send images with optional caption
│       ├── send-voice.ts     # Send voice notes (auto-converts to OGG)
│       ├── send-file.ts      # Send files — PDF, DOCX, XLSX, etc. (max 100MB)
│       ├── send-contact.ts   # Send contacts (vCard format)
│       ├── get-chat-history.ts    # Read chat/group history
│       ├── get-recent-messages.ts # Recent messages across chats
│       ├── get-contacts.ts        # Search contacts by name
│       ├── get-contact-info.ts    # Get contact details + avatar
│       ├── get-group-members.ts   # List group members with admin status
│       ├── check-instance.ts      # WAHA session management
│       ├── .env                   # WAHA credentials (gitignored)
│       ├── .env.example           # Template for .env
│       ├── contacts-aliases.json      # Contact shortcuts (gitignored)
│       └── contacts-aliases.example.json
├── waha-admin/
│   ├── SKILL.md              # WAHA troubleshooting skill
│   ├── config.local.md       # Host details (gitignored)
│   └── config.example.md     # Template
├── .gitignore
├── README.md
└── LICENSE
```

## Safety

- **Default recipient is you** — messages go to your own number unless you explicitly specify someone else
- **Two-step approval** — Claude asks you to approve the draft, then confirm the send — every time
- **Credentials isolated** — `.env` files are never read or displayed by Claude; scripts load them internally via dotenv
- **Dry run** — all send commands support `--dry-run` to preview without sending
- **Broadcast safeguards** — extra confirmation required for `--dm-all`, with recipient count preview
- **Rate limiting** — 500ms delay between messages in broadcast mode

## License

[MIT](LICENSE)
