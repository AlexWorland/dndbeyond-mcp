import { describe, it, expect, vi } from "vitest";
import { searchMonsters } from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";

const MOCK_CONFIG = {
  challengeRatings: [{ id: 5, value: 1, xp: 200, proficiencyBonus: 2 }],
  monsterTypes: [{ id: 11, name: "Humanoid" }],
  environments: [],
  alignments: [],
  damageTypes: [],
  senses: [],
  sources: [
    { id: 1, name: "Monster Manual" },
    { id: 2, name: "Volo's Guide to Monsters" },
    { id: 3, name: "Mordenkainen's Tome of Foes" },
  ],
};

const MOCK_RESPONSE = {
  accessType: {},
  pagination: { take: 20, skip: 0, currentPage: 1, pages: 1, total: 1 },
  data: [
    {
      id: 1001,
      name: "Goblin",
      typeId: 11,
      challengeRatingId: 5,
      sizeId: 3,
      isHomebrew: false,
      stats: [],
      movements: [],
      senses: [],
      languages: [],
    },
  ],
};

function createRoutingMockClient(monsterResponses: unknown[]) {
  const responseQueue = [...monsterResponses];
  const getRawFn = vi.fn(async (url: string) => {
    if (url.includes("config/json")) return MOCK_CONFIG;
    return responseQueue.shift();
  });
  return {
    get: vi.fn(),
    getRaw: getRawFn,
  } as unknown as DdbClient;
}

describe("search_monsters with source filter", () => {
  it("should pass sources parameter to the API when source is provided", async () => {
    const client = createRoutingMockClient([MOCK_RESPONSE]);
    await searchMonsters(client, { source: "Monster Manual" });

    const monsterUrl = vi.mocked(client.getRaw).mock.calls.find(
      (call) => !call[0].toString().includes("config/json")
    )?.[0];
    expect(monsterUrl).toContain("sources=");
    expect(monsterUrl).toContain("sources=1"); // Should resolve to ID 1
  });

  it("should resolve source names with fuzzy matching", async () => {
    const client = createRoutingMockClient([MOCK_RESPONSE]);
    await searchMonsters(client, { source: "volos guide" });

    const monsterUrl = vi.mocked(client.getRaw).mock.calls.find(
      (call) => !call[0].toString().includes("config/json")
    )?.[0];
    expect(monsterUrl).toContain("sources=2"); // Should match "Volo's Guide to Monsters"
  });

  it("should not add sources param when source is not provided", async () => {
    const client = createRoutingMockClient([MOCK_RESPONSE]);
    await searchMonsters(client, { name: "goblin" });

    const monsterUrl = vi.mocked(client.getRaw).mock.calls.find(
      (call) => !call[0].toString().includes("config/json")
    )?.[0];
    expect(monsterUrl).not.toContain("sources=");
  });

  it("should handle unknown source names gracefully", async () => {
    const client = createRoutingMockClient([MOCK_RESPONSE]);
    const result = await searchMonsters(client, { source: "Unknown Book" });

    // Should not throw error, just proceed without source filter
    const text = result.content[0].text;
    expect(text).toBeTruthy();
  });
});
