import { describe, it, expect, vi } from "vitest";
import { getCharacter, listCharacters } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";
import type { DdbCampaign } from "../../src/types/api.js";

// Extended mock character for testing detail levels
function createDetailedMockCharacter(): DdbCharacter {
  return {
    ...mockCharacter,
    modifiers: {
      ...mockCharacter.modifiers,
      race: [
        { id: "r1", type: "proficiency", subType: "common", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Common", componentId: 1, componentTypeId: 1 },
        { id: "r2", type: "proficiency", subType: "dwarvish", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Dwarvish", componentId: 1, componentTypeId: 1 },
      ],
      class: [
        { id: "c1", type: "proficiency", subType: "light-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Light Armor", componentId: 2, componentTypeId: 2 },
        { id: "c2", type: "proficiency", subType: "martial-weapons", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Martial Weapons", componentId: 2, componentTypeId: 2 },
      ],
    },
    actions: {
      race: [],
      class: [],
      feat: [],
    },
    feats: [
      {
        id: 1,
        definition: {
          id: 101,
          name: "Great Weapon Master",
          description: "<p>You've learned to put the weight of a weapon to your advantage.</p>",
          prerequisite: "Strength 13 or higher",
          sourceId: 1,
        },
        componentId: 1,
        componentTypeId: 12,
      },
    ],
    race: {
      ...mockCharacter.race,
      racialTraits: [
        {
          definition: {
            id: 201,
            name: "Darkvision",
            description: "<p>You can see in dim light within 60 feet.</p>",
            sourceId: 1,
          },
        },
      ],
    },
  };
}

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
      subclassDefinition: { name: "Battle Master" },
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
    },
  },
  stats: [
    { id: 1, value: 16 }, // STR
    { id: 2, value: 14 }, // DEX
    { id: 3, value: 15 }, // CON
    { id: 4, value: 10 }, // INT
    { id: 5, value: 12 }, // WIS
    { id: 6, value: 8 },  // CHA
  ],
  bonusStats: [
    { id: 1, value: 2 }, // +2 STR from race
  ],
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
  currencies: {
    cp: 0,
    sp: 50,
    ep: 0,
    gp: 125,
    pp: 2,
  },
  spells: {
    race: [],
    class: [],
    background: [],
    item: [],
    feat: [],
  },
  inventory: [
    {
      id: 1,
      definition: {
        name: "Longsword",
        description: "A versatile blade",
        type: "Weapon",
        rarity: "Common",
        weight: 3,
        cost: 15,
        isHomebrew: false,
      },
      equipped: true,
      quantity: 1,
    },
    {
      id: 2,
      definition: {
        name: "Plate Armor",
        description: "Heavy armor",
        type: "Armor",
        rarity: "Common",
        weight: 65,
        cost: 1500,
        isHomebrew: false,
      },
      equipped: true,
      quantity: 1,
    },
  ],
  deathSaves: {
    failCount: null,
    successCount: null,
    isStabilized: false,
  },
  traits: {
    personalityTraits: "I face problems head-on.",
    ideals: "Honor and duty above all.",
    bonds: "My fellow soldiers are my family.",
    flaws: "I have trouble trusting outsiders.",
    appearance: "Scarred face with a long beard.",
  },
  notes: {
    personalPossessions: null,
    backstory: null,
    otherNotes: null,
    allies: null,
    organizations: null,
  },
  actions: {
    race: [],
    class: [],
    feat: [],
  },
  feats: [],
  preferences: {},
  configuration: {},
  campaign: {
    id: 999,
    name: "Lost Mines of Phandelver",
  },
};

// client.get() auto-unwraps the envelope, so mocks return the inner data directly
const mockCampaigns: DdbCampaign[] = [
  {
    id: 999,
    name: "Lost Mines of Phandelver",
    dmId: 1,
    dmUsername: "dm_user",
    playerCount: 1,
    dateCreated: "1/1/2026",
  },
];

const mockCampaignCharacters = [
  { id: 12345, name: "Thorin Ironforge", userId: 2, userName: "player1", avatarUrl: "", characterStatus: 1, isAssigned: true },
];

describe("getCharacter", () => {
  it("should format character data correctly by ID with summary detail", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(mockCharacter);

    const result = await getCharacter(client, { characterId: 12345, detail: "summary" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const text = result.content[0].text;

    expect(text).toContain("Name: Thorin Ironforge");
    expect(text).toContain("Race: Mountain Dwarf");
    expect(text).toContain("Class: Fighter (Battle Master) 5");
    expect(text).toContain("Level: 5");
    expect(text).toContain("HP: 32/42 (+5 temp)");
    expect(text).toContain("Campaign: Lost Mines of Phandelver");
    expect(text).toContain("Equipped Items:");
    expect(text).toContain("Longsword");
    expect(text).toContain("Plate Armor");
  });

  it("should format character data correctly by name with summary detail", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)        // campaign list
      .mockResolvedValueOnce(mockCampaignCharacters) // characters for campaign 999
      .mockResolvedValueOnce(mockCharacter);         // character data

    const result = await getCharacter(client, { characterName: "Thorin Ironforge", detail: "summary" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("Name: Thorin Ironforge");
  });

  it("should handle missing character by name", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters);

    const result = await getCharacter(client, { characterName: "Unknown Hero" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Character "Unknown Hero" not found.');
  });

  it("should handle missing parameters", async () => {
    const client = createMockClient();

    const result = await getCharacter(client, {});

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe("Either characterId or characterName must be provided.");
  });
});

describe("getCharacter - fuzzy name matching", () => {
  it("should handle exact case-insensitive match", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(mockCharacter);

    const result = await getCharacter(client, { characterName: "thorin ironforge", detail: "summary" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("Name: Thorin Ironforge");
  });

  it("should handle substring match", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(mockCharacter);

    const result = await getCharacter(client, { characterName: "Thorin", detail: "summary" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("Name: Thorin Ironforge");
  });

  it("should handle fuzzy match with typo when only one close match", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(mockCharacter);

    const result = await getCharacter(client, { characterName: "Throin", detail: "summary" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("Name: Thorin Ironforge");
  });

  it("should return not found for no close matches", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters);

    const result = await getCharacter(client, { characterName: "Gandalf" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Character "Gandalf" not found.');
  });
});

describe("getCharacter with detail levels", () => {
  it("should return summary by detail='summary'", async () => {
    const client = createMockClient();
    const detailedChar = createDetailedMockCharacter();
    vi.mocked(client.get).mockResolvedValue(detailedChar);

    const result = await getCharacter(client, { characterId: 12345, detail: "summary" });
    const text = result.content[0].text;

    // Should contain basic info
    expect(text).toContain("Name: Thorin Ironforge");
    expect(text).toContain("Race: Mountain Dwarf");
    expect(text).toContain("Class: Fighter (Battle Master) 5");
    expect(text).toContain("Level: 5");

    // Should NOT contain detailed sections
    expect(text).not.toContain("--- Saving Throws");
    expect(text).not.toContain("--- Skills");
    expect(text).not.toContain("--- Proficiencies");
  });

  it("should return full sheet by detail='sheet' (default)", async () => {
    const client = createMockClient();
    const detailedChar = createDetailedMockCharacter();
    vi.mocked(client.get).mockResolvedValue(detailedChar);

    // Test with explicit 'sheet'
    const result1 = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text1 = result1.content[0].text;

    expect(text1).toContain("=== Thorin Ironforge ===");
    expect(text1).toContain("--- Saving Throws");
    expect(text1).toContain("--- Skills");
    expect(text1).toContain("--- Proficiencies");

    // Test default (no detail param)
    vi.mocked(client.get).mockResolvedValue(detailedChar);
    const result2 = await getCharacter(client, { characterId: 12345 });
    const text2 = result2.content[0].text;

    expect(text2).toContain("=== Thorin Ironforge ===");
    expect(text2).toContain("--- Saving Throws");
  });

  it("should return expanded definitions by detail='full'", async () => {
    const client = createMockClient();
    const detailedChar = createDetailedMockCharacter();
    vi.mocked(client.get).mockResolvedValue(detailedChar);

    const result = await getCharacter(client, { characterId: 12345, detail: "full" });
    const text = result.content[0].text;

    // Should contain sheet sections
    expect(text).toContain("=== Thorin Ironforge ===");
    expect(text).toContain("--- Saving Throws");

    // Should contain expanded definition sections (use === headers)
    expect(text).toContain("=== Feat Definitions ===");
    expect(text).toContain("Great Weapon Master");
    expect(text).toContain("=== Racial Trait Definitions ===");
    expect(text).toContain("Darkvision");
  });

  it("should work with detail parameter and characterName", async () => {
    const client = createMockClient();
    const detailedChar = createDetailedMockCharacter();

    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(detailedChar);

    const result = await getCharacter(client, {
      characterName: "Thorin",
      detail: "summary"
    });
    const text = result.content[0].text;

    expect(text).toContain("Name: Thorin Ironforge");
    expect(text).not.toContain("--- Saving Throws");
  });
});

describe("listCharacters", () => {
  it("should return formatted list of characters", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)        // campaign list
      .mockResolvedValueOnce(mockCampaignCharacters) // characters for campaign 999
      .mockResolvedValueOnce(mockCharacter);         // character data

    const result = await listCharacters(client);

    expect(result.content).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain("Characters:");
    expect(text).toContain("Thorin Ironforge - Mountain Dwarf Fighter (Battle Master) 5 (Level 5) - Lost Mines of Phandelver");
  });

  it("should handle no characters", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue([]);

    const result = await listCharacters(client);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe("No characters found.");
  });
});
