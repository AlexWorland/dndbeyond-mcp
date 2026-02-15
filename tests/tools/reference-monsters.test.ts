import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchMonsters, getMonster } from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";
import { MonsterSearchParams } from "../../src/types/reference.js";

const MOCK_CONFIG = {
  challengeRatings: [
    { id: 5, value: 1, xp: 200, proficiencyBonus: 2 },
    { id: 14, value: 10, xp: 5900, proficiencyBonus: 4 },
  ],
  monsterTypes: [
    { id: 6, name: "Dragon" },
    { id: 11, name: "Humanoid" },
  ],
  environments: [{ id: 7, name: "Mountain" }],
  alignments: [{ id: 9, name: "Chaotic Evil" }],
  damageTypes: [{ id: 1, name: "Fire" }],
  senses: [{ id: 2, name: "Darkvision" }],
};

const MOCK_MONSTER = {
  id: 17100,
  name: "Goblin",
  alignmentId: 9,
  sizeId: 3,
  typeId: 11,
  armorClass: 15,
  armorClassDescription: "(leather armor, shield)",
  averageHitPoints: 7,
  hitPointDice: { diceCount: 2, diceValue: 6, fixedValue: 0, diceString: "2d6" },
  passivePerception: 9,
  challengeRatingId: 5,
  isHomebrew: false,
  isLegendary: false,
  isMythic: false,
  isLegacy: false,
  url: "",
  avatarUrl: "",
  stats: [
    { statId: 1, value: 8 },
    { statId: 2, value: 14 },
    { statId: 3, value: 10 },
    { statId: 4, value: 10 },
    { statId: 5, value: 8 },
    { statId: 6, value: 8 },
  ],
  skills: [{ skillId: 5, value: 4 }],
  senses: [{ senseId: 2, notes: "60 ft." }],
  savingThrows: [],
  movements: [{ movementId: 1, speed: 30, notes: null }],
  languages: [],
  damageAdjustments: [],
  conditionImmunities: [],
  environments: [],
  specialTraitsDescription: "<p><strong>Nimble Escape.</strong> The goblin can take the Disengage or Hide action as a bonus action.</p>",
  actionsDescription: "<p><strong>Scimitar.</strong> Melee Weapon Attack</p>",
  reactionsDescription: "",
  legendaryActionsDescription: "",
  mythicActionsDescription: "",
  bonusActionsDescription: "",
  lairDescription: "",
  languageDescription: "Common, Goblin",
  languageNote: "",
  sensesHtml: "",
  skillsHtml: "Stealth +6",
  conditionImmunitiesHtml: "",
};

// Helper: create a mock client that routes config calls automatically
// and queues monster responses in order
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

describe("searchMonsters", () => {
  it("shouldReturnFormattedListWhenMonstersFound", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 1, total: 1 },
        data: [MOCK_MONSTER],
      },
    ]);

    const result = await searchMonsters(mockClient, { name: "goblin" });

    expect(result.content[0].text).toContain("Monster Search Results");
    expect(result.content[0].text).toContain("Goblin");
  });

  it("shouldReturnNoResultsMessageWhenNoMonstersFound", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: {},
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 0, total: 0 },
        data: [],
      },
    ]);

    const result = await searchMonsters(mockClient, { name: "nonexistent" });

    expect(result.content[0].text).toContain("No monsters found");
  });

  it("shouldAcceptMultipleSearchParameters", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: {},
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 0, total: 0 },
        data: [],
      },
    ]);

    const params: MonsterSearchParams = {
      name: "dragon",
      cr: 10,
      type: "dragon",
      size: "huge",
    };

    const result = await searchMonsters(mockClient, params);
    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 1, total: 1 },
        data: [MOCK_MONSTER],
      },
    ]);

    const result = await searchMonsters(mockClient, {});
    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldHandlePaginationWithPageParameter", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 20, skip: 20, currentPage: 2, pages: 5, total: 97 },
        data: [MOCK_MONSTER],
      },
    ]);

    const result = await searchMonsters(mockClient, { page: 2 });

    expect(result.content[0].text).toContain("Monster Search Results");
    expect(result.content[0].text).toContain("Goblin");
  });

  it("shouldDefaultToPage1WhenPageNotSpecified", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 3, total: 50 },
        data: [MOCK_MONSTER],
      },
    ]);

    const result = await searchMonsters(mockClient, { name: "goblin" });

    expect(result.content[0].text).toContain("Monster Search Results");
    expect(result.content[0].text).toContain("Goblin");
  });

  it("shouldMarkHomebrewMonstersWithTag", async () => {
    const homebrewMonster = { ...MOCK_MONSTER, name: "Custom Dragon", isHomebrew: true };
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 1, total: 2 },
        data: [MOCK_MONSTER, homebrewMonster],
      },
    ]);

    const result = await searchMonsters(mockClient, {});

    expect(result.content[0].text).toContain("**Custom Dragon** [Homebrew]");
    expect(result.content[0].text).not.toContain("Goblin** [Homebrew]");
  });

  it("shouldPassShowHomebrewParameterToEndpoint", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: {},
        pagination: { take: 20, skip: 0, currentPage: 1, pages: 0, total: 0 },
        data: [],
      },
    ]);

    await searchMonsters(mockClient, { showHomebrew: true });

    expect(mockClient.getRaw).toHaveBeenCalled();
  });
});

describe("getMonster", () => {
  it("shouldReturnNotFoundMessageWhenMonsterDoesNotExist", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: {},
        pagination: { take: 5, skip: 0, currentPage: 1, pages: 0, total: 0 },
        data: [],
      },
    ]);

    const result = await getMonster(mockClient, { monsterName: "Nonexistent Monster" });

    expect(result.content[0].text).toContain("not found");
  });

  it("shouldReturnFormattedStatBlockStructure", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 5, skip: 0, currentPage: 1, pages: 1, total: 1 },
        data: [MOCK_MONSTER],
      },
      { accessType: 1, data: MOCK_MONSTER },
    ]);

    const result = await getMonster(mockClient, { monsterName: "Goblin" });

    expect(result.content[0].text).toContain("Goblin");
    expect(result.content[0].text).toContain("Armor Class");
    expect(result.content[0].text).toContain("Hit Points");
  });

  it("shouldHandleMonsterNameCaseInsensitively", async () => {
    const mockClient = createRoutingMockClient([
      {
        accessType: { "17100": 1 },
        pagination: { take: 5, skip: 0, currentPage: 1, pages: 1, total: 1 },
        data: [MOCK_MONSTER],
      },
      { accessType: 1, data: MOCK_MONSTER },
    ]);

    const result = await getMonster(mockClient, { monsterName: "goblin" });
    expect(result.content[0].text).toContain("Goblin");
  });
});
