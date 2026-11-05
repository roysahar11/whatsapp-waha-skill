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

Use the user's own phone number (from `config.local.md`) when no other recipient is identified. An external recipient may come from the user's request or an explicitly authorized workflow's documented contact; apply Rule 2 to the existing authorization.

- If user says "send a message" without specifying recipient → send to their own number
- If user says "test this message" → send to their own number
- If user says "send to the group" without identifying it → ask which group, then apply Rule 2

### Rule 2: APPROVAL DEPENDS ON THE RECIPIENTS

Apply these rules to every supported message type, including text, images, voice notes, files, and contact cards:

| Destination | Required approvals | Action |
|---|---|---|
| The user's own self-chat | **None** | Send directly within the requested task or workflow. No draft approval or send confirmation is needed, in interactive sessions as well as automated workflows. |
| One person other than the user | **Existing authorization or one new approval** | Send when an applicable prior approval, approved template, or authorized workflow covers this execution (see below). Otherwise, present the message and recipient and ask once. A clear instruction to send specific content to that recipient already counts. |
| Multiple recipients, a group, or a broadcast | **Two** | First obtain approval of the draft and full audience; then obtain a separate final send confirmation. |

Self-chat includes `--phone "self"` and the user's own number from `config.local.md`, after normalizing its format. This exemption does not depend on using autonomous mode or on whether the user is available to respond.

For multiple recipients:

1. **Draft approval:** Show the message and the full recipient list or identified group, including recipient count for broadcasts. Wait for explicit approval.
2. **Send confirmation:** Ask for final confirmation to send that approved message to that audience. Send after confirmation.

Count recipients across the whole requested operation: a group is a multiple-recipient destination, and sending a batch one person at a time still requires the two-step workflow. Reuse approvals already given for the same content and audience.

#### Existing authorization for templates and workflows

Before requesting a new approval, check the user's prior instructions, applicable
standing authorizations, and the invoked skill or workflow. A template approved
**for sending**, or user-authorized instructions in another skill, can already
authorize its prescribed message. Execute within that authorization without
requesting fresh explicit approval for each send. Keep domain-specific approval
rules and templates in their owning skill; this skill applies their authorization.

For a send to one person, confirm that the authorization covers the purpose or
trigger, permitted content or template (including attachments), and recipient or
an explicit recipient-selection rule. Fill factual placeholders from the approved
sources and respect any limits on repetition. A documented recipient-selection
rule can identify the contact for the current task without a new named-recipient
approval each time. A template's existence or approval of its wording alone does
not establish permission to send it.

A clear affirmative response to a combined workflow approval can authorize its
WhatsApp step too; it need not repeat the word WhatsApp. Respect later limits or
revocations. If content, attachments, recipient, or repetition fall outside the
existing scope, ask only for the missing authorization. A one-person authorization
does not cover a group, broadcast, or batch; apply the multiple-recipient rules
above to the full audience.

Make the existing authorization visible to the execution reviewer: cite its
source and date when available, the authorized template or workflow and scope,
and the resolved recipient and selection source. Include any current approval
when relevant; it need not be a new explicit send confirmation. Keep bearer
links and credentials out of explanations and logs. Another skill supplies
authorization only when it records or implements user-granted authority;
its mere instruction to send does not create that authority.

If a reviewer says authorization evidence is missing, recheck the existing
approval and the reviewer's permitted next steps. If an evidence-based retry is
allowed, submit the same action with the omitted authorization evidence instead
of asking the user to repeat it. Honor an explicit block or requirement for new
approval; do not route around it. Report any remaining block accurately.

### Rule 3: MATCH EXTERNAL SENDS TO THEIR AUTHORIZATION

For any destination other than self-chat, resolve the intended person, group, or recipient list and apply Rule 2 using existing authorization first. Ask for new approval only when the available authorization does not cover the send; clarify an unclear recipient rather than guessing.

### Rule 4: NEVER EXPOSE SECRETS

- Never use `Read`, `cat`, `head`, `tail`, or any tool to view `.env` files
- Never use `echo`, `printf`, or any command that outputs secret values
- Never expose API tokens, credentials, instance IDs, or secrets in the conversation
- Always use the provided TypeScript scripts which handle credentials internally via `dotenv`

---

## Autonomous Mode

For cron jobs and automated agents sending messages to the user's own self-chat without user interaction. Self-chat also requires no approval during ordinary interactive use; autonomous mode is not a prerequisite for that exemption.

**Invocation:** `/whatsapp autonomous <operation> <args>`

**Example:**
```
/whatsapp autonomous send-message --phone "self" --message "Daily report ready"
```

This invocation does not expand authorization. External sends follow Rule 2, including applicable standing or workflow authorization; multiple-recipient sends retain their audience-wide approval requirements.

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
1. **DEFAULT TO SELF** - Use self-chat when neither the user nor an authorized workflow identifies an external recipient
2. **REUSE EXISTING AUTHORIZATION** - Follow Rule 2 before asking again: an applicable prior approval, approved sending template, or authorized workflow can cover a send; apply the full-audience rules for groups and batches
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
10. **TWO-STEP APPROVAL** - Apply Rule 2 to the full audience of `--dm-all` broadcasts
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
