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
  // A full chat id (123@lid, 972...@c.us, ...@s.whatsapp.net) passes through verbatim —
  // stripping non-digits first would silently turn "123@lid" into "123@c.us".
  if (phone.includes("@")) return phone;
  const cleaned = phone.replace(/[^0-9]/g, "");
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
  if (id.includes("@")) return id;
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

/**
 * Fetches group participants and returns a LID→phone map.
 */
export async function fetchGroupParticipantMap(groupId: string): Promise<Map<string, string>> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/${session}/groups/${groupId}/participants`;
  const response = await fetch(url, { headers: wahaHeaders() });
  const map = new Map<string, string>();
  if (!response.ok) return map;
  const participants = (await response.json()) as any[];
  for (const p of participants) {
    if (p.id && p.phoneNumber) {
      const phone = p.phoneNumber.replace(/@s\.whatsapp\.net$/, "");
      map.set(p.id, phone);
    }
  }
  return map;
}

/**
 * Fetches all contacts and returns a phone→display name map.
 * Phone keys are digits only (e.g. "972501234567").
 * Display name prefers contact name, then pushname.
 */
export async function fetchContactNameMap(): Promise<Map<string, string>> {
  const { apiUrl, session } = getWahaConfig();
  const map = new Map<string, string>();
  try {
    const url = `${apiUrl}/api/contacts/all?session=${session}`;
    const response = await fetch(url, { headers: wahaHeaders(), signal: AbortSignal.timeout(10000) });
    if (!response.ok) return map;
    const contacts = (await response.json()) as any[];
    for (const c of contacts) {
      const displayName = c.name || c.pushname;
      if (displayName && c.id) {
        const phone = c.id.replace(/@c\.us$/, "");
        map.set(phone, displayName);
      }
    }
  } catch {
    // Timeout or parse error — return empty map, callers fall back to phone numbers
  }
  return map;
}

/**
 * Resolves a message sender to a display name.
 * Priority: "You" (if fromMe) → notifyName → contact name → pushname → phone number → participant LID → msg.from
 */
export function resolveSenderName(
  msg: any,
  participantMap?: Map<string, string>,
  contactNameMap?: Map<string, string>,
): string {
  if (msg.fromMe) return "You";
  if (msg._data?.notifyName) return msg._data.notifyName;

  // For group messages, resolve participant LID → phone → contact name
  const participant = msg.participant || msg._data?.participant;
  if (participant && participantMap) {
    const phone = participantMap.get(participant);
    if (phone) {
      if (contactNameMap) {
        const name = contactNameMap.get(phone);
        if (name) return name;
      }
      return phone;
    }
    return participant;
  }

  // For private chats, try contact name by phone from msg.from
  if (msg.from && contactNameMap) {
    const phone = msg.from.replace(/@c\.us$/, "").replace(/@s\.whatsapp\.net$/, "");
    const name = contactNameMap.get(phone);
    if (name) return name;
  }

  return msg.from || "Unknown";
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
