import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".dndbeyond-mcp");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface CookieEntry {
  name: string;
  value: string;
}

interface AuthConfig {
  cobaltSession: string;
  cookies: CookieEntry[];
  savedAt: string;
}

export async function getCobaltSession(): Promise<string | null> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const config: AuthConfig = JSON.parse(raw);
    return config.cobaltSession || null;
  } catch {
    return null;
  }
}

export async function getAllCookies(): Promise<CookieEntry[]> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const config: AuthConfig = JSON.parse(raw);
    return config.cookies || [];
  } catch {
    return [];
  }
}

export async function saveAllCookies(cookies: CookieEntry[]): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const cobalt = cookies.find((c) => c.name === "CobaltSession");
  const config: AuthConfig = {
    cobaltSession: cobalt?.value || "",
    cookies,
    savedAt: new Date().toISOString(),
  };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export async function saveCobaltSession(cookie: string): Promise<void> {
  await saveAllCookies([{ name: "CobaltSession", value: cookie }]);
}

export function buildAuthHeaders(cobaltSession: string): Record<string, string> {
  return {
    Cookie: `CobaltSession=${cobaltSession}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function buildAuthHeadersFromCookies(cookies: CookieEntry[]): Record<string, string> {
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return {
    Cookie: cookieStr,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getCobaltSession();
  return session !== null;
}

export async function getUserId(): Promise<number | null> {
  const cookies = await getAllCookies();
  const userIdCookie = cookies.find((c) => c.name === "User.ID");
  if (!userIdCookie) return null;
  const parsed = parseInt(userIdCookie.value, 10);
  return isNaN(parsed) ? null : parsed;
}

const COBALT_TOKEN_URL = "https://auth-service.dndbeyond.com/v1/cobalt-token";

interface CobaltTokenResponse {
  token: string;
  ttl: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getCobaltToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const cookies = await getAllCookies();
  if (cookies.length === 0) throw new Error("Not authenticated. Run setup first.");

  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const response = await fetch(COBALT_TOKEN_URL, {
    method: "POST",
    headers: {
      Cookie: cookieStr,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) {
    throw new Error(`Cobalt token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as CobaltTokenResponse;
  if (!data.token) {
    throw new Error("Cobalt token exchange returned no token");
  }

  // Cache with 30s buffer before TTL expiry
  cachedToken = {
    token: data.token,
    expiresAt: Date.now() + (data.ttl - 30) * 1000,
  };

  return data.token;
}
