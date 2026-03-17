---
name: whatsapp
description: "WhatsApp integration via WAHA (self-hosted). Use when asked to: read messages, check chat history, get template from WhatsApp, see what's in self-chat, send messages/images/voice notes/files (PDF, documents), search contacts, check contact info, get group members, find who joined a group. Invoke for ANY WhatsApp read/write operation."
---

# WhatsApp Skill (WAHA)

Send and read WhatsApp messages programmatically through a self-hosted WAHA instance.

**First:** Read `config.local.md` in this skill's directory for personal settings (default phone number, integration preferences).

---

## Safety Rules

### Rule 1: DEFAULT RECIPIENT IS THE USER

Always send to the user's own phone number (from `config.local.md`) unless the user explicitly specifies a different recipient AND gives explicit permission.

- If user says "send a message" without specifying recipient → send to their own number
- If user says "test this message" → send to their own number
- If user says "send to the group" → STOP and ask: "Which group? Please confirm you want me to send to others, not just to yourself."

### Rule 2: TWO-STEP APPROVAL REQUIRED

Get explicit approval TWICE before sending any message:

**Step 1 - Draft Approval:**
```
Claude: "Here's the draft message:
---
[MESSAGE CONTENT]
---
Recipient: [PHONE/GROUP]

Do you approve this draft? (yes/no/edit)"
```
→ Wait for user to say "yes", "approved", "looks good", etc.

**Step 2 - Send Confirmation:**
```
Claude: "Ready to send to [RECIPIENT].
Type 'send' to confirm, or 'cancel' to abort."
```
→ ONLY proceed if user types "send", "yes send it", "confirm", or similar explicit confirmation.

Never send without BOTH approvals.

### Rule 3: EXPLICIT PERMISSION FOR NON-SELF RECIPIENTS

To send to anyone other than the user's own number, the user must explicitly say one of:
- "send to [specific number/group]"
- "message [person/group name]"
- "yes, send to others"
- Other clear, explicit instruction naming the recipient

Ambiguous requests = send to self for testing.

### Rule 4: NEVER EXPOSE SECRETS

- Never use `Read`, `cat`, `head`, `tail`, or any tool to view `.env` files
- Never use `echo`, `printf`, or any command that outputs secret values
- Never expose API tokens, credentials, instance IDs, or secrets in the conversation
- Always use the provided TypeScript scripts which handle credentials internally via `dotenv`

---

## Autonomous Mode

**For cron jobs and automated agents** that need to send messages without user interaction.

**Invocation:** `/whatsapp autonomous <operation> <args>`

**Example:**
```
/whatsapp autonomous send-message --phone "self" --message "Daily report ready"
```

### Autonomous Mode Rules

1. **ONLY for self-chat** - Autonomous mode can only send to the user's own number
2. **No two-step approval** - Skip the draft/confirm steps

### When to use Autonomous Mode

- Cron jobs sending daily reports
- Agents sending status updates to the user
- Automated notifications to self-chat

### When NOT to use Autonomous Mode

- Sending to any recipient other than the user
- Interactive sessions where the user can approve
- Bulk/broadcast messages

---

## Prerequisites

1. WAHA instance running and accessible (image `devlikeapro/waha-plus:noweb`, NOWEB engine)
2. WAHA session connected (WhatsApp linked via QR code on the WAHA dashboard)
3. `.env` file configured in the `scripts/` folder (see `.env.example`)

## Running Commands

**Always use the `wa.sh` wrapper script:**

```bash
~/.claude/skills/whatsapp/scripts/wa.sh <script.ts> [args...]
```

This wrapper:
- Handles the directory change automatically
- Loads `.env` from the correct location
- Easier to match in permission rules

---

## Sending Messages

### Send Text Message

```bash
~/.claude/skills/whatsapp/scripts/wa.sh send-message.ts --phone "972501234567" --message "Hello!"
```

**Options:**
- `--phone <NUMBER>` - Send to individual (international format, or "self")
- `--group <ID>` - Send to group (format: 120363xxx@g.us)
- `--message <TEXT>` - Message text
- `--dm-all` - With --group: DM each participant individually
- `--dry-run` - Preview without sending

**Examples:**
```bash
# Single person
~/.claude/skills/whatsapp/scripts/wa.sh send-message.ts --phone "972501234567" --message "Hello!"

# Group message
~/.claude/skills/whatsapp/scripts/wa.sh send-message.ts --group "120363040650557401@g.us" --message "Hello everyone!"

# Broadcast DM to all group members
~/.claude/skills/whatsapp/scripts/wa.sh send-message.ts --group "120363040650557401@g.us" --dm-all --message "Personal message to all"

# Dry run (test without sending)
~/.claude/skills/whatsapp/scripts/wa.sh send-message.ts --phone "972501234567" --message "Test" --dry-run
```

### Send Image

```bash
~/.claude/skills/whatsapp/scripts/wa.sh send-image.ts --phone "972501234567" --image "/path/to/image.jpg" --caption "Check this out!"
```

**Options:**
- `--phone <NUMBER>` or `--group <ID>` - Recipient
- `--image <PATH>` - Path to image file (JPG, PNG, GIF, WebP)
- `--caption <TEXT>` - Optional caption
- `--dry-run` - Preview without sending

### Send Voice Note

```bash
~/.claude/skills/whatsapp/scripts/wa.sh send-voice.ts --phone "972501234567" --audio "/path/to/audio.mp3"
```

**Options:**
- `--phone <NUMBER>` or `--group <ID>` - Recipient
- `--audio <PATH>` - Path to audio file (auto-converts to OGG)
- `--dry-run` - Preview without sending

**Note:** Requires `ffmpeg` installed for audio conversion.

### Send File (PDF, Documents, etc.)

```bash
~/.claude/skills/whatsapp/scripts/wa.sh send-file.ts --phone "972501234567" --file "/path/to/document.pdf"
```

**Options:**
- `--phone <NUMBER>` or `--group <ID>` - Recipient
- `--file <PATH>` - Path to file (PDF, DOCX, XLSX, ZIP, etc.)
- `--caption <TEXT>` - Optional caption/description
- `--filename <NAME>` - Optional custom filename (must include extension)
- `--dry-run` - Preview without sending

**Examples:**
```bash
# Send a PDF document
~/.claude/skills/whatsapp/scripts/wa.sh send-file.ts --phone "972501234567" --file "/path/to/report.pdf" --caption "Here's the report"

# Send to a group with custom filename
~/.claude/skills/whatsapp/scripts/wa.sh send-file.ts --group "120363xxx@g.us" --file "/path/to/data.xlsx" --filename "Q4-Report.xlsx"

# Dry run to preview
~/.claude/skills/whatsapp/scripts/wa.sh send-file.ts --phone "972501234567" --file "/path/to/doc.pdf" --dry-run
```

**Supported formats:** PDF, DOCX, XLSX, PPTX, TXT, ZIP, and more (max 100MB)

### Send Contact (vCard)

```bash
~/.claude/skills/whatsapp/scripts/wa.sh send-contact.ts --to "972501234567" --contact "972509876543:John Doe"
```

**Options:**
- `--to <NUMBER>` - Recipient phone number (or "self")
- `--contact <P:N>` - Contact to send (phone:name format), can be repeated
- `--dry-run` - Preview without sending

---

## Reading Messages

### Get Chat History

Fetch message history from any chat. **Defaults to your own chat** when no arguments provided - useful for reading messages sent to yourself.

```bash
~/.claude/skills/whatsapp/scripts/wa.sh get-chat-history.ts --self --count 10
```

**Options:**
- `--self` - Read from your own chat - **DEFAULT if no chat specified**
- `--chat <NUMBER>` - Read from a specific contact's chat
- `--group <ID>` - Read from a group chat
- `--count <N>` - Number of messages to fetch (default: 100)
- `--format <FMT>` - Output format: simple (default) or json
- `--find-joins` - Find people who joined (for groups)
- `--days <N>` - Filter joins from last N days (default: 21)

**Examples:**
```bash
# Read last 10 messages from your own chat (sent to yourself)
~/.claude/skills/whatsapp/scripts/wa.sh get-chat-history.ts --self --count 10

# Read messages from a specific contact
~/.claude/skills/whatsapp/scripts/wa.sh get-chat-history.ts --chat "972501234567" --count 20

# Read group messages
~/.claude/skills/whatsapp/scripts/wa.sh get-chat-history.ts --group "120363xxx@g.us" --count 50

# Find who joined a group in the last week
~/.claude/skills/whatsapp/scripts/wa.sh get-chat-history.ts --group "120363xxx@g.us" --find-joins --days 7
```

**Use case:** Send a message to yourself on WhatsApp, then use this to read it - useful for sharing example templates, notes, or content you want Claude to use.

### Get Recent Messages

Fetch recent messages across all chats or from a specific chat.

```bash
~/.claude/skills/whatsapp/scripts/wa.sh get-recent-messages.ts --since 24 --limit 20
```

**Options:**
- `--chat <ID>` or `--group <ID>` - Filter by chat/group ID
- `--limit <N>` - Max messages to process (default: 50)
- `--since <HOURS>` - Only show messages from last N hours (default: 24)
- `--all` - Show all message types

---

## Contacts & Groups

### Search Contacts

```bash
~/.claude/skills/whatsapp/scripts/wa.sh get-contacts.ts --search "John"
```

**Options:**
- `--search <NAME>` - Search by name
- `--type <TYPE>` - Filter: user, group, or all (default: all)
- `--limit <N>` - Limit number of results
- `--format <FMT>` - Output: simple (default) or json

**Examples:**
```bash
# Find a contact by name
~/.claude/skills/whatsapp/scripts/wa.sh get-contacts.ts --search "John Smith"

# List all groups
~/.claude/skills/whatsapp/scripts/wa.sh get-contacts.ts --type group

# Find contacts with partial name match
~/.claude/skills/whatsapp/scripts/wa.sh get-contacts.ts --search "John" --type user
```

### Get Contact Info

```bash
~/.claude/skills/whatsapp/scripts/wa.sh get-contact-info.ts --phone "972501234567"
```

**Options:**
- `--phone <NUMBER>` - Single phone number
- `--phones <N1,N2,...>` - Comma-separated phone numbers
- `--format <FMT>` - Output: simple (default) or json
- `--download-avatar` - Download profile picture

### Get Group Members

```bash
~/.claude/skills/whatsapp/scripts/wa.sh get-group-members.ts --group "120363040650557401@g.us"
```

**Options:**
- `--group <ID>` - Group ID
- `--format phones` - Phone numbers only (default)
- `--format json` - Full JSON output
- `--output <FILE>` - Save to file

### Contact Aliases

If the file `scripts/contacts-aliases.json` exists, it contains pre-defined aliases for frequently used contacts with their preferred language settings.

**Structure:**
```json
{
  "aliases": {
    "nickname": {
      "phone": "972501234567",
      "name": "Display Name",
      "language": "english"
    }
  }
}
```

**Workflow for finding contacts:**
1. **FIRST** - Read `contacts-aliases.json` and check if the name matches any alias
2. **IF FOUND** - Use the phone number and language from the alias
3. **IF NOT FOUND** - Then use the `get-contacts.ts` script to search via API

See `contacts-aliases.example.json` for the expected format.

---

## Instance Management

### Check Instance Status

```bash
~/.claude/skills/whatsapp/scripts/wa.sh check-instance.ts [settings|state|reboot|logout]
```

- `settings` (default) - Show full session settings
- `state` - Show connection state
- `reboot` - Stop and restart the session
- `logout` - Disconnect WhatsApp (will need QR scan again)

---

## Personal Integration Preferences

Check `config.local.md` for any personal integration preferences (e.g., a drafting voice/style skill to use when composing messages).

---

## Safety Guidelines

### Sending Safety
1. **DEFAULT TO SELF** - Always send to the user's own number unless explicitly told otherwise
2. **TWO-STEP APPROVAL** - Get draft approval, then send confirmation
3. **NEVER ASSUME RECIPIENTS** - If unclear, ask before sending

### Credential Security
4. **NEVER read .env files** - Use scripts that load credentials via dotenv
5. **NEVER echo/print secrets** - No `echo $TOKEN`, `printf`, or debug output
6. **NEVER expose in conversation** - Don't display API keys, tokens, instance IDs

### Technical Safety
7. **Always use --dry-run first** when testing new recipients or bulk sends
8. **Rate limiting is built-in** (500ms between messages in broadcast mode)
9. **Max 200 messages/day** recommended per number for bulk operations

### Broadcast Safety (--dm-all)
10. **EXTRA CONFIRMATION REQUIRED** for --dm-all broadcasts
11. **Always preview recipient count** before broadcasting
12. **Suggest sending to self first** to verify message content

---

## Phone Number Formats

The scripts auto-normalize phone numbers. Israeli number example:
- `0501234567` → `972501234567`
- `+972501234567` → `972501234567`
- `972501234567` → `972501234567` (unchanged)
- `self` → user's own number (auto-resolved from session)

---

## Troubleshooting & WAHA Management

Use the `/waha-admin` skill for container setup, session management, and error resolution.
