import { describe, it, expect, vi } from "vitest";
import { getCharacter, listCharacters } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";
import type { DdbCampaign } from "../../src/types/api.js";

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
  },
  classes: [
    {
      id: 1,
      definition: { name: "Fighter" },
      subclassDefinition: { name: "Battle Master" },
      level: 5,
      isStartingClass: true,
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
    characters: [
      {
        characterId: 12345,
        characterName: "Thorin Ironforge",
        userId: 2,
        username: "player1",
      },
    ],
  },
];

describe("getCharacter", () => {
  it("should format character data correctly by ID", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(mockCharacter);

    const result = await getCharacter(client, { characterId: 12345 });

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

  it("should format character data correctly by name", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCharacter);

    const result = await getCharacter(client, { characterName: "Thorin Ironforge" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain("Name: Thorin Ironforge");
  });

  it("should handle missing character by name", async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(mockCampaigns);

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

describe("listCharacters", () => {
  it("should return formatted list of characters", async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCharacter);

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
