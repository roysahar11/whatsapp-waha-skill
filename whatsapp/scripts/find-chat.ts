import { getWahaConfig, wahaFetch } from "./waha-utils";

/**
 * Find a person's 1:1 chat when the contact search can't.
 *
 * WAHA's contact store (NOWEB) is incomplete: address-book names saved after the session was
 * linked often never sync, and 1:1 chats carry no name at all. What every incoming message DOES
 * carry is the sender's own WhatsApp profile name (pushName) — and, of course, its text. This
 * script scans the most recent 1:1 chats and matches on both, plus whatever the contact store has.
 */

interface Args {
  name?: string;
  text?: string;
  chats: number;
  messages: number;
  format: "simple" | "json";
}

interface Hit {
  chatId: string;
  phone?: string;
  names: string[];
  lastActivity: number;
  matchedBy: string[];
  snippets: string[];
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = { chats: 300, messages: 40, format: "simple" };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        result.name = args[++i];
        break;
      case "--text":
        result.text = args[++i];
        break;
      case "--chats":
        result.chats = parseInt(args[++i], 10);
        break;
      case "--messages":
        result.messages = parseInt(args[++i], 10);
        break;
      case "--format":
        result.format = args[++i] === "json" ? "json" : "simple";
        break;
    }
  }

  return result;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function chatIdOf(chat: any): string {
  return String(chat.id?._serialized || chat.id || "");
}

function isDirectChat(id: string): boolean {
  return !!id && !id.endsWith("@g.us") && !id.endsWith("@newsletter") && !id.includes("broadcast");
}

function phoneOf(id: string): string | undefined {
  return /@(c\.us|s\.whatsapp\.net)$/.test(id) ? id.replace(/@.*$/, "") : undefined;
}

function snippet(body: string, query: string): string {
  const flat = body.replace(/\s+/g, " ");
  const at = norm(flat).indexOf(norm(query));
  const start = Math.max(0, at - 60);
  const end = Math.min(flat.length, at + query.length + 60);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

// phone (digits) and lid → names the contact store knows
async function contactNameIndex(): Promise<Map<string, string[]>> {
  const { session } = getWahaConfig();
  const index = new Map<string, string[]>();
  try {
    const contacts = (await wahaFetch(`/api/contacts/all?session=${session}`)) as any[];
    for (const c of contacts) {
      const names = [c.name, c.pushname, c.verifiedName].filter(Boolean);
      if (!names.length) continue;
      const keys = [c.id, c.lid, c.phoneNumber].filter(Boolean).map((k: string) => k.replace(/@(c\.us|s\.whatsapp\.net)$/, ""));
      for (const k of keys) index.set(k, [...(index.get(k) || []), ...names]);
    }
  } catch {
    // Contact store unavailable — pushNames and text still work
  }
  return index;
}

async function scanChat(chat: any, args: Args, index: Map<string, string[]>): Promise<Hit | null> {
  const { session } = getWahaConfig();
  const chatId = chatIdOf(chat);
  const phone = phoneOf(chatId);
  const storeNames = index.get(phone || chatId) || [];

  let msgs: any[] = [];
  try {
    msgs = await wahaFetch(`/api/${session}/chats/${encodeURIComponent(chatId)}/messages?limit=${args.messages}&downloadMedia=false`);
  } catch {
    return null;
  }

  const pushNames = new Set<string>();
  const snippets: string[] = [];
  for (const m of msgs) {
    const pn = m._data?.pushName || m._data?.notifyName;
    if (!m.fromMe && pn) pushNames.add(pn);
    if (args.text && m.body && norm(m.body).includes(norm(args.text)) && snippets.length < 3) {
      snippets.push(snippet(m.body, args.text));
    }
  }

  const names = [...new Set([...storeNames, ...pushNames])];
  const matchedBy: string[] = [];
  if (args.name && names.some((n) => norm(n).includes(norm(args.name!)))) matchedBy.push("name");
  if (snippets.length) matchedBy.push("text");
  if (!matchedBy.length) return null;

  return { chatId, phone, names, lastActivity: chat.conversationTimestamp || 0, matchedBy, snippets };
}

async function main() {
  const args = parseArgs();

  if (!args.name && !args.text) {
    console.error("Find a 1:1 chat by the person's WhatsApp profile name or by message text (WAHA)");
    console.error("");
    console.error("Usage:");
    console.error('  find-chat.ts --name "Noa"');
    console.error('  find-chat.ts --text "acmecorp"');
    console.error('  find-chat.ts --name "נועה" --text "NDA"   # either match counts');
    console.error("");
    console.error("Options:");
    console.error("  --name <TEXT>     Match the contact-store name or the sender's own profile name (pushName)");
    console.error("  --text <TEXT>     Match message text (case-insensitive substring)");
    console.error("  --chats <N>       How many of the most recent 1:1 chats to scan (default: 300)");
    console.error("  --messages <N>    Messages to read per chat (default: 40)");
    console.error("  --format <FMT>    simple (default) or json");
    process.exit(0);
  }

  try {
    const { session } = getWahaConfig();
    const [chats, index] = await Promise.all([
      wahaFetch(`/api/${session}/chats?limit=${args.chats}&sortBy=conversationTimestamp&sortOrder=desc`) as Promise<any[]>,
      contactNameIndex(),
    ]);
    const direct = chats.filter((c) => isDirectChat(chatIdOf(c)));
    console.error(`Scanning ${direct.length} recent 1:1 chats (${args.messages} messages each)...\n`);

    const hits: Hit[] = [];
    for (let i = 0; i < direct.length; i += 8) {
      const batch = await Promise.all(direct.slice(i, i + 8).map((c) => scanChat(c, args, index)));
      hits.push(...(batch.filter(Boolean) as Hit[]));
    }
    hits.sort((a, b) => b.lastActivity - a.lastActivity);

    if (args.format === "json") {
      console.log(JSON.stringify(hits, null, 2));
      return;
    }

    if (!hits.length) {
      console.error("No matching chats.");
      console.error("Try the name in the other script (profile names are often English: 'Noa', not 'נועה'), a distinctive word they wrote,");
      console.error("or widen the scan with --chats / --messages. A person who never messaged you has no pushName.");
      return;
    }

    console.error(`Found ${hits.length} chat(s):\n`);
    for (const h of hits) {
      const when = h.lastActivity ? new Date(h.lastActivity * 1000).toLocaleString("he-IL") : "?";
      console.log(`👤 ${h.names.join(" | ") || "(no name)"}`);
      console.log(`   Chat: ${h.phone || h.chatId}   Last activity: ${when}   Matched by: ${h.matchedBy.join(", ")}`);
      for (const s of h.snippets) console.log(`   › ${s}`);
      console.log(`   Read: "${__dirname}/node_modules/.bin/ts-node" "${__dirname}/get-chat-history.ts" --chat "${h.phone || h.chatId}" --count 50 --format slim-json`);
      console.log("");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
