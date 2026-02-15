import { describe, it, expect, vi } from "vitest";
import { getCharacter } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter, DdbInventoryItem } from "../../src/types/character.js";

function createMockClient(): DdbClient {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
    put: vi.fn(),
  } as unknown as DdbClient;
}

const baseCharacter: Omit<DdbCharacter, "inventory" | "classes" | "modifiers" | "spells"> = {
  id: 12345,
  readonlyUrl: "https://www.dndbeyond.com/characters/12345",
  name: "Test Character",
  race: {
    fullName: "Human",
    baseRaceName: "Human",
    isHomebrew: false,
    racialTraits: [],
  },
  background: { definition: null },
  stats: [
    { id: 1, value: 10 }, // STR
    { id: 2, value: 14 }, // DEX (+2)
    { id: 3, value: 16 }, // CON (+3)
    { id: 4, value: 10 }, // INT
    { id: 5, value: 18 }, // WIS (+4)
    { id: 6, value: 12 }, // CHA (+1)
  ],
  bonusStats: [],
  overrideStats: [],
  baseHitPoints: 40,
  bonusHitPoints: null,
  overrideHitPoints: null,
  removedHitPoints: 0,
  temporaryHitPoints: 0,
  currentXp: 6500,
  alignmentId: 1,
  lifestyleId: 1,
  currencies: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
  deathSaves: { failCount: null, successCount: null, isStabilized: false },
  traits: {
    personalityTraits: null,
    ideals: null,
    bonds: null,
    flaws: null,
    appearance: null,
  },
  preferences: {},
  configuration: {},
  campaign: null,
  feats: [],
  notes: {
    personalPossessions: null,
    backstory: null,
    otherNotes: null,
    allies: null,
    organizations: null,
  },
  actions: {},
};

describe("AC Calculation", () => {
  it("should calculate base AC with no armor (10 + DEX)", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Wizard" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 12"); // 10 + 2 (DEX mod)
  });

  it("should calculate AC with light armor (armor + full DEX)", async () => {
    const lightArmor: DdbInventoryItem = {
      id: 1,
      definition: {
        name: "Leather Armor",
        description: "Light armor",
        type: "Light Armor",
        rarity: "Common",
        weight: 10,
        cost: 5,
        isHomebrew: false,
        armorClass: 11,
        filterType: "Light Armor",
      },
      equipped: true,
      quantity: 1,
    };

    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Rogue" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [lightArmor],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 13"); // 11 + 2 (full DEX mod)
  });

  it("should calculate AC with medium armor (armor + max 2 DEX)", async () => {
    const mediumArmor: DdbInventoryItem = {
      id: 1,
      definition: {
        name: "Chain Shirt",
        description: "Medium armor",
        type: "Medium Armor",
        rarity: "Common",
        weight: 20,
        cost: 50,
        isHomebrew: false,
        armorClass: 13,
        filterType: "Medium Armor",
      },
      equipped: true,
      quantity: 1,
    };

    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Fighter" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [mediumArmor],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 15"); // 13 + 2 (DEX capped at +2)
  });

  it("should calculate AC with heavy armor (armor only, no DEX)", async () => {
    const heavyArmor: DdbInventoryItem = {
      id: 1,
      definition: {
        name: "Plate Armor",
        description: "Heavy armor",
        type: "Heavy Armor",
        rarity: "Common",
        weight: 65,
        cost: 1500,
        isHomebrew: false,
        armorClass: 18,
        filterType: "Heavy Armor",
      },
      equipped: true,
      quantity: 1,
    };

    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Paladin" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [heavyArmor],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 18"); // 18 only, no DEX
  });

  it("should add shield bonus to AC", async () => {
    const lightArmor: DdbInventoryItem = {
      id: 1,
      definition: {
        name: "Leather Armor",
        description: "Light armor",
        type: "Light Armor",
        rarity: "Common",
        weight: 10,
        cost: 5,
        isHomebrew: false,
        armorClass: 11,
        filterType: "Light Armor",
      },
      equipped: true,
      quantity: 1,
    };

    const shield: DdbInventoryItem = {
      id: 2,
      definition: {
        name: "Shield",
        description: "Shield",
        type: "Shield",
        rarity: "Common",
        weight: 6,
        cost: 10,
        isHomebrew: false,
        armorClass: 2,
      },
      equipped: true,
      quantity: 1,
    };

    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Fighter" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [lightArmor, shield],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 15"); // 11 + 2 (DEX) + 2 (shield)
  });

  it("should calculate Barbarian unarmored defense (10 + DEX + CON)", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Barbarian" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 15"); // 10 + 2 (DEX) + 3 (CON)
  });

  it("should calculate Monk unarmored defense (10 + DEX + WIS)", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Monk" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 16"); // 10 + 2 (DEX) + 4 (WIS)
  });

  it("should add AC modifiers from features", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Wizard" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: {
        race: [],
        class: [
          {
            id: 1,
            type: "bonus",
            subType: "armor-class",
            value: 2,
            friendlyTypeName: "Bonus",
            friendlySubtypeName: "Armor Class",
            componentId: 1,
            componentTypeId: 1,
          },
        ],
        background: [],
        item: [],
        feat: [],
        condition: [],
      },
      spells: { race: [], class: [], background: [], item: [], feat: [] },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    expect(text).toContain("AC: 14"); // 10 + 2 (DEX) + 2 (modifier)
  });
});

describe("Spell Save DC Calculation", () => {
  it("should calculate Cleric spell DC using WIS", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      classes: [
        {
          id: 1,
          definition: { name: "Cleric" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: {
        race: [],
        class: [
          {
            id: 1,
            definition: {
              name: "Cure Wounds",
              level: 1,
              school: "Evocation",
              description: "Healing spell",
              range: null,
              duration: null,
              activation: null,
              components: null,
              componentsDescription: null,
              concentration: false,
              ritual: false,
            },
            prepared: true,
            alwaysPrepared: false,
            usesSpellSlot: true,
          },
        ],
        background: [],
        item: [],
        feat: [],
      },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    // Spell save DC = 8 + proficiency (3 at level 5) + WIS mod (4)
    expect(text).toContain("Spell Save DC: 15");
    expect(text).toContain("Spell Attack: +7");
  });

  it("should calculate Wizard spell DC using INT", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      stats: [
        { id: 1, value: 10 }, // STR
        { id: 2, value: 14 }, // DEX (+2)
        { id: 3, value: 16 }, // CON (+3)
        { id: 4, value: 18 }, // INT (+4) <-- spellcasting ability
        { id: 5, value: 10 }, // WIS
        { id: 6, value: 12 }, // CHA (+1)
      ],
      classes: [
        {
          id: 1,
          definition: { name: "Wizard" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: {
        race: [],
        class: [
          {
            id: 1,
            definition: {
              name: "Fireball",
              level: 3,
              school: "Evocation",
              description: "Fire spell",
              range: null,
              duration: null,
              activation: null,
              components: null,
              componentsDescription: null,
              concentration: false,
              ritual: false,
            },
            prepared: true,
            alwaysPrepared: false,
            usesSpellSlot: true,
          },
        ],
        background: [],
        item: [],
        feat: [],
      },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    // Spell save DC = 8 + proficiency (3 at level 5) + INT mod (4)
    expect(text).toContain("Spell Save DC: 15");
    expect(text).toContain("Spell Attack: +7");
  });

  it("should calculate Sorcerer spell DC using CHA", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      stats: [
        { id: 1, value: 10 }, // STR
        { id: 2, value: 14 }, // DEX (+2)
        { id: 3, value: 16 }, // CON (+3)
        { id: 4, value: 10 }, // INT
        { id: 5, value: 10 }, // WIS
        { id: 6, value: 18 }, // CHA (+4) <-- spellcasting ability
      ],
      classes: [
        {
          id: 1,
          definition: { name: "Sorcerer" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: {
        race: [],
        class: [
          {
            id: 1,
            definition: {
              name: "Magic Missile",
              level: 1,
              school: "Evocation",
              description: "Force missile",
              range: null,
              duration: null,
              activation: null,
              components: null,
              componentsDescription: null,
              concentration: false,
              ritual: false,
            },
            prepared: true,
            alwaysPrepared: false,
            usesSpellSlot: true,
          },
        ],
        background: [],
        item: [],
        feat: [],
      },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    // Spell save DC = 8 + proficiency (3 at level 5) + CHA mod (4)
    expect(text).toContain("Spell Save DC: 15");
    expect(text).toContain("Spell Attack: +7");
  });

  it("should show separate DCs for multiclass spellcasters", async () => {
    const character: DdbCharacter = {
      ...baseCharacter,
      stats: [
        { id: 1, value: 10 }, // STR
        { id: 2, value: 14 }, // DEX (+2)
        { id: 3, value: 16 }, // CON (+3)
        { id: 4, value: 10 }, // INT
        { id: 5, value: 18 }, // WIS (+4)
        { id: 6, value: 16 }, // CHA (+3)
      ],
      classes: [
        {
          id: 1,
          definition: { name: "Cleric" },
          subclassDefinition: null,
          level: 3,
          isStartingClass: true,
          classFeatures: [],
        },
        {
          id: 2,
          definition: { name: "Sorcerer" },
          subclassDefinition: null,
          level: 2,
          isStartingClass: false,
          classFeatures: [],
        },
      ],
      inventory: [],
      modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
      spells: {
        race: [],
        class: [
          {
            id: 1,
            definition: {
              name: "Cure Wounds",
              level: 1,
              school: "Evocation",
              description: "Healing spell",
              range: null,
              duration: null,
              activation: null,
              components: null,
              componentsDescription: null,
              concentration: false,
              ritual: false,
            },
            prepared: true,
            alwaysPrepared: false,
            usesSpellSlot: true,
          },
        ],
        background: [],
        item: [],
        feat: [],
      },
    };

    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValue(character);

    const result = await getCharacter(client, { characterId: 12345, detail: "sheet" });
    const text = result.content[0].text;

    // Cleric: 8 + 3 (prof) + 4 (WIS) = DC 15, +7 attack
    // Sorcerer: 8 + 3 (prof) + 3 (CHA) = DC 14, +6 attack
    expect(text).toContain("Cleric: DC 15 (+7 attack)");
    expect(text).toContain("Sorcerer: DC 14 (+6 attack)");
  });
});
