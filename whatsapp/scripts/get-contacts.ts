import { getWahaConfig, wahaHeaders, wahaFetch } from "./waha-utils";

interface WahaContact {
  id: string;
  name?: string;
  pushname?: string;
  verifiedName?: string;
  lid?: string;
  phoneNumber?: string;
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
  const fields = [contact.name, contact.pushname, contact.verifiedName, contact.id];
  return fields.some((f) => normalizeString(f || "").includes(searchNorm));
}

function isGroupContact(c: WahaContact): boolean {
  return !!c.isGroup || c.id.endsWith("@g.us");
}

// Individual people. Most contacts are now keyed by an @lid id rather than a phone-based
// @c.us one — filtering on "@c.us" alone silently drops most of the address book.
function isUserContact(c: WahaContact): boolean {
  return !isGroupContact(c) && !c.id.endsWith("@newsletter") && !c.id.endsWith("@broadcast");
}

function extractPhoneNumber(id: string): string {
  return id.replace("@c.us", "").replace("@g.us", "");
}

// An @lid id is not a phone number; resolve it through WAHA's LID map.
async function resolveLidPhone(contact: WahaContact): Promise<string | undefined> {
  if (contact.phoneNumber) return contact.phoneNumber.replace(/@.*$/, "");
  try {
    const { session } = getWahaConfig();
    const res = await wahaFetch(`/api/${session}/lids/${encodeURIComponent(contact.id)}`);
    return res?.pn ? String(res.pn).replace(/@.*$/, "") : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs();

  if (process.argv.length === 2) {
    console.error("WhatsApp Contact Search (WAHA)");
    console.error("==============================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node get-contacts.ts --search "ישראל"');
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
    console.error('  npx ts-node get-contacts.ts --search "ישראל ישראלי"');
    console.error('  npx ts-node get-contacts.ts --type group');
    process.exit(0);
  }

  try {
    console.error("Fetching contacts...\n");

    let contacts = await getContacts();

    // Filter by type
    if (args.type && args.type !== "all") {
      contacts = contacts.filter(args.type === "group" ? isGroupContact : isUserContact);
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
      if (args.search) {
        console.error("");
        console.error("WAHA's contact store is incomplete: names saved in the phone's address book after the");
        console.error("session was linked often never sync (NOWEB app-state sync). Search the chats instead:");
        console.error(`  find-chat.ts --name "${args.search}"      # the person's own WhatsApp profile name`);
        console.error('  find-chat.ts --text "<word they used>"   # e.g. their company, a link domain, a topic');
      }
      process.exit(0);
    }

    console.error(`Found ${contacts.length} contact(s):\n`);

    if (args.format === "json") {
      console.log(JSON.stringify(contacts, null, 2));
    } else {
      for (const contact of contacts) {
        const isGroup = isGroupContact(contact);
        const isLid = contact.id.endsWith("@lid");
        const displayName = contact.name || contact.pushname || contact.verifiedName || "(no name)";
        const typeIcon = isGroup ? "👥" : "👤";

        console.log(`${typeIcon} ${displayName}`);
        if (isGroup) {
          console.log(`   Group ID: ${extractPhoneNumber(contact.id)}`);
        } else if (isLid) {
          const phone = await resolveLidPhone(contact);
          console.log(`   Phone: ${phone || "(unknown — use the LID as the chat id)"}`);
          console.log(`   LID: ${contact.id}`);
        } else {
          console.log(`   Phone: ${extractPhoneNumber(contact.id)}`);
        }
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
