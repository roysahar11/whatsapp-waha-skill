import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import { getWahaConfig, wahaHeaders, resolveRecipient, makeChatId } from "./waha-utils";

interface Args {
  groupId?: string;
  phone?: string;
  audioPath?: string;
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
      case "--audio":
        result.audioPath = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
    }
  }

  return result;
}


function checkFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function convertToOgg(inputPath: string): string {
  const outputPath = inputPath.replace(/\.[^.]+$/, ".ogg");
  execSync(
    `ffmpeg -y -i "${inputPath}" -c:a libopus -b:a 64k -vbr on -compression_level 10 "${outputPath}"`,
    { stdio: "ignore" }
  );
  return outputPath;
}

async function sendVoice(chatId: string, audioPath: string): Promise<string> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/sendVoice`;

  const fileBuffer = fs.readFileSync(audioPath);
  const base64Data = fileBuffer.toString("base64");
  const fileName = path.basename(audioPath);

  const response = await fetch(url, {
    method: "POST",
    headers: wahaHeaders(),
    body: JSON.stringify({
      session,
      chatId,
      file: {
        mimetype: "audio/ogg; codecs=opus",
        data: base64Data,
        filename: fileName,
      },
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

  if (!args.audioPath) {
    console.error("WhatsApp Voice Note Sender (WAHA)");
    console.error("=================================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node send-voice.ts --phone "972501234567" --audio "/path/to/audio.mp3"');
    console.error('  npx ts-node send-voice.ts --group "GROUP_ID" --audio "/path/to/audio.wav"');
    console.error("");
    console.error("Options:");
    console.error("  --phone <NUMBER>  Phone number (972XXXXXXXXX or 05XXXXXXXX)");
    console.error("  --group <ID>      Group ID (format: 120363xxx@g.us)");
    console.error("  --audio <PATH>    Path to audio file (MP3, WAV, M4A, OGG)");
    console.error("  --dry-run         Preview without sending");
    console.error("");
    console.error("Note: Requires ffmpeg installed for audio conversion to OGG format.");
    process.exit(1);
  }

  if (!args.groupId && !args.phone) {
    console.error("Error: Either --group or --phone is required");
    process.exit(1);
  }

  if (!fs.existsSync(args.audioPath)) {
    console.error(`Error: File not found: ${args.audioPath}`);
    process.exit(1);
  }

  if (!checkFfmpeg()) {
    console.error("Error: ffmpeg is required but not installed.");
    console.error("Install with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)");
    process.exit(1);
  }

  try {
    const isGroup = !!args.groupId;
    const chatId = makeChatId(args.groupId || args.phone!, isGroup);

    console.log(`Recipient: ${chatId}`);
    console.log(`Audio: ${args.audioPath}`);
    console.log("");

    if (args.dryRun) {
      console.log("=== DRY RUN MODE ===");
      console.log("✓ [DRY RUN] Would convert and send voice note");
      return;
    }

    // Convert to OGG if not already
    let finalPath = args.audioPath;
    const ext = path.extname(args.audioPath).toLowerCase();

    if (ext !== ".ogg") {
      console.log("Converting to OGG format...");
      finalPath = convertToOgg(args.audioPath);
      console.log(`Converted: ${finalPath}`);
    }

    const msgId = await sendVoice(chatId, finalPath);
    console.log(`✓ Voice note sent! ID: ${msgId}`);

    // Clean up converted file if we created one
    if (finalPath !== args.audioPath && fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
