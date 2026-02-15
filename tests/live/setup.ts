/**
 * Shared setup for live integration tests.
 *
 * Creates a real DdbClient that hits actual D&D Beyond endpoints.
 * Requires valid auth credentials in ~/.dndbeyond-mcp/config.json.
 *
 * Two setup functions:
 *   getLiveClient()        — just the client (for reference/campaign tests)
 *   setupLiveCharacter()   — client + resolved character ID (for character tests)
 */
import { TtlCache } from "../../src/cache/lru.js";
import { CircuitBreaker, RateLimiter } from "../../src/resilience/index.js";
import { DdbClient } from "../../src/api/client.js";
import { isAuthenticated } from "../../src/api/auth.js";
import { ENDPOINTS } from "../../src/api/endpoints.js";
import type { DdbCampaign } from "../../src/types/api.js";

let sharedClient: DdbClient | null = null;
let resolvedCharacterId: number | null = null;

/**
 * Creates (or reuses) a real DdbClient. No character resolution.
 * Use this for reference/campaign tests that don't need a character ID.
 */
export async function getLiveClient(): Promise<DdbClient> {
  if (sharedClient) return sharedClient;

  const authed = await isAuthenticated();
  if (!authed) {
    throw new Error(
      "Live tests require authentication. Run `npm run setup` first."
    );
  }

  const cache = new TtlCache<unknown>(30_000);
  const circuitBreaker = new CircuitBreaker(5, 30_000);
  const rateLimiter = new RateLimiter(3, 1000);
  sharedClient = new DdbClient(cache, circuitBreaker, rateLimiter);
  return sharedClient;
}

/**
 * Creates (or reuses) a real DdbClient and resolves a test character ID.
 * Searches all campaigns to find one with characters.
 */
export async function setupLiveCharacter(): Promise<{
  client: DdbClient;
  testCharacterId: number;
}> {
  const client = await getLiveClient();

  if (resolvedCharacterId) {
    return { client, testCharacterId: resolvedCharacterId };
  }

  // Use env var if provided
  const envId = process.env.DDB_TEST_CHARACTER_ID;
  if (envId) {
    resolvedCharacterId = parseInt(envId, 10);
    return { client, testCharacterId: resolvedCharacterId };
  }

  // Search all campaigns for a character
  const campaigns = await client.get<DdbCampaign[]>(
    ENDPOINTS.campaign.list(),
    "live-test-campaigns",
    60_000
  );

  if (!campaigns || campaigns.length === 0) {
    throw new Error(
      "No campaigns found. Set DDB_TEST_CHARACTER_ID env var or join a campaign."
    );
  }

  for (const campaign of campaigns) {
    const characters = await client.get<Array<{ id: number; name: string }>>(
      ENDPOINTS.campaign.characters(campaign.id),
      `live-test-chars:${campaign.id}`,
      60_000
    );

    if (characters && characters.length > 0) {
      resolvedCharacterId = characters[0].id;
      return { client, testCharacterId: resolvedCharacterId };
    }
  }

  throw new Error(
    `No characters found in any of ${campaigns.length} campaigns. Set DDB_TEST_CHARACTER_ID env var.`
  );
}

/**
 * Creates a new test character via standard-build and returns the character ID.
 */
export async function createTestCharacter(client: DdbClient): Promise<number> {
  // Standard-build returns the character ID as a raw number (not an object)
  const characterId = await client.post<number>(
    ENDPOINTS.character.builder.standardBuild(),
    { showHelpText: false }
  );
  return characterId;
}

/**
 * Deletes a test character. Silently ignores errors (character may already be deleted).
 */
export async function deleteTestCharacter(client: DdbClient, characterId: number): Promise<void> {
  try {
    await client.delete(
      ENDPOINTS.character.delete(),
      { characterId }
    );
  } catch {
    // Ignore — character may already be deleted or cleanup from a failed test
  }
}
