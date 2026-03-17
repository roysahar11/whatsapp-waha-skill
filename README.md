# Claude Code WhatsApp Skill

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill for sending and reading WhatsApp messages via [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API).

## What It Does

- **Send messages** — text, images, voice notes, files (PDF, DOCX, etc.), contacts
- **Read messages** — chat history, group messages, recent messages across chats
- **Manage contacts** — search, get info, list group members, contact aliases
- **Autonomous mode** — for cron jobs and agents that send notifications without user interaction
- **Safety built in** — default-to-self recipient, two-step send approval, credential isolation

Includes a companion **waha-admin** skill for WAHA infrastructure troubleshooting.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [WAHA](https://waha.devlike.pro/) instance (self-hosted via Docker)
- Node.js (v18+)

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
  -v ./sessions:/tmp/sessions \
  devlikeapro/waha-plus:noweb
```

**Option B: Remote VPS**

Run the same Docker setup on a VPS for 24/7 availability. Any provider works (DigitalOcean, Hetzner, Contabo, etc.).

### 4. Create WAHA session

Create via API to ensure store config is applied correctly:

```bash
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name":"default","start":true,"config":{"noweb":{"store":{"enabled":true,"fullSync":true}}}}'
```

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

## Usage

Once installed, Claude Code automatically invokes the skill when you ask it to do anything with WhatsApp:

- "Send a message to myself: hello world"
- "Read my last 10 WhatsApp messages"
- "Check the messages in group 120363xxx@g.us"
- "Send this PDF to 972501234567"

### Autonomous mode

For agents and cron jobs that send notifications without user interaction:

```
/whatsapp autonomous send-message --phone "self" --message "Daily report ready"
```

Autonomous mode only sends to your own number (no approval prompts).

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
│       ├── send-message.ts   # Send text messages
│       ├── send-image.ts     # Send images
│       ├── send-voice.ts     # Send voice notes
│       ├── send-file.ts      # Send files (PDF, DOCX, etc.)
│       ├── send-contact.ts   # Send contacts (vCard)
│       ├── get-chat-history.ts    # Read chat/group history
│       ├── get-recent-messages.ts # Recent messages across chats
│       ├── get-contacts.ts        # Search contacts
│       ├── get-contact-info.ts    # Get contact details
│       ├── get-group-members.ts   # List group members
│       ├── check-instance.ts      # WAHA session management
│       ├── .env              # WAHA credentials (gitignored)
│       ├── .env.example      # Template for .env
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
- **Two-step approval** — draft approval + send confirmation before any message is sent
- **Credentials isolated** — `.env` files are never read or displayed; scripts load them internally via dotenv
- **Dry run** — all send commands support `--dry-run` to preview without sending

## License

[MIT](LICENSE)
