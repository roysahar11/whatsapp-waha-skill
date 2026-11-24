import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { getWahaConfig, wahaHeaders, makeChatId, resolveRecipient } from "./waha-utils";

interface Args {
  chatId?: string;
  groupId?: string;
  outputDir: string;
  count: number;
  types: string[];
  dryRun: boolean;
  useSelf: boolean;
}

const MEDIA_HKDF_INFO: Record<string, string> = {
  imageMessage: "WhatsApp Image Keys",
  videoMessage: "WhatsApp Video Keys",
  audioMessage: "WhatsApp Audio Keys",
  documentMessage: "WhatsApp Document Keys",
  stickerMessage: "WhatsApp Image Keys",
};

const MEDIA_EXTENSIONS: Record<string, Record<string, string>> = {
  videoMessage: { "video/mp4": ".mp4", "video/3gpp": ".3gp" },
  audioMessage: { "audio/ogg; codecs=opus": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3" },
  imageMessage: { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" },
  documentMessage: {},
  stickerMessage: { "image/webp": ".webp" },
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    outputDir: ".",
    count: 100,
    types: ["videoMessage", "audioMessage", "imageMessage"],
    dryRun: false,
    useSelf: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--chat":
        result.chatId = args[++i];
        break;
      case "--group":
        result.groupId = args[++i];
        break;
      case "--self":
        result.useSelf = true;
        break;
      case "--output":
      case "-o":
        result.outputDir = args[++i];
        break;
      case "--count":
        result.count = parseInt(args[++i], 10);
        break;
      case "--types":
        result.types = args[++i].split(",").map((t) => (t.includes("Message") ? t : t + "Message"));
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
    }
  }
  return result;
}

function decryptMedia(encData: Buffer, mediaKeyBase64: string, mediaType: string): Buffer {
  const mediaKey = Buffer.from(mediaKeyBase64, "base64");
  const info = MEDIA_HKDF_INFO[mediaType];
  if (!info) throw new Error(`Unknown media type: ${mediaType}`);

  const expanded = crypto.hkdfSync("sha256", mediaKey, Buffer.alloc(32), info, 112);
  const expandedBuf = Buffer.from(expanded);

  const iv = expandedBuf.subarray(0, 16);
  const cipherKey = expandedBuf.subarray(16, 48);

  // Strip 10-byte MAC from end of encrypted data
  const fileEnc = encData.subarray(0, encData.length - 10);

  const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
  return Buffer.concat([decipher.update(fileEnc), decipher.final()]);
}

function getExtension(mediaType: string, mimetype: string, filename?: string): string {
  if (filename) {
    const ext = path.extname(filename);
    if (ext) return ext;
  }
  const typeMap = MEDIA_EXTENSIONS[mediaType] || {};
  return typeMap[mimetype] || `.${mimetype.split("/")[1]?.split(";")[0] || "bin"}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  // Use local time, not UTC
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function downloadWithRetry(url: string, retries = 3): Promise<Buffer> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    } catch (e: any) {
      if (attempt === retries) throw e;
      console.error(`  Retry ${attempt}/${retries}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const args = parseArgs();

  if (!args.chatId && !args.groupId && !args.useSelf) {
    console.error("WhatsApp Media Downloader");
    console.error("========================");
    console.error("");
    console.error("Usage:");
    console.error('  download-media.ts --chat "972501234567" -o ./output');
    console.error('  download-media.ts --group "120363xxx@g.us" -o ./output');
    console.error('  download-media.ts --self -o ./output');
    console.error("");
    console.error("Options:");
    console.error("  --chat <NUMBER>   Download from a contact's chat");
    console.error("  --group <ID>      Download from a group chat");
    console.error("  --self            Download from your own chat");
    console.error("  -o, --output DIR  Output directory (default: current dir)");
    console.error("  --count <N>       Number of messages to scan (default: 100)");
    console.error("  --types <TYPES>   Comma-separated media types (default: video,audio,image)");
    console.error("  --dry-run         List media without downloading");
    process.exit(1);
  }

  // Resolve chat ID
  if (args.useSelf && !args.chatId && !args.groupId) {
    const { getOwnPhone } = await import("./waha-utils");
    args.chatId = process.env.WAHA_DEFAULT_PHONE || (await getOwnPhone());
  }
  if (args.chatId) {
    args.chatId = await resolveRecipient(args.chatId);
  }

  const chatId = args.groupId ? makeChatId(args.groupId, true) : makeChatId(args.chatId!, false);

  // Ensure output directory exists
  if (!args.dryRun) {
    fs.mkdirSync(args.outputDir, { recursive: true });
  }

  // Fetch messages
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/${session}/chats/${chatId}/messages?limit=${args.count}&downloadMedia=false`;
  console.error(`Fetching up to ${args.count} messages from ${chatId}...`);

  const resp = await fetch(url, { headers: wahaHeaders() });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text}`);
  }
  const messages = (await resp.json()) as any[];

  // Find all media messages
  const mediaMessages: Array<{
    id: string;
    timestamp: number;
    fromMe: boolean;
    mediaType: string;
    mediaData: any;
    senderName: string;
  }> = [];

  for (const msg of messages) {
    const msgContent = msg._data?.message || {};
    for (const mediaType of args.types) {
      const mediaData = msgContent[mediaType];
      if (mediaData && mediaData.url && mediaData.mediaKey) {
        mediaMessages.push({
          id: msg.id,
          timestamp: msg.timestamp || msg._data?.messageTimestamp,
          fromMe: !!msg.fromMe,
          mediaType,
          mediaData,
          senderName: msg.fromMe ? "you" : (msg._data?.pushName || "contact"),
        });
      }
    }
  }

  console.error(`Found ${mediaMessages.length} media files to download.\n`);

  if (mediaMessages.length === 0) {
    console.log("No media files found matching the specified types.");
    return;
  }

  // Sort by timestamp (oldest first)
  mediaMessages.sort((a, b) => a.timestamp - b.timestamp);

  // Process each media message
  let downloaded = 0;
  let failed = 0;
  const results: Array<{ file: string; type: string; duration?: number; timestamp: number }> = [];

  for (const media of mediaMessages) {
    const { mediaData, mediaType } = media;
    const mimetype = mediaData.mimetype || "";
    const ext = getExtension(mediaType, mimetype, mediaData.fileName);
    const seconds = mediaData.seconds || 0;
    const fileSize = mediaData.fileLength || 0;
    const ts = formatTimestamp(media.timestamp);
    const direction = media.fromMe ? "sent" : "recv";
    const typeName = mediaType.replace("Message", "");

    // Extract short ID from message ID for uniqueness
    const shortId = media.id.split("_").pop()?.substring(0, 6) || "";
    const filename = `${ts}_${direction}_${typeName}_${shortId}${ext}`;

    if (args.dryRun) {
      const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
      console.log(`${filename}  (${sizeMB}MB, ${seconds}s, ${mimetype})`);
      continue;
    }

    const outPath = path.join(args.outputDir, filename);

    // Skip if already downloaded
    if (fs.existsSync(outPath)) {
      console.log(`✓ SKIP (exists): ${filename}`);
      results.push({ file: filename, type: typeName, duration: seconds, timestamp: media.timestamp });
      downloaded++;
      continue;
    }

    try {
      process.stdout.write(`↓ ${filename}...`);

      // Download encrypted data
      const encData = await downloadWithRetry(mediaData.url);

      // Decrypt
      const mediaKeyBase64 = mediaData.mediaKey.data || mediaData.mediaKey;
      const decrypted = decryptMedia(encData, mediaKeyBase64, mediaType);

      // Save
      fs.writeFileSync(outPath, decrypted);
      const sizeMB = (decrypted.length / 1024 / 1024).toFixed(1);
      console.log(` ✓ ${sizeMB}MB`);

      results.push({ file: filename, type: typeName, duration: seconds, timestamp: media.timestamp });
      downloaded++;
    } catch (e: any) {
      console.log(` ✗ ${e.message}`);
      failed++;
    }
  }

  if (!args.dryRun) {
    console.log(`\nDone: ${downloaded} downloaded, ${failed} failed.`);

    // Write manifest
    const manifestPath = path.join(args.outputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
    console.log(`Manifest saved to: ${manifestPath}`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
