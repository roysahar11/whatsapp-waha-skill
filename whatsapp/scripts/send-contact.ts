import { getWahaConfig, wahaHeaders, formatChatId, normalizePhone, resolveRecipient } from "./waha-utils";

const CONTACT_DELAY_MS = 500;

interface ContactToSend {
  phone: string;
  name: string;
}

interface Args {
  recipientPhone?: string;
  contacts: ContactToSend[];
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    contacts: [],
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--to":
        result.recipientPhone = args[++i];
        break;
      case "--contact":
        // Format: "phone:name" e.g. "972501234567:John Doe"
        const [phone, ...nameParts] = args[++i].split(":");
        result.contacts.push({ phone, name: nameParts.join(":") || phone });
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
    }
  }

  return result;
}


async function sendContact(
  chatId: string,
  contact: { fullName: string; phoneNumber: string }
): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/sendContactVcard`;

  const response = await fetch(url, {
    method: "POST",
    headers: wahaHeaders(),
    body: JSON.stringify({
      session,
      chatId,
      contacts: [
        {
          fullName: contact.fullName,
          phoneNumber: contact.phoneNumber,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  const data: any = await response.json();
  return data.id?._serialized || data.id?.id || "sent";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs();

  if (args.contacts.length === 0) {
    console.error("WhatsApp Contact Sender (WAHA)");
    console.error("==============================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node send-contact.ts --to "972501234567" --contact "972509876543:John Doe"');
    console.error('  npx ts-node send-contact.ts --to "972501234567" --contact "972509876543:John" --contact "972508765432:Jane"');
    console.error("");
    console.error("Options:");
    console.error("  --to <NUMBER>       Recipient phone number");
    console.error("  --contact <P:N>     Contact to send (phone:name format), can be repeated");
    console.error("  --dry-run           Preview without sending");
    process.exit(1);
  }

  if (!args.recipientPhone) {
    console.error("Error: --to <recipient phone> is required");
    process.exit(1);
  }

  // Resolve "self", aliases, or pass-through
  args.recipientPhone = await resolveRecipient(args.recipientPhone);

  try {
    if (args.dryRun) {
      console.log("=== DRY RUN MODE - No contacts will be sent ===\n");
    }

    const recipientChatId = formatChatId(normalizePhone(args.recipientPhone));
    console.log(`Sending ${args.contacts.length} contact(s) to: ${recipientChatId}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const contact of args.contacts) {
      const phoneNumber = normalizePhone(contact.phone);

      console.log(`Sending contact: ${contact.name} (${contact.phone})`);

      if (args.dryRun) {
        console.log(`  [DRY RUN] Would send contact`);
        successCount++;
      } else {
        try {
          const msgId = await sendContact(recipientChatId, {
            fullName: contact.name,
            phoneNumber: `+${phoneNumber}`,
          });
          console.log(`  ✓ Sent! ID: ${msgId}`);
          successCount++;

          if (args.contacts.indexOf(contact) < args.contacts.length - 1) {
            await sleep(CONTACT_DELAY_MS);
          }
        } catch (error) {
          console.error(`  ✗ Failed: ${error}`);
          failCount++;
        }
      }
    }

    console.log("\n=== Summary ===");
    console.log(`Sent: ${successCount}`);
    console.log(`Failed: ${failCount}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
