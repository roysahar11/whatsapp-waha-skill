import * as path from "path";
import * as fs from "fs";
import { getWahaConfig, wahaHeaders, resolveRecipient, makeChatId } from "./waha-utils";

interface Args {
  groupId?: string;
  phone?: string;
  imagePath?: string;
  caption?: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
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
      case "--image":
        result.imagePath = args[++i];
        break;
      case "--caption":
        result.caption = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
    }
  }

  return result;
}


function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function sendImage(
  chatId: string,
  imagePath: string,
  caption?: string
): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/sendImage`;

  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString("base64");
  const fileName = path.basename(imagePath);
  const mimetype = getMimeType(imagePath);

  const response = await fetch(url, {
    method: "POST",
    headers: wahaHeaders(),
    body: JSON.stringify({
      session,
      chatId,
      file: {
        mimetype,
        data: base64Data,
        filename: fileName,
      },
      caption: caption || "",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  const data: any = await response.json();
  return data.id?._serialized || data.id?.id || "sent";
}

async function main() {
  const args = parseArgs();

  // Resolve "self", aliases, or pass-through
  if (args.phone) {
    args.phone = await resolveRecipient(args.phone);
  }

  if (!args.imagePath) {
    console.error("WhatsApp Image Sender (WAHA)");
    console.error("============================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node send-image.ts --phone "972501234567" --image "/path/to/image.jpg"');
    console.error('  npx ts-node send-image.ts --group "GROUP_ID" --image "/path/to/image.jpg" --caption "Check this!"');
    console.error("");
    console.error("Options:");
    console.error("  --phone <NUMBER>   Phone number (972XXXXXXXXX or 05XXXXXXXX)");
    console.error("  --group <ID>       Group ID (format: 120363xxx@g.us)");
    console.error("  --image <PATH>     Path to image file (JPG, PNG, GIF, WebP)");
    console.error("  --caption <TEXT>   Optional caption for the image");
    console.error("  --dry-run          Preview without sending");
    process.exit(1);
  }

  if (!args.groupId && !args.phone) {
    console.error("Error: Either --group or --phone is required");
    process.exit(1);
  }

  if (!fs.existsSync(args.imagePath)) {
    console.error(`Error: File not found: ${args.imagePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(args.imagePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  if (fileSizeMB > 100) {
    console.error(`Error: File too large (${fileSizeMB.toFixed(2)}MB). Max size is 100MB.`);
    process.exit(1);
  }

  try {
    const isGroup = !!args.groupId;
    const chatId = makeChatId(args.groupId || args.phone!, isGroup);

    console.log(`Recipient: ${chatId}`);
    console.log(`Image: ${args.imagePath} (${fileSizeMB.toFixed(2)}MB)`);
    if (args.caption) {
      console.log(`Caption: ${args.caption}`);
    }
    console.log("");

    if (args.dryRun) {
      console.log("=== DRY RUN MODE ===");
      console.log("✓ [DRY RUN] Would send image");
      return;
    }

    const msgId = await sendImage(chatId, args.imagePath, args.caption);
    console.log(`✓ Image sent! ID: ${msgId}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
