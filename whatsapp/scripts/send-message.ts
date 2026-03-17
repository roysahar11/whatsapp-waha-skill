import { getWahaConfig, wahaHeaders, formatGroupId, resolveRecipient, makeChatId } from "./waha-utils";

const MESSAGE_DELAY_MS = 500;

interface Participant {
  id: string | { _serialized: string; user: string; server: string };
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface GroupData {
  id: any;
  subject: string;
  participants: Participant[];
  groupMetadata?: {
    id: any;
    subject: string;
    participants: Participant[];
  };
}

interface Args {
  groupId?: string;
  phone?: string;
  message?: string;
  dmAll: boolean;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    dmAll: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--group":
        result.groupId = args[++i];
        break;
      case "--phone":
        result.phone = args[++i];
        break;
      case "--message":
        result.message = args[++i];
        break;
      case "--dm-all":
        result.dmAll = true;
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
    }
  }

  return result;
}


async function sendMessage(chatId: string, message: string): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/sendText`;

  const response = await fetch(url, {
    method: "POST",
    headers: wahaHeaders(),
    body: JSON.stringify({ session, chatId, text: message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  const data: any = await response.json();
  return data.id?._serialized || data.id?.id || "sent";
}

async function getGroupData(groupId: string): Promise<GroupData> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/${session}/groups/${groupId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: wahaHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  return response.json() as Promise<GroupData>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { apiUrl } = getWahaConfig();

  const args = parseArgs();

  // Resolve "self", aliases, or pass-through
  if (args.phone) {
    args.phone = await resolveRecipient(args.phone);
  }

  if (!args.message) {
    console.error("WhatsApp Message Sender (WAHA)");
    console.error("==============================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node send-message.ts --phone "972501234567" --message "Hello!"');
    console.error('  npx ts-node send-message.ts --group "GROUP_ID" --message "Hello group!"');
    console.error('  npx ts-node send-message.ts --group "GROUP_ID" --dm-all --message "Personal msg"');
    console.error("");
    console.error("Options:");
    console.error("  --phone <NUMBER>  Phone number (972XXXXXXXXX or 05XXXXXXXX)");
    console.error("  --group <ID>      Group ID (format: 120363xxx@g.us)");
    console.error("  --message <TEXT>  Message text to send");
    console.error("  --dm-all          Send DM to each group participant individually");
    console.error("  --dry-run         Preview recipients without sending");
    process.exit(1);
  }

  if (!args.groupId && !args.phone) {
    console.error("Error: Either --group or --phone is required");
    process.exit(1);
  }

  try {
    if (args.dryRun) {
      console.log("=== DRY RUN MODE - No messages will be sent ===\n");
    }

    // Send to individual phone
    if (args.phone && !args.groupId) {
      const chatId = makeChatId(args.phone, false);
      console.log(`Recipient: ${chatId}`);
      console.log(`Message: ${args.message}\n`);

      if (!args.dryRun) {
        const msgId = await sendMessage(chatId, args.message);
        console.log(`✓ Message sent! ID: ${msgId}`);
      } else {
        console.log("✓ [DRY RUN] Would send message");
      }
      return;
    }

    // Send to group (not DM all)
    if (args.groupId && !args.dmAll) {
      const chatId = makeChatId(args.groupId, true);
      console.log(`Group: ${chatId}`);
      console.log(`Message: ${args.message}\n`);

      if (!args.dryRun) {
        const msgId = await sendMessage(chatId, args.message);
        console.log(`✓ Message sent to group! ID: ${msgId}`);
      } else {
        console.log("✓ [DRY RUN] Would send message to group");
      }
      return;
    }

    // Broadcast DM to all group members
    if (args.groupId && args.dmAll) {
      const groupId = makeChatId(args.groupId, true);
      console.log(`Fetching participants from: ${groupId}\n`);

      const rawData = await getGroupData(groupId);
      const gm = rawData.groupMetadata || rawData;
      const participants = gm.participants || [];
      console.log(`Group name: ${gm.subject}`);
      console.log(`Participants: ${participants.length}\n`);
      console.log(`Message: ${args.message}\n`);
      console.log("---");

      let successCount = 0;
      let failCount = 0;

      for (const participant of participants) {
        const idStr = typeof participant.id === "string" ? participant.id : participant.id._serialized || participant.id.user;
        const phoneNumber = idStr
          .replace("@g.us", "")
          .replace("@s.whatsapp.net", "")
          .replace("@c.us", "")
          .replace("@lid", "");
        const chatId = `${phoneNumber}@c.us`;

        if (args.dryRun) {
          console.log(`[DRY RUN] Would send to: ${chatId}`);
          successCount++;
        } else {
          try {
            const msgId = await sendMessage(chatId, args.message);
            console.log(`✓ Sent to ${chatId} (ID: ${msgId})`);
            successCount++;
            await sleep(MESSAGE_DELAY_MS);
          } catch (error) {
            console.error(`✗ Failed: ${chatId} - ${error}`);
            failCount++;
          }
        }
      }

      console.log("\n=== Summary ===");
      console.log(`Successful: ${successCount}`);
      console.log(`Failed: ${failCount}`);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
