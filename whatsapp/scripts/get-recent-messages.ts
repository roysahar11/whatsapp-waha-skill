import { getWahaConfig, wahaHeaders, formatChatId, formatGroupId, makeChatId } from "./waha-utils";

interface Args {
  chatId?: string;
  limit: number;
  since: number; // hours
  showAll: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    limit: 50,
    since: 24, // default: last 24 hours
    showAll: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--chat":
      case "--group":
        result.chatId = args[++i];
        break;
      case "--limit":
        result.limit = parseInt(args[++i], 10);
        break;
      case "--since":
        result.since = parseInt(args[++i], 10);
        break;
      case "--all":
        result.showAll = true;
        break;
    }
  }

  return result;
}

function resolveChatId(id: string): string {
  if (id.includes("@")) return id;
  const isGroup = id.startsWith("120363") || id.includes("-");
  return makeChatId(id, isGroup);
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMessageText(msg: any): string {
  if (msg.body) return msg.body;
  if (msg.hasMedia) return `[media: ${msg.media?.mimetype || "file"}]`;
  return `[${msg._data?.type || "unknown"}]`;
}

async function getRecentChats(limit: number): Promise<any[]> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/${session}/chats?limit=${limit}&sortBy=conversationTimestamp&sortOrder=desc`;

  const response = await fetch(url, {
    method: "GET",
    headers: wahaHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  return response.json() as Promise<any[]>;
}

async function getChatMessages(chatId: string, limit: number): Promise<any[]> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/${session}/chats/${chatId}/messages?limit=${limit}&downloadMedia=false`;

  const response = await fetch(url, {
    method: "GET",
    headers: wahaHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  return response.json() as Promise<any[]>;
}

async function main() {
  const args = parseArgs();

  if (!args.chatId && !args.showAll) {
    console.log("Get Recent Messages (WAHA)");
    console.log("==========================");
    console.log("");
    console.log("Usage:");
    console.log('  npx ts-node get-recent-messages.ts --chat "972501234567" --limit 20');
    console.log('  npx ts-node get-recent-messages.ts --group "120363xxx@g.us" --since 48');
    console.log("  npx ts-node get-recent-messages.ts --all --limit 50");
    console.log("");
    console.log("Options:");
    console.log("  --chat <ID>    Filter by chat/group ID");
    console.log("  --group <ID>   Alias for --chat");
    console.log("  --limit <N>    Max messages to show (default: 50)");
    console.log("  --since <H>    Show messages from last H hours (default: 24)");
    console.log("  --all          Show messages from all recent chats");
    console.log("");
    console.log("Note: This queries chat history directly (no notification queue).");
    process.exit(0);
  }

  const cutoffTimestamp = Math.floor(Date.now() / 1000) - args.since * 3600;

  try {
    const messages: Array<{ timestamp: number; type: string; text: string; chatId: string; from: string }> = [];

    if (args.chatId) {
      // Fetch from specific chat
      const targetChat = resolveChatId(args.chatId);
      console.error(`Fetching messages from: ${targetChat}`);
      console.error(`Since: ${args.since} hours ago\n`);

      const chatMessages = await getChatMessages(targetChat, args.limit);

      for (const msg of chatMessages) {
        if (msg.timestamp >= cutoffTimestamp) {
          messages.push({
            timestamp: msg.timestamp,
            type: msg._data?.type || "chat",
            text: getMessageText(msg),
            chatId: targetChat,
            from: msg._data?.notifyName || msg.from || "Unknown",
          });
        }
      }
    } else {
      // Fetch from all recent chats
      console.error("Fetching recent chats...");
      const chats = await getRecentChats(20);
      console.error(`Found ${chats.length} recent chats, fetching messages...\n`);

      for (const chat of chats) {
        const chatId = chat.id?._serialized || chat.id;
        if (!chatId) continue;

        try {
          const chatMessages = await getChatMessages(chatId, Math.min(args.limit, 10));

          for (const msg of chatMessages) {
            if (msg.timestamp >= cutoffTimestamp) {
              messages.push({
                timestamp: msg.timestamp,
                type: msg._data?.type || "chat",
                text: getMessageText(msg),
                chatId,
                from: msg._data?.notifyName || msg.from || "Unknown",
              });
            }
          }
        } catch {
          // Skip chats that fail (e.g., status broadcasts)
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    messages.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    const limited = messages.slice(0, args.limit);

    console.log(`\nFound ${limited.length} messages from the last ${args.since} hours:\n`);

    for (const msg of limited) {
      console.log(`📅 ${formatTimestamp(msg.timestamp)}`);
      console.log(`   From: ${msg.from}`);
      if (!args.chatId) console.log(`   Chat: ${msg.chatId}`);
      console.log(`   ${msg.text.substring(0, 150)}${msg.text.length > 150 ? "..." : ""}`);
      console.log("");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
