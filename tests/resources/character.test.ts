import { describe, it, expect, vi } from "vitest";
import { registerCharacterResources } from "../../src/resources/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";
import type { DdbCampaign } from "../../src/types/api.js";
import { HttpError } from "../../src/resilience/index.js";

function createMockClient(): DdbClient {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
  } as unknown as DdbClient;
}

const mockCharacter: DdbCharacter = {
  id: 12345,
  readonlyUrl: "https://www.dndbeyond.com/characters/12345",
  name: "Thorin Ironforge",
  race: {
    fullName: "Mountain Dwarf",
    baseRaceName: "Dwarf",
    isHomebrew: false,
    racialTraits: [],
  },
  classes: [
    {
      id: 1,
      definition: { name: "Fighter" },
      subclassDefinition: { name: "Battle Master", classFeatures: [] },
      level: 5,
      isStartingClass: true,
      classFeatures: [],
    },
  ],
  level: 5,
  background: {
    definition: {
      name: "Soldier",
      description: "A veteran warrior",
      featureName: null,
      featureDescription: null,
      snippet: null,
      skillProficienciesDescription: null,
      toolProficienciesDescription: null,
      equipmentDescription: null,
    },
  },
  stats: [
    { id: 1, value: 16 },
    { id: 2, value: 14 },
    { id: 3, value: 15 },
    { id: 4, value: 10 },
    { id: 5, value: 12 },
    { id: 6, value: 8 },
  ],
  bonusStats: [],
  overrideStats: [],
  modifiers: {
    race: [],
    class: [],
    background: [],
    item: [],
    feat: [],
    condition: [],
  },
  baseHitPoints: 42,
  bonusHitPoints: null,
  overrideHitPoints: null,
  removedHitPoints: 10,
  temporaryHitPoints: 5,
  currentXp: 6500,
  alignmentId: 1,
  lifestyleId: 3,
  currencies: { cp: 0, sp: 50, ep: 0, gp: 125, pp: 2 },
  spells: { race: [], class: [], background: [], item: [], feat: [] },
  inventory: [],
  deathSaves: { failCount: null, successCount: null, isStabilized: false },
  traits: {
    personalityTraits: "I face problems head-on.",
    ideals: "Honor and duty above all.",
    bonds: "My fellow soldiers are my family.",
    flaws: "I have trouble trusting outsiders.",
    appearance: "Scarred face with a long beard.",
  },
  preferences: {},
  configuration: {},
  actions: {},
  campaign: { id: 999, name: "Lost Mines of Phandelver" },
  feats: [],
  notes: { personalPossessions: null, backstory: null, otherNotes: null, allies: null, organizations: null },
} as unknown as DdbCharacter;

const mockCampaigns: DdbCampaign[] = [
  {
    id: 999,
    name: "Lost Mines of Phandelver",
    dmId: 1,
    dmUsername: "dm_user",
    playerCount: 4,
    dateCreated: "1/1/2026",
  },
];

const mockCampaignCharacters = [
  {
    id: 12345,
    name: "Thorin Ironforge",
    userId: 2,
    userName: "player1",
    avatarUrl: "",
    characterStatus: 1,
    isAssigned: true,
  },
];

// registerCharacterResources calls server.resource(name, uri, opts, handler)
function createMockServer() {
  const handlers: Record<string, Function> = {};
  const mockServer = {
    resource: vi.fn((name: string, _uri: unknown, _opts: unknown, handler: Function) => {
      handlers[name] = handler;
    }),
  };
  return { mockServer, handlers };
}

describe("Character Resources", () => {
  it("should format character sheet with valid ID", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockResolvedValue(mockCharacter);

    const { mockServer, handlers } = createMockServer();
    registerCharacterResources(mockServer as any, mockClient);

    // Character sheet handler receives a URI object
    const uri = { toString: () => "dndbeyond://character/12345" };
    const result = await handlers["D&D Beyond Character Sheet"](uri);

    expect(result.contents).toHaveLength(1);
    const text = result.contents[0].text;
    expect(text).toContain("Thorin Ironforge");
    expect(text).toContain("Mountain Dwarf");
    expect(text).toContain("Fighter");
  });

  it("should handle HttpError in character sheet", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockRejectedValue(new HttpError("Not found", 404));

    const { mockServer, handlers } = createMockServer();
    registerCharacterResources(mockServer as any, mockClient);

    const uri = { toString: () => "dndbeyond://character/12345" };
    const result = await handlers["D&D Beyond Character Sheet"](uri);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Error:");
    expect(result.contents[0].text).toContain("Not found");
  });

  it("should handle invalid URI in character sheet", async () => {
    const mockClient = createMockClient();

    const { mockServer, handlers } = createMockServer();
    registerCharacterResources(mockServer as any, mockClient);

    const uri = { toString: () => "dndbeyond://character/invalid" };
    const result = await handlers["D&D Beyond Character Sheet"](uri);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Invalid character URI format");
  });

  it("should format characters list", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(mockCharacter);

    const { mockServer, handlers } = createMockServer();
    registerCharacterResources(mockServer as any, mockClient);

    // Characters list handler takes no args (static resource)
    const result = await handlers["D&D Beyond Characters"]();

    expect(result.contents).toHaveLength(1);
    const text = result.contents[0].text;
    expect(text).toContain("Thorin Ironforge");
    expect(text).toContain("Mountain Dwarf");
    expect(text).toContain("Fighter");
  });

  it("should handle HttpError in characters list", async () => {
    const mockClient = createMockClient();
    vi.mocked(mockClient.get).mockRejectedValue(new HttpError("API error", 500));

    const { mockServer, handlers } = createMockServer();
    registerCharacterResources(mockServer as any, mockClient);

    const result = await handlers["D&D Beyond Characters"]();

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Error:");
    expect(result.contents[0].text).toContain("API error");
  });
});
