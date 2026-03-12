import { plugin } from "./src/plugins/browser.ts";

async function test() {
  console.log("Testing browser.navigate('https://example.com')...");
  const result = await plugin.execute({ action: "navigate", url: "https://example.com" });
  console.log("Result:", result);

  console.log("\nTesting browser.snapshot()...");
  const snapshot = await plugin.execute({ action: "snapshot" });
  console.log("Snapshot length:", snapshot.length);
  console.log("Snapshot snippet:", snapshot.substring(0, 100));
}

test().catch(console.error);
