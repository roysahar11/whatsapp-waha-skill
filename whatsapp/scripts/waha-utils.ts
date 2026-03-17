import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, ".env") });

export function getWahaConfig() {
  return {
    apiUrl: process.env.WAHA_API_URL || "http://localhost:3000",
    session: process.env.WAHA_SESSION || "default",
    apiKey: process.env.WAHA_API_KEY,
  };
}

export function wahaHeaders(): Record<string, string> {
  const { apiKey } = getWahaConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;
  return headers;
}

export function formatChatId(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.includes("@")) return cleaned;
  return `${cleaned}@c.us`;
}

export function formatGroupId(groupId: string): string {
  if (groupId.includes("@")) return groupId;
  return `${groupId}@g.us`;
}

export function resolveAlias(nameOrPhone: string): { phone: string; name?: string } | null {
  try {
    const aliasFile = require(path.join(__dirname, "contacts-aliases.json"));
    const lower = nameOrPhone.toLowerCase();
    for (const [alias, data] of Object.entries(aliasFile.aliases)) {
      if (alias.toLowerCase() === lower) {
        const d = data as { phone: string; name: string };
        return { phone: d.phone, name: d.name };
      }
    }
  } catch {}
  return null;
}

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) {
    // Already in international format
  } else if (digits.startsWith("0")) {
    digits = "972" + digits.substring(1);
  } else if (digits.length === 9) {
    digits = "972" + digits;
  }
  return digits;
}

export function makeChatId(id: string, isGroup: boolean): string {
  if (isGroup) return formatGroupId(id);
  return formatChatId(normalizePhone(id));
}

/**
 * Resolves a phone argument: handles "self", aliases, and pass-through.
 * Returns the resolved phone number (digits only).
 */
export async function resolveRecipient(phoneArg: string): Promise<string> {
  if (phoneArg.toLowerCase() === "self") {
    return await getOwnPhone();
  }
  const alias = resolveAlias(phoneArg);
  if (alias) {
    console.log(`Resolved alias "${phoneArg}" → ${alias.name} (${alias.phone})`);
    return alias.phone;
  }
  return phoneArg;
}

export async function getOwnPhone(): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const response = await fetch(`${apiUrl}/api/sessions/${session}`, {
    headers: wahaHeaders(),
  });
  if (!response.ok) throw new Error("Failed to get session info");
  const data: any = await response.json();
  // me.id is like "972XXXXXXXXX@c.us"
  return data.me?.id?.replace(/@c\.us$/, "") || "";
}

export async function wahaFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const { apiUrl } = getWahaConfig();
  const url = `${apiUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: { ...wahaHeaders(), ...options.headers },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WAHA API error ${response.status}: ${text}`);
  }
  return response.json();
}
