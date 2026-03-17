#!/bin/bash
# WhatsApp wrapper script (WAHA)
# Handles directory change and runs the specified script
# Usage: wa.sh <script.ts> [args...]
#
# Examples:
#   wa.sh send-message.ts --phone "972..." --message "Hello"
#   wa.sh get-chat-history.ts --group "120363..." --count 100

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
./node_modules/.bin/ts-node "$@"
