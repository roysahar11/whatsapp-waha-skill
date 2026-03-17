import * as fs from "fs";
import { getWahaConfig, wahaHeaders, normalizePhone, formatChatId } from "./waha-utils";

interface Args {
  phones: string[];
  format: "simple" | "json";
  downloadAvatar: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    phones: [],
    format: "simple",
    downloadAvatar: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--phone":
        result.phones.push(args[++i]);
        break;
      case "--phones":
        result.phones.push(...args[++i].split(",").map((p) => p.trim()));
        break;
      case "--format":
        const f = args[++i];
        if (f === "simple" || f === "json") {
          result.format = f;
        }
        break;
      case "--download-avatar":
        result.downloadAvatar = true;
        break;
    }
  }

  return result;
}


// Cache for /api/contacts/all (loaded once, only when pushname is needed)
let allContactsCache: any[] | null = null;

async function loadAllContacts(): Promise<any[]> {
  if (allContactsCache) return allContactsCache;
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/contacts/all?session=${session}`;
  const response = await fetch(url, { headers: wahaHeaders() });
  if (!response.ok) return [];
  allContactsCache = await response.json() as any[];
  return allContactsCache;
}

async function getContactInfo(chatId: string): Promise<any> {
  const { apiUrl, session } = getWahaConfig();

  // Step 1: Get contact name from /api/contacts (accurate per-contact lookup)
  const url = `${apiUrl}/api/contacts?session=${session}&contactId=${chatId}`;
  const response = await fetch(url, { headers: wahaHeaders() });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }
  const contact: any = await response.json();

  // Step 2: Look up pushname from /api/contacts/all (only source for pushname)
  const allContacts = await loadAllContacts();
  const match = allContacts.find((c: any) => c.id === chatId);
  if (match?.pushname) {
    contact.pushname = match.pushname;
  }

  return contact;
}

async function getProfilePicture(chatId: string): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/contacts/profile-picture?session=${session}&contactId=${chatId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: wahaHeaders(),
  });

  if (!response.ok) return "";

  const data: any = await response.json();
  return data.profilePictureURL || data.url || "";
}

async function downloadAvatar(url: string, phone: string): Promise<string | null> {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const filePath = `/tmp/avatar_${phone}.jpg`;
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return filePath;
  } catch (error) {
    console.error(`Failed to download avatar for ${phone}:`, error);
    return null;
  }
}

async function main() {
  const args = parseArgs();

  if (args.phones.length === 0) {
    console.error("WhatsApp Contact Info Lookup (WAHA)");
    console.error("===================================");
    console.error("");
    console.error("Get WhatsApp profile information for any phone number.");
    console.error("Includes pushname (WhatsApp profile name) - key improvement over GreenAPI!");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node get-contact-info.ts --phone "972501234567"');
    console.error('  npx ts-node get-contact-info.ts --phones "972501234567,972509876543"');
    console.error('  npx ts-node get-contact-info.ts --phone "0501234567" --download-avatar');
    console.error('  npx ts-node get-contact-info.ts --phone "0501234567" --format json');
    console.error("");
    console.error("Options:");
    console.error("  --phone <NUMBER>      Single phone number");
    console.error("  --phones <LIST>       Comma-separated phone numbers");
    console.error("  --download-avatar     Download profile photos to /tmp/avatar_PHONE.jpg");
    console.error("  --format <FMT>        Output: simple (default) or json");
    process.exit(0);
  }

  const results: Array<{
    phone: string;
    name: string;
    pushname: string;
    isBusiness: boolean;
    avatar: string;
    avatarPath: string | null;
  }> = [];

  for (const phone of args.phones) {
    try {
      const chatId = formatChatId(normalizePhone(phone));
      const normalizedPhone = normalizePhone(phone);

      const info = await getContactInfo(chatId);
      const avatarUrl = await getProfilePicture(chatId);

      let avatarPath: string | null = null;
      if (args.downloadAvatar && avatarUrl) {
        avatarPath = await downloadAvatar(avatarUrl, normalizedPhone);
      }

      results.push({
        phone: normalizedPhone,
        name: info?.name || "",
        pushname: info?.pushname || "",
        isBusiness: info?.isBusiness || false,
        avatar: avatarUrl,
        avatarPath,
      });

      // Small delay between requests
      if (args.phones.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`Error fetching info for ${phone}:`, error);
      results.push({
        phone: normalizePhone(phone),
        name: "",
        pushname: "",
        isBusiness: false,
        avatar: "",
        avatarPath: null,
      });
    }
  }

  if (args.format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log("");
    for (const r of results) {
      const displayName = r.name || r.pushname || "(no name)";
      const business = r.isBusiness ? " [Business]" : "";
      console.log(`📱 ${r.phone}`);
      console.log(`   Name: ${displayName}${business}`);
      if (r.pushname && r.name && r.pushname !== r.name) {
        console.log(`   Push name: ${r.pushname}`);
      } else if (r.pushname && !r.name) {
        console.log(`   Push name: ${r.pushname}`);
      }
      if (r.avatarPath) {
        console.log(`   Avatar: ✓ Downloaded to ${r.avatarPath}`);
      } else if (r.avatar) {
        console.log(`   Avatar: Available (use --download-avatar to download)`);
      } else {
        console.log(`   Avatar: None`);
      }
      console.log("");
    }
  }
}

main();
