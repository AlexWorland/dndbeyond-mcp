import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".dndbeyond-mcp");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface AuthConfig {
  cobaltSession: string;
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

export async function saveCobaltSession(cookie: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const config: AuthConfig = {
    cobaltSession: cookie,
    savedAt: new Date().toISOString(),
  };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function buildAuthHeaders(cobaltSession: string): Record<string, string> {
  return {
    Cookie: `CobaltSession=${cobaltSession}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getCobaltSession();
  return session !== null;
}
