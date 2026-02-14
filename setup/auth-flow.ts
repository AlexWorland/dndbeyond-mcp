import { chromium } from "playwright";
import { saveCobaltSession } from "../src/api/auth.js";

const DDB_LOGIN_URL = "https://www.dndbeyond.com/sign-in";

export async function runAuthFlow(): Promise<void> {
  console.error("Opening browser for D&D Beyond login...");
  console.error("Please log in normally. The browser will close when authentication is detected.");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(DDB_LOGIN_URL);

  const cookie = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login timed out after 5 minutes")), 300_000);

    const interval = setInterval(async () => {
      const cookies = await context.cookies("https://www.dndbeyond.com");
      const cobalt = cookies.find((c) => c.name === "CobaltSession");
      if (cobalt) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(cobalt.value);
      }
    }, 1000);
  });

  await saveCobaltSession(cookie);
  console.error("Authentication successful! Cookie saved.");
  await browser.close();
}

if (process.argv[1]?.endsWith("auth-flow.js")) {
  runAuthFlow().catch((err) => {
    console.error("Auth failed:", err.message);
    process.exit(1);
  });
}
