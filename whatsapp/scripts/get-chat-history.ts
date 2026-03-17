import { getWahaConfig, wahaHeaders, formatChatId, makeChatId, getOwnPhone } from "./waha-utils";

interface Args {
  groupId?: string;
  chatId?: string;
  count: number;
  findJoins: boolean;
  days: number;
  since?: number;
  format: "simple" | "json" | "slim-json";
  useSelf: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    count: 100,
    findJoins: false,
    days: 21,
    format: "simple",
    useSelf: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--group":
        result.groupId = args[++i];
        break;
      case "--chat":
        result.chatId = args[++i];
        break;
      case "--self":
        result.useSelf = true;
        break;
      case "--count":
        result.count = parseInt(args[++i], 10);
        break;
      case "--find-joins":
        result.findJoins = true;
        break;
      case "--days":
        result.days = parseInt(args[++i], 10);
        break;
      case "--format":
        result.format = args[++i] as "simple" | "json" | "slim-json";
        break;
      case "--since":
        result.since = parseInt(args[++i], 10);
        break;
    }
  }

  return result;
}


async function getChatHistory(chatId: string, count: number, since?: number): Promise<any[]> {
  const { apiUrl, session } = getWahaConfig();
  let url = `${apiUrl}/api/${session}/chats/${chatId}/messages?limit=${count}&downloadMedia=false`;
  if (since) {
    url += `&filter.timestamp.gte=${since}`;
  }

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

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isWithinDays(timestamp: number, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return timestamp * 1000 >= cutoff;
}

function getMessageText(msg: any): string {
  return msg.body || "";
}

function getMessageType(msg: any): string {
  return msg._data?.type || msg.type || "unknown";
}

function getSenderName(msg: any): string {
  return msg._data?.notifyName || msg.from || "Unknown";
}

async function main() {
  const args = parseArgs();

  if (!args.groupId && !args.chatId && !args.useSelf) {
    console.error("Chat History Fetcher (WAHA)");
    console.error("===========================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node get-chat-history.ts --self --count 10');
    console.error('  npx ts-node get-chat-history.ts --chat "972501234567" --count 20');
    console.error('  npx ts-node get-chat-history.ts --group "120363xxx@g.us" --count 100');
    console.error('  npx ts-node get-chat-history.ts --group "120363xxx@g.us" --find-joins --days 21');
    console.error("");
    console.error("Options:");
    console.error("  --self            Read messages from your own chat (default if no other option)");
    console.error("  --chat <ID>       Chat ID (individual phone number)");
    console.error("  --group <ID>      Group ID");
    console.error("  --count <N>       Number of messages to fetch (default: 100)");
    console.error("  --find-joins      Find people who joined the group");
    console.error("  --days <N>        Filter joins from last N days (default: 21)");
    console.error("  --since <EPOCH>   Server-side filter: only messages after this Unix timestamp");
    console.error("  --format <FMT>    Output format: simple (default), json, or slim-json");
    console.error("                    slim-json: compact format with only key fields (body, sender, type, media)");
    console.error("");
    console.error("Defaulting to self chat...");
    console.error("");
    args.useSelf = true;
  }

  try {
    if (args.useSelf && !args.chatId && !args.groupId) {
      args.chatId = process.env.WAHA_DEFAULT_PHONE || await getOwnPhone();
    }

    const chatId = args.groupId
      ? makeChatId(args.groupId, true)
      : makeChatId(args.chatId!, false);

    console.error(`Fetching chat history from: ${chatId}`);
    console.error(`Fetching up to ${args.count} messages...\n`);

    const messages = await getChatHistory(chatId, args.count, args.since);

    if (args.findJoins) {
      const joinMessages = messages.filter((msg) => {
        const msgType = getMessageType(msg);
        const body = msg.body || "";

        const isJoinEvent =
          msgType === "gp2" ||
          msgType === "notification" ||
          msgType === "e2e_notification" ||
          body.includes("joined") ||
          body.includes("הצטרף") ||
          body.includes("הצטרפה") ||
          body.includes("added") ||
          body.includes("הוסיף") ||
          (msg._data?.type === "gp2" && (
            msg._data?.subtype === "invite" ||
            msg._data?.subtype === "add"
          ));

        const withinDateRange = isWithinDays(msg.timestamp, args.days);
        return isJoinEvent && withinDateRange;
      });

      if (args.format === "json") {
        console.log(JSON.stringify(joinMessages, null, 2));
      } else {
        console.log(`Found ${joinMessages.length} join events in the last ${args.days} days:\n`);
        for (const msg of joinMessages) {
          console.log(`📅 ${formatTimestamp(msg.timestamp)}`);
          if (msg._data?.recipients) {
            for (const r of msg._data.recipients) {
              console.log(`   Phone: ${r._serialized || r}`);
            }
          }
          if (msg.from) {
            console.log(`   From: ${msg.from}`);
          }
          const body = getMessageText(msg);
          if (body) {
            console.log(`   Message: ${body}`);
          }
          console.log(`   Type: ${getMessageType(msg)}`);
          console.log("");
        }
      }
    } else {
      if (args.format === "json") {
        console.log(JSON.stringify(messages, null, 2));
      } else if (args.format === "slim-json") {
        const slim = messages.map((msg) => ({
          timestamp: msg.timestamp,
          body: msg.body || "",
          senderName: getSenderName(msg),
          type: getMessageType(msg),
          hasMedia: !!msg.hasMedia,
          fileName: msg.media?.filename || msg._data?.filename || null,
          downloadUrl: msg.mediaUrl || null,
          caption: msg._data?.caption || null,
          mimeType: msg.media?.mimetype || msg._data?.mimetype || null,
        }));
        console.log(JSON.stringify(slim, null, 2));
      } else {
        console.log(`Found ${messages.length} messages:\n`);
        for (const msg of messages) {
          const text = getMessageText(msg) || `[${getMessageType(msg)}]`;
          console.log(`📅 ${formatTimestamp(msg.timestamp)}`);
          console.log(`   From: ${getSenderName(msg)}`);
          console.log(`   Type: ${getMessageType(msg)}`);
          console.log(`   ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}`);
          if (msg.hasMedia && msg.media?.filename) {
            console.log(`   File: ${msg.media.filename}${msg.media.mimetype ? ` (${msg.media.mimetype})` : ""}`);
          }
          console.log("");
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
