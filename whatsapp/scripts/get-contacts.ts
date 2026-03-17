import { getWahaConfig, wahaHeaders } from "./waha-utils";

interface WahaContact {
  id: string;
  name?: string;
  pushname?: string;
  isGroup?: boolean;
  isMyContact?: boolean;
}

interface Args {
  search?: string;
  type?: "user" | "group" | "all";
  limit?: number;
  format: "simple" | "json";
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    type: "all",
    format: "simple",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--search":
        result.search = args[++i];
        break;
      case "--type":
        const t = args[++i];
        if (t === "user" || t === "group" || t === "all") {
          result.type = t;
        }
        break;
      case "--limit":
        result.limit = parseInt(args[++i], 10);
        break;
      case "--format":
        const f = args[++i];
        if (f === "simple" || f === "json") {
          result.format = f;
        }
        break;
    }
  }

  return result;
}

async function getContacts(): Promise<WahaContact[]> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/contacts/all?session=${session}`;

  const response = await fetch(url, {
    method: "GET",
    headers: wahaHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  return response.json() as Promise<WahaContact[]>;
}

function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

function matchesSearch(contact: WahaContact, search: string): boolean {
  const searchNorm = normalizeString(search);
  const name = normalizeString(contact.name || "");
  const pushname = normalizeString(contact.pushname || "");
  const id = normalizeString(contact.id || "");

  return name.includes(searchNorm) || pushname.includes(searchNorm) || id.includes(searchNorm);
}

function extractPhoneNumber(id: string): string {
  return id.replace("@c.us", "").replace("@g.us", "");
}

async function main() {
  const args = parseArgs();

  if (process.argv.length === 2) {
    console.error("WhatsApp Contact Search (WAHA)");
    console.error("==============================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node get-contacts.ts --search "ערן"');
    console.error('  npx ts-node get-contacts.ts --search "John" --type user');
    console.error('  npx ts-node get-contacts.ts --type group --limit 10');
    console.error("");
    console.error("Options:");
    console.error("  --search <NAME>   Search contacts by name (Hebrew/English)");
    console.error("  --type <TYPE>     Filter: user, group, or all (default: all)");
    console.error("  --limit <N>       Limit results");
    console.error("  --format <FMT>    Output: simple (default) or json");
    console.error("");
    console.error("Examples:");
    console.error('  npx ts-node get-contacts.ts --search "ערן שמשי"');
    console.error('  npx ts-node get-contacts.ts --type group');
    process.exit(0);
  }

  try {
    console.error("Fetching contacts...\n");

    let contacts = await getContacts();

    // Filter by type
    if (args.type && args.type !== "all") {
      if (args.type === "group") {
        contacts = contacts.filter((c) => c.isGroup || c.id.includes("@g.us"));
      } else {
        contacts = contacts.filter((c) => !c.isGroup && c.id.includes("@c.us"));
      }
    }

    // Filter by search term
    if (args.search) {
      contacts = contacts.filter((c) => matchesSearch(c, args.search!));
    }

    // Apply limit
    if (args.limit && args.limit > 0) {
      contacts = contacts.slice(0, args.limit);
    }

    if (contacts.length === 0) {
      console.error("No contacts found matching your criteria.");
      process.exit(0);
    }

    console.error(`Found ${contacts.length} contact(s):\n`);

    if (args.format === "json") {
      console.log(JSON.stringify(contacts, null, 2));
    } else {
      for (const contact of contacts) {
        const phone = extractPhoneNumber(contact.id);
        const isGroup = contact.isGroup || contact.id.includes("@g.us");
        const displayName = contact.name || contact.pushname || "(no name)";
        const typeIcon = isGroup ? "👥" : "👤";

        console.log(`${typeIcon} ${displayName}`);
        console.log(`   ${isGroup ? "Group ID" : "Phone"}: ${phone}`);
        if (contact.pushname && contact.name && contact.pushname !== contact.name) {
          console.log(`   Push name: ${contact.pushname}`);
        }
        console.log("");
      }
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
