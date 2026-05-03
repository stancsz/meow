import { BrowserOSManager, getBrowserOSManager, resetBrowserOSManager } from "./src/agent/browseros_manager";

async function testAutoStart() {
  console.log("=== BrowserOS Auto-Start Test ===\n");

  // Reset singleton for clean test
  resetBrowserOSManager();

  console.log("Step 1: Creating BrowserOSManager (BrowserOS is currently OFF)...");
  const mgr = new BrowserOSManager();

  console.log("Step 2: Checking status (should be disconnected)...");
  const status = await mgr.checkStatus();
  console.log(`  Connected: ${status.connected}`);
  console.log(`  Browser open: ${status.browserOpen}`);
  console.log(`  CDP connected: ${status.cdpConnected}`);

  console.log("\nStep 3: Calling ensureRunning() - should auto-start...");
  const readyStatus = await mgr.ensureRunning();
  console.log(`  Result: ${readyStatus.connected ? "SUCCESS" : "FAILED"}`);
  console.log(`  Server URL: ${readyStatus.serverUrl}`);
  console.log(`  CDP: ${readyStatus.cdpConnected}`);

  console.log("\nStep 4: Verify with browseros-cli status...");
  const { execSync } = await import("child_process");
  try {
    const statusOutput = execSync("browseros-cli status", { encoding: "utf-8" });
    console.log(statusOutput);
  } catch (e) {
    console.error("CLI check failed:", e);
  }

  console.log("\n=== Test Complete ===");
}

testAutoStart().catch(console.error);