/**
 * Playwright script to systematically explore D&D Beyond character sheet
 * and builder pages, clicking through every UI section to discover all
 * API endpoints.
 *
 * Usage: npx tsx setup/explore-endpoints.ts [characterId]
 *
 * If no characterId provided, uses the first character found.
 */
import { chromium, Page } from "playwright";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";

const CONFIG_PATH = `${process.env.HOME}/.dndbeyond-mcp/config.json`;
const OUTPUT_PATH = "setup/explored-endpoints.json";

interface CapturedRequest {
  timestamp: string;
  method: string;
  url: string;
  path: string;
  body: unknown | null;
  status: number | null;
  source: string; // which exploration step triggered this
}

const captured: CapturedRequest[] = [];
const seenEndpoints = new Set<string>();
let currentSource = "init";

function setupCapture(page: Page) {
  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("character-service.dndbeyond.com") &&
        !url.includes("monster-service.dndbeyond.com") &&
        !url.includes("dndbeyond.com/api/")) return;
    if (req.method() === "OPTIONS") return;

    const path = new URL(url).pathname;
    const key = `${req.method()} ${path}`;
    const isNew = !seenEndpoints.has(key);
    seenEndpoints.add(key);

    const entry: CapturedRequest = {
      timestamp: new Date().toISOString(),
      method: req.method(),
      url,
      path,
      body: null,
      status: null,
      source: currentSource,
    };

    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method())) {
      try {
        entry.body = JSON.parse(req.postData() || "null");
      } catch {
        entry.body = req.postData();
      }
    }

    captured.push(entry);
    const marker = isNew ? "  [NEW]" : "";
    console.log(`${currentSource}: ${req.method()} ${path}${marker}`);
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("character-service.dndbeyond.com") &&
        !url.includes("monster-service.dndbeyond.com") &&
        !url.includes("dndbeyond.com/api/")) return;
    if (res.request().method() === "OPTIONS") return;

    const entry = [...captured].reverse().find(
      (e) => e.url === url && e.method === res.request().method() && e.status === null
    );
    if (entry) entry.status = res.status();
  });
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeClick(page: Page, selector: string, label: string) {
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 2000 })) {
      await el.click();
      await wait(1500); // wait for API calls
      return true;
    }
  } catch { /* element not found */ }
  console.log(`  (skip: ${label} not found)`);
  return false;
}

async function exploreCharacterSheet(page: Page, charId: number) {
  console.log(`\n=== Exploring Character Sheet: ${charId} ===\n`);

  currentSource = "sheet:load";
  await page.goto(`https://www.dndbeyond.com/characters/${charId}`, { waitUntil: "domcontentloaded" });
  await wait(2000);

  // Click through main tabs
  const tabs = [
    { sel: '[data-testid="tab-actions"]', label: "Actions tab" },
    { sel: '[data-testid="tab-spells"]', label: "Spells tab" },
    { sel: '[data-testid="tab-inventory"]', label: "Inventory tab" },
    { sel: '[data-testid="tab-features"]', label: "Features tab" },
    { sel: '[data-testid="tab-background"]', label: "Background tab" },
    { sel: '[data-testid="tab-notes"]', label: "Notes tab" },
    { sel: '[data-testid="tab-extras"]', label: "Extras tab" },
  ];

  for (const tab of tabs) {
    currentSource = `sheet:${tab.label}`;
    await safeClick(page, tab.sel, tab.label);
  }

  // Try common tab patterns (DDB uses various selector patterns)
  const tabPatterns = [
    "button:has-text('Actions')",
    "button:has-text('Spells')",
    "button:has-text('Inventory')",
    "button:has-text('Features & Traits')",
    "button:has-text('Features')",
    "button:has-text('Background')",
    "button:has-text('Notes')",
    "button:has-text('Extras')",
    "button:has-text('Description')",
    "button:has-text('Equipment')",
    "button:has-text('Proficiencies')",
  ];

  for (const pattern of tabPatterns) {
    currentSource = `sheet:tab:${pattern}`;
    await safeClick(page, pattern, pattern);
  }

  // Try clicking on various interactive elements
  const interactions = [
    { sel: ".ct-character-header-desktop__button--manage", label: "Manage button" },
    { sel: ".ct-character-header-desktop__button--level-up", label: "Level up button" },
    { sel: "button:has-text('Manage')", label: "Manage btn" },
    { sel: "button:has-text('Short Rest')", label: "Short Rest" },
    { sel: "button:has-text('Long Rest')", label: "Long Rest" },
    { sel: "button:has-text('Settings')", label: "Settings" },
    { sel: "button:has-text('Preferences')", label: "Preferences" },
    { sel: ".ct-health-manager__button", label: "Health manager" },
    { sel: ".ct-conditions__toggle", label: "Conditions toggle" },
    { sel: ".ct-inspiration__button", label: "Inspiration" },
    { sel: ".ct-combat__summary-group--hp", label: "HP section" },
    { sel: ".ct-combat__summary-group--ac", label: "AC section" },
  ];

  for (const item of interactions) {
    currentSource = `sheet:${item.label}`;
    await safeClick(page, item.sel, item.label);
    // Press Escape to close any modal that opened
    await page.keyboard.press("Escape");
    await wait(500);
  }

  // Navigate to character sheet sub-pages
  const subPages = [
    { url: `https://www.dndbeyond.com/characters/${charId}/builder`, label: "builder" },
    { url: `https://www.dndbeyond.com/characters/${charId}/builder/class`, label: "builder:class" },
    { url: `https://www.dndbeyond.com/characters/${charId}/builder/species`, label: "builder:species" },
    { url: `https://www.dndbeyond.com/characters/${charId}/builder/background`, label: "builder:background" },
    { url: `https://www.dndbeyond.com/characters/${charId}/builder/abilities`, label: "builder:abilities" },
    { url: `https://www.dndbeyond.com/characters/${charId}/builder/equipment`, label: "builder:equipment" },
    { url: `https://www.dndbeyond.com/characters/${charId}/builder/description`, label: "builder:description" },
  ];

  for (const sub of subPages) {
    currentSource = `sheet:${sub.label}`;
    try {
      await page.goto(sub.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await wait(2000);
    } catch {
      console.log(`  (skip: ${sub.label} failed to load)`);
    }
  }
}

async function exploreBuilder(page: Page) {
  console.log(`\n=== Exploring Character Builder ===\n`);

  currentSource = "builder:landing";
  await page.goto("https://www.dndbeyond.com/characters/builder", { waitUntil: "domcontentloaded" });
  await wait(3000);

  // Click through builder step links/buttons
  const builderSteps = [
    "button:has-text('Class')",
    "button:has-text('Species')",
    "button:has-text('Background')",
    "button:has-text('Abilities')",
    "button:has-text('Equipment')",
    "button:has-text('Description')",
    "a:has-text('Class')",
    "a:has-text('Species')",
    "a:has-text('Background')",
    "a:has-text('Abilities')",
    "a:has-text('Equipment')",
    "a:has-text('Description')",
  ];

  for (const step of builderSteps) {
    currentSource = `builder:step:${step}`;
    await safeClick(page, step, step);
  }

  // Look for navigation elements
  const navPatterns = [
    ".builder-navigation__item",
    ".builder-step__nav-item",
    "[class*='builder'] [class*='nav'] button",
    "[class*='builder'] [class*='nav'] a",
    "[class*='step'] button",
  ];

  for (const pattern of navPatterns) {
    try {
      const elements = page.locator(pattern);
      const count = await elements.count();
      for (let i = 0; i < Math.min(count, 10); i++) {
        currentSource = `builder:nav:${pattern}[${i}]`;
        try {
          await elements.nth(i).click();
          await wait(1500);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }
}

async function exploreRuleData(page: Page) {
  console.log(`\n=== Exploring Rule/Game Data Endpoints ===\n`);

  // These are GET endpoints we can hit directly
  const gameDataPaths = [
    "/character/v5/game-data/classes?sharingSetting=2",
    "/character/v5/game-data/races?sharingSetting=2",
    "/character/v5/game-data/backgrounds?sharingSetting=2",
    "/character/v5/game-data/feats?sharingSetting=2",
    "/character/v5/game-data/items?sharingSetting=2",
    "/character/v5/game-data/portraits?sharingSetting=2",
    "/character/v5/game-data/class-feature/collection",
    "/character/v5/game-data/racial-trait/collection",
    "/character/v5/game-data/subclasses?sharingSetting=2&baseClassId=2190875",
    "/character/v5/game-data/subclasses?sharingSetting=2&baseClassId=2190876",
    "/character/v5/game-data/subclasses?sharingSetting=2&baseClassId=2190877",
    "/character/v5/game-data/subclasses?sharingSetting=2&baseClassId=2190879",
    "/character/v5/game-data/subclasses?sharingSetting=2&baseClassId=2190885",
    "/character/v5/game-data/class-starting-equipment?sharingSetting=2&id=2190875",
    "/character/v5/game-data/background-starting-equipment?sharingSetting=2&id=406474",
    "/character/v5/game-data/always-known-spells?classId=1&classLevel=20&sharingSetting=2",
    "/character/v5/game-data/always-prepared-spells?classId=1&classLevel=20&sharingSetting=2",
    "/character/v5/rule-data",
  ];

  for (const path of gameDataPaths) {
    currentSource = `gamedata:${path.split("?")[0]}`;
    const url = `https://character-service.dndbeyond.com${path}`;
    try {
      await page.evaluate(async (fetchUrl) => {
        await fetch(fetchUrl, {
          headers: { "Accept": "application/json" },
        });
      }, url);
      await wait(300);
    } catch {
      console.log(`  (skip: ${path} failed)`);
    }
  }
}

async function main() {
  const charId = process.argv[2] ? parseInt(process.argv[2]) : null;

  const configRaw = await readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(configRaw);
  const cookies = config.cookies;

  if (!cookies?.length) {
    console.error("No cookies found. Run `npm run setup` first.");
    process.exit(1);
  }

  console.log("Launching browser for systematic endpoint exploration...");
  console.log(`Output: ${OUTPUT_PATH}\n`);

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled", "--disable-infobars", "--no-first-run"],
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const context = await browser.newContext();
  await context.addCookies(
    cookies.map((c: { name: string; value: string }) => ({
      name: c.name, value: c.value, domain: ".dndbeyond.com", path: "/",
    }))
  );

  const page = await context.newPage();
  setupCapture(page);

  try {
    // Find a character ID if none provided
    let targetCharId = charId;
    if (!targetCharId) {
      currentSource = "init:find-char";
      // Intercept the characters list API to get a character ID
      const charPromise = new Promise<number>((resolve) => {
        page.on("response", async (res) => {
          if (res.url().includes("/characters/list") && res.status() === 200) {
            try {
              const json = await res.json();
              const chars = json?.data ?? json;
              if (Array.isArray(chars) && chars.length > 0) {
                resolve(chars[0].id);
              }
            } catch { /* ignore */ }
          }
        });
      });
      await page.goto("https://www.dndbeyond.com/characters", { waitUntil: "domcontentloaded" });
      targetCharId = await Promise.race([
        charPromise,
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
      ]).catch(() => 0);

      if (!targetCharId) {
        console.error("Could not find a character. Provide a character ID as argument.");
        await browser.close();
        process.exit(1);
      }
    }

    console.log(`Using character ID: ${targetCharId}\n`);

    // Explore everything
    await exploreCharacterSheet(page, targetCharId);
    await exploreBuilder(page);
    await exploreRuleData(page);

  } catch (err: any) {
    console.error(`Error during exploration: ${err.message}`);
  }

  await browser.close();

  // Save results
  writeFileSync(OUTPUT_PATH, JSON.stringify(captured, null, 2));

  // Print summary of unique endpoints
  console.log(`\n=== UNIQUE ENDPOINTS (${seenEndpoints.size}) ===\n`);
  const sorted = [...seenEndpoints].sort();
  for (const ep of sorted) {
    console.log(ep);
  }

  console.log(`\nTotal requests captured: ${captured.length}`);
  console.log(`Unique endpoints: ${seenEndpoints.size}`);
  console.log(`Saved to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
