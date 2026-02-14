import { chromium } from "playwright";
import { saveAllCookies } from "../src/api/auth.js";

const DDB_LOGIN_URL = "https://www.dndbeyond.com/sign-in";

export async function runAuthFlow(): Promise<void> {
  console.error("Opening browser for D&D Beyond login...");
  console.error("Please log in normally. The browser will close when authentication is detected.");

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
  const page = await context.newPage();

  await page.goto(DDB_LOGIN_URL);

  const allCookies = await new Promise<Array<{ name: string; value: string }>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login timed out after 5 minutes")), 300_000);

    const interval = setInterval(async () => {
      const cookies = await context.cookies("https://www.dndbeyond.com");
      const cobalt = cookies.find((c) => c.name === "CobaltSession");
      if (cobalt) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(cookies.map((c) => ({ name: c.name, value: c.value })));
      }
    }, 1000);
  });

  await saveAllCookies(allCookies);
  console.error(`Authentication successful! ${allCookies.length} cookies saved.`);
  await browser.close();
}

if (process.argv[1]?.endsWith("auth-flow.js")) {
  runAuthFlow().catch((err) => {
    console.error("Auth failed:", err.message);
    process.exit(1);
  });
}
