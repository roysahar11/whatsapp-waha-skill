import * as path from "path";
import * as fs from "fs";
import { getWahaConfig, wahaHeaders, resolveRecipient, makeChatId } from "./waha-utils";

interface Args {
  groupId?: string;
  phone?: string;
  filePath?: string;
  caption?: string;
  fileName?: string;
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
      case "--file":
        result.filePath = args[++i];
        break;
      case "--caption":
        result.caption = args[++i];
        break;
      case "--filename":
        result.fileName = args[++i];
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
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
    ".7z": "application/x-7z-compressed",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function sendFile(
  chatId: string,
  filePath: string,
  caption?: string,
  customFileName?: string
): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/sendFile`;

  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString("base64");
  const fileName = customFileName || path.basename(filePath);
  const mimetype = getMimeType(filePath);

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

  if (!args.filePath) {
    console.error("WhatsApp File Sender (WAHA)");
    console.error("===========================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node send-file.ts --phone "972501234567" --file "/path/to/document.pdf"');
    console.error('  npx ts-node send-file.ts --group "GROUP_ID" --file "/path/to/file.docx" --caption "Here is the document"');
    console.error("");
    console.error("Options:");
    console.error("  --phone <NUMBER>     Phone number (972XXXXXXXXX or 05XXXXXXXX)");
    console.error("  --group <ID>         Group ID (format: 120363xxx@g.us)");
    console.error("  --file <PATH>        Path to file (PDF, DOCX, XLSX, ZIP, etc.)");
    console.error("  --caption <TEXT>     Optional caption/description for the file");
    console.error("  --filename <NAME>    Optional custom filename (must include extension)");
    console.error("  --dry-run            Preview without sending");
    console.error("");
    console.error("Supported file types: PDF, DOCX, XLSX, PPTX, TXT, ZIP, and more (max 100MB)");
    process.exit(1);
  }

  if (!args.groupId && !args.phone) {
    console.error("Error: Either --group or --phone is required");
    process.exit(1);
  }

  if (!fs.existsSync(args.filePath)) {
    console.error(`Error: File not found: ${args.filePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(args.filePath);
  const fileSizeMB = stats.size / (1024 * 1024);
  if (fileSizeMB > 100) {
    console.error(`Error: File too large (${fileSizeMB.toFixed(2)}MB). Max size is 100MB.`);
    process.exit(1);
  }

  try {
    const isGroup = !!args.groupId;
    const chatId = makeChatId(args.groupId || args.phone!, isGroup);
    const displayFileName = args.fileName || path.basename(args.filePath);

    console.log(`Recipient: ${chatId}`);
    console.log(`File: ${args.filePath} (${fileSizeMB.toFixed(2)}MB)`);
    console.log(`Filename: ${displayFileName}`);
    if (args.caption) {
      console.log(`Caption: ${args.caption}`);
    }
    console.log("");

    if (args.dryRun) {
      console.log("=== DRY RUN MODE ===");
      console.log("✓ [DRY RUN] Would send file");
      return;
    }

    const msgId = await sendFile(chatId, args.filePath, args.caption, args.fileName);
    console.log(`✓ File sent! ID: ${msgId}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
