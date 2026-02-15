import { describe, it, expect, vi } from "vitest";
import { getCharacterSheet } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";
import type { DdbCampaign } from "../../src/types/api.js";

function createMockClient(): DdbClient {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
  } as unknown as DdbClient;
}

const mockCampaigns: DdbCampaign[] = [
  {
    id: 999,
    name: "Test Campaign",
    dmId: 1,
    dmUsername: "dm",
    playerCount: 1,
    dateCreated: "1/1/2026",
  },
];

const mockCampaignCharacters = [
  { id: 12345, name: "Thorin", userId: 1, userName: "player1", avatarUrl: "", characterStatus: 0, isAssigned: true },
];

function createCharacterWithProficiencies(): DdbCharacter {
  return {
    id: 12345,
    readonlyUrl: "",
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
        subclassDefinition: null,
        level: 5,
        isStartingClass: true,
        classFeatures: [],
      },
    ],
    background: { definition: null },
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
      race: [
        { id: "r1", type: "proficiency", subType: "battleaxes", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Battleaxes", componentId: 1, componentTypeId: 1 },
        { id: "r2", type: "proficiency", subType: "common", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Common", componentId: 1, componentTypeId: 1 },
        { id: "r3", type: "proficiency", subType: "dwarvish", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Dwarvish", componentId: 1, componentTypeId: 1 },
      ],
      class: [
        { id: "c1", type: "proficiency", subType: "light-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Light Armor", componentId: 2, componentTypeId: 2 },
        { id: "c2", type: "proficiency", subType: "medium-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Medium Armor", componentId: 2, componentTypeId: 2 },
        { id: "c3", type: "proficiency", subType: "heavy-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Heavy Armor", componentId: 2, componentTypeId: 2 },
        { id: "c4", type: "proficiency", subType: "shields", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Shields", componentId: 2, componentTypeId: 2 },
        { id: "c5", type: "proficiency", subType: "simple-weapons", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Simple Weapons", componentId: 2, componentTypeId: 2 },
        { id: "c6", type: "proficiency", subType: "martial-weapons", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Martial Weapons", componentId: 2, componentTypeId: 2 },
        { id: "c7", type: "proficiency", subType: "strength-saving-throws", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Strength Saving Throws", componentId: 2, componentTypeId: 2 },
      ],
      background: [
        { id: "b1", type: "proficiency", subType: "smiths-tools", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Smith's Tools", componentId: 3, componentTypeId: 3 },
      ],
      item: [],
      feat: [],
      condition: [],
    },
    baseHitPoints: 42,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currentXp: 0,
    alignmentId: 1,
    lifestyleId: 1,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: { race: [], class: [], background: [], item: [], feat: [] },
    inventory: [],
    deathSaves: { failCount: null, successCount: null, isStabilized: false },
    traits: { personalityTraits: null, ideals: null, bonds: null, flaws: null, appearance: null },
    preferences: {},
    configuration: {},
    actions: { race: [], class: [], feat: [] },
    feats: [],
    notes: { personalPossessions: null, backstory: null, otherNotes: null, allies: null, organizations: null },
    campaign: { id: 999, name: "Test Campaign" },
  };
}

describe("formatProficiencies in character sheet", () => {
  it("should display armor, weapon, tool, and language proficiencies", async () => {
    const client = createMockClient();
    const char = createCharacterWithProficiencies();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(char);

    const result = await getCharacterSheet(client, { characterName: "Thorin" });
    const text = result.content[0].text;

    expect(text).toContain("--- Proficiencies ---");
    expect(text).toContain("Armor:");
    expect(text).toContain("Light Armor");
    expect(text).toContain("Heavy Armor");
    expect(text).toContain("Weapons:");
    expect(text).toContain("Simple Weapons");
    expect(text).toContain("Tools:");
    expect(text).toContain("Smith's Tools");
    expect(text).toContain("Languages:");
    expect(text).toContain("Common");
    expect(text).toContain("Dwarvish");
  });

  it("should exclude saving throw and skill proficiencies from the proficiencies section", async () => {
    const client = createMockClient();
    const char = createCharacterWithProficiencies();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(char);

    const result = await getCharacterSheet(client, { characterName: "Thorin" });
    const profSection = result.content[0].text.split("--- Proficiencies ---")[1]?.split("---")[0] ?? "";

    // Saving throws should NOT appear in proficiencies section (they have their own section)
    expect(profSection).not.toContain("Saving Throws");
  });
});
