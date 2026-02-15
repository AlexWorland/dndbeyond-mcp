/**
 * Playwright script to capture ALL API calls during D&D Beyond character creation.
 *
 * Opens the character builder, lets you complete a character manually,
 * and logs every request to character-service.dndbeyond.com.
 *
 * Usage: npx tsx setup/capture-builder.ts
 *
 * Instructions:
 *   1. Browser opens to the character builder
 *   2. Create a character step-by-step (pick class, race, background, etc.)
 *   3. Complete ALL choices and finish building
 *   4. When done, close the browser or press Ctrl+C
 *   5. All captured API calls are saved to setup/captured-requests.json
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";

const CONFIG_PATH = `${process.env.HOME}/.dndbeyond-mcp/config.json`;
const BUILDER_URL = "https://www.dndbeyond.com/characters/builder";
const OUTPUT_PATH = "setup/captured-requests.json";

interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  body: unknown | null;
  status: number | null;
  responsePreview: string | null;
}

async function main() {
  // Load saved cookies for auth
  const configRaw = await readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(configRaw);
  const cookies = config.cookies;

  if (!cookies || cookies.length === 0) {
    console.error("No cookies found. Run `npm run setup` first.");
    process.exit(1);
  }

  console.error("Launching browser with saved auth...");
  console.error("Create a character through the builder. ALL API calls will be captured.");
  console.error(`Output will be saved to ${OUTPUT_PATH}\n`);

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-first-run",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const context = await browser.newContext();

  // Inject saved cookies
  const playwrightCookies = cookies.map((c: { name: string; value: string }) => ({
    name: c.name,
    value: c.value,
    domain: ".dndbeyond.com",
    path: "/",
  }));
  await context.addCookies(playwrightCookies);

  const page = await context.newPage();
  const captured: CapturedRequest[] = [];

  // Intercept all requests to character-service
  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("character-service.dndbeyond.com")) return;
    if (req.method() === "OPTIONS") return; // Skip CORS preflight

    const entry: CapturedRequest = {
      timestamp: new Date().toISOString(),
      method: req.method(),
      url,
      body: null,
      status: null,
      responsePreview: null,
    };

    // Capture request body for POST/PUT/DELETE
    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method())) {
      try {
        entry.body = JSON.parse(req.postData() || "null");
      } catch {
        entry.body = req.postData();
      }
    }

    captured.push(entry);

    const bodyStr = entry.body ? ` body=${JSON.stringify(entry.body)}` : "";
    console.log(`>> ${req.method()} ${url}${bodyStr}`);
  });

  // Capture response status and preview
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("character-service.dndbeyond.com")) return;
    if (res.request().method() === "OPTIONS") return;

    // Find matching captured request (last one with same URL and method)
    const entry = [...captured].reverse().find(
      (e) => e.url === url && e.method === res.request().method() && e.status === null
    );
    if (!entry) return;

    entry.status = res.status();

    try {
      const text = await res.text();
      // Store first 500 chars as preview
      entry.responsePreview = text.length > 500 ? text.slice(0, 500) + "..." : text;
    } catch {
      entry.responsePreview = "(could not read response)";
    }

    console.log(`<< ${res.status()} ${url}`);
  });

  // Navigate to builder
  await page.goto(BUILDER_URL);

  console.error("\n--- Browser is open. Build your character. ---");
  console.error("--- Close the browser when done.            ---\n");

  // Wait for browser to close
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
  });

  // Save captured requests
  console.error(`\nCaptured ${captured.length} API calls.`);

  // Write summary
  writeFileSync(OUTPUT_PATH, JSON.stringify(captured, null, 2));
  console.error(`Saved to ${OUTPUT_PATH}`);

  // Print summary table
  console.log("\n=== Summary ===");
  const writes = captured.filter((r) => ["POST", "PUT", "DELETE", "PATCH"].includes(r.method));
  for (const req of writes) {
    const path = new URL(req.url).pathname;
    const bodyStr = req.body ? JSON.stringify(req.body) : "";
    console.log(`${req.method} ${path}`);
    if (bodyStr) console.log(`  body: ${bodyStr}`);
    console.log(`  status: ${req.status}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
