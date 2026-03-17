import * as fs from "fs";
import { getWahaConfig, wahaHeaders, formatGroupId } from "./waha-utils";

interface Participant {
  id: string | { _serialized: string; user: string; server: string };
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface GroupData {
  id: any;
  subject: string;
  participants: Participant[];
  groupMetadata?: {
    id: any;
    subject: string;
    participants: Participant[];
  };
}

interface Args {
  groupId?: string;
  format: "phones" | "json";
  outputFile?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    format: "phones",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--group":
        result.groupId = args[++i];
        break;
      case "--format":
        const fmt = args[++i];
        if (fmt === "phones" || fmt === "json") {
          result.format = fmt;
        }
        break;
      case "--output":
        result.outputFile = args[++i];
        break;
    }
  }

  return result;
}

function extractPhoneNumber(participantId: string | { _serialized: string; user: string }): string {
  const idStr = typeof participantId === "string" ? participantId : participantId._serialized || participantId.user;
  return idStr
    .replace("@g.us", "")
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "")
    .replace("@lid", "");
}

async function getGroupData(groupId: string): Promise<GroupData> {
  const { apiUrl, session } = getWahaConfig();
  const url = `${apiUrl}/api/${session}/groups/${groupId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: wahaHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} - ${text}`);
  }

  return response.json() as Promise<GroupData>;
}

async function main() {
  const args = parseArgs();

  if (!args.groupId) {
    console.error("WhatsApp Group Member Extractor (WAHA)");
    console.error("======================================");
    console.error("");
    console.error("Usage:");
    console.error('  npx ts-node get-group-members.ts --group "120363040650557401@g.us"');
    console.error('  npx ts-node get-group-members.ts --group "GROUP_ID" --format json');
    console.error('  npx ts-node get-group-members.ts --group "GROUP_ID" --output members.txt');
    console.error("");
    console.error("Options:");
    console.error("  --group <ID>       Group ID (format: 120363xxx@g.us)");
    console.error("  --format <TYPE>    Output format: phones (default) or json");
    console.error("  --output <FILE>    Save output to file");
    process.exit(1);
  }

  try {
    const groupId = formatGroupId(args.groupId);
    console.error(`Fetching group data for: ${groupId}\n`);

    const rawData = await getGroupData(groupId);
    // Handle nested groupMetadata response
    const gm = rawData.groupMetadata || rawData;
    const subject = gm.subject;
    const participants = gm.participants || [];
    const gId = typeof gm.id === "object" ? gm.id._serialized : gm.id;

    console.error(`Group: ${subject}`);
    console.error(`Members: ${participants.length}\n`);
    console.error("---\n");

    let output: string;

    if (args.format === "json") {
      const members = participants.map((p: Participant) => ({
        phone: extractPhoneNumber(p.id),
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      }));
      output = JSON.stringify(
        {
          groupId: gId,
          groupName: subject,
          memberCount: members.length,
          members,
        },
        null,
        2
      );
    } else {
      output = participants
        .map((p: Participant) => extractPhoneNumber(p.id))
        .join("\n");
    }

    if (args.outputFile) {
      fs.writeFileSync(args.outputFile, output);
      console.error(`✓ Saved to: ${args.outputFile}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
