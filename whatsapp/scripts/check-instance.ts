import { getWahaConfig, wahaHeaders } from "./waha-utils";

async function main() {
  const { apiUrl, session } = getWahaConfig();
  const args = process.argv.slice(2);
  const command = args[0] || "settings";

  try {
    if (command === "settings") {
      const url = `${apiUrl}/api/sessions/${session}`;
      const response = await fetch(url, { headers: wahaHeaders() });
      const data = await response.json();

      console.log("Session Settings:");
      console.log(JSON.stringify(data, null, 2));
    }
    else if (command === "state") {
      const url = `${apiUrl}/api/sessions/${session}`;
      const response = await fetch(url, { headers: wahaHeaders() });
      const data: any = await response.json();

      console.log("Session State:");
      console.log(`  Status: ${data.status}`);
      if (data.me) {
        console.log(`  Phone: ${data.me.id}`);
        console.log(`  Push Name: ${data.me.pushName}`);
      }
      console.log(JSON.stringify(data, null, 2));
    }
    else if (command === "reboot") {
      console.log("Restarting session (preserving auth + config + store)...");
      const url = `${apiUrl}/api/sessions/${session}/restart`;
      const response = await fetch(url, {
        method: "POST",
        headers: wahaHeaders(),
      });
      const data = await response.json();

      console.log("Restart response:");
      console.log(JSON.stringify(data, null, 2));
      console.log("\nNote: Wait 30 seconds for session to reconnect.");
    }
    else if (command === "logout") {
      console.log("WARNING: This will log out the session!");
      console.log("You will need to scan QR code again to re-authorize.");
      console.log("\nTo proceed, run: npx ts-node check-instance.ts logout-confirm");
    }
    else if (command === "logout-confirm") {
      const url = `${apiUrl}/api/sessions/${session}`;
      console.log("Deleting session (logout)...");
      const response = await fetch(url, { method: "DELETE", headers: wahaHeaders() });
      const data = await response.json();

      console.log("Logout response:");
      console.log(JSON.stringify(data, null, 2));
      console.log("\nTo reconnect: start WAHA, create a new session, and scan QR code.");
    }
    else {
      console.log("WAHA Instance Diagnostics");
      console.log("=========================");
      console.log("");
      console.log("Usage: npx ts-node check-instance.ts [settings|state|reboot|logout]");
      console.log("");
      console.log("Commands:");
      console.log("  settings    Show session configuration");
      console.log("  state       Show connection state and profile info");
      console.log("  reboot      Restart the session (stop + start)");
      console.log("  logout      Log out (requires QR re-scan)");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
