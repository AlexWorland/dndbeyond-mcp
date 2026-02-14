import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchItems,
  getItem,
  searchFeats,
  getCondition,
  searchClasses,
} from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";
import { ItemSearchParams, FeatSearchParams } from "../../src/types/reference.js";

const MOCK_ITEMS = [
  {
    id: 1, name: "Flame Tongue Longsword", type: "Weapon", filterType: "Weapon",
    rarity: "Rare", requiresAttunement: true, attunementDescription: "",
    description: "A fiery blade.", snippet: "A fiery blade.", weight: 3,
    cost: null, armorClass: null, damage: { diceString: "1d8" },
    properties: [{ name: "Versatile" }], isHomebrew: false, sources: [],
    canAttune: true, magic: true,
  },
  {
    id: 2, name: "Bag of Holding", type: "Wondrous Item", filterType: "Wondrous Item",
    rarity: "Uncommon", requiresAttunement: false, attunementDescription: "",
    description: "A bag that holds more.", snippet: "", weight: 15,
    cost: null, armorClass: null, damage: null, properties: null,
    isHomebrew: false, sources: [], canAttune: false, magic: true,
  },
];

const MOCK_FEATS = [
  { id: 1, name: "Alert", description: "Always on the lookout.", snippet: "Can't be surprised.", prerequisite: null, isHomebrew: false, sources: [] },
  { id: 2, name: "Grappler", description: "Advantage on grapple checks.", snippet: "Better at grappling.", prerequisite: "Strength 13 or higher", isHomebrew: false, sources: [] },
];

const MOCK_CLASSES = [
  { id: 10, name: "Fighter", description: "A master of martial combat.", hitDice: 10, isHomebrew: false, spellCastingAbilityId: null, sources: [] },
  { id: 8, name: "Wizard", description: "A scholarly magic-user.", hitDice: 6, isHomebrew: false, spellCastingAbilityId: 4, sources: [] },
];

describe("searchItems", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(MOCK_ITEMS),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenItemsFound", async () => {
    const result = await searchItems(mockClient, { name: "flame" });

    expect(result.content[0].text).toContain("Item Search Results");
    expect(result.content[0].text).toContain("Flame Tongue Longsword");
  });

  it("shouldReturnNoResultsMessageWhenNoItemsFound", async () => {
    const result = await searchItems(mockClient, { name: "nonexistent" });

    expect(result.content[0].text).toContain("No items found");
  });

  it("shouldAcceptMultipleSearchParameters", async () => {
    const params: ItemSearchParams = { name: "sword", rarity: "rare", type: "weapon" };
    const result = await searchItems(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const result = await searchItems(mockClient, {});

    expect(result).toHaveProperty("content");
    expect(result.content[0].text).toContain("Item Search Results");
  });
});

describe("getItem", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(MOCK_ITEMS),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNotFoundMessageWhenItemDoesNotExist", async () => {
    const result = await getItem(mockClient, { itemName: "Nonexistent Item" });

    expect(result.content[0].text).toContain("not found");
    expect(result.content[0].text).toContain("Nonexistent Item");
  });

  it("shouldReturnFormattedItemDetailsStructure", async () => {
    const result = await getItem(mockClient, { itemName: "Flame Tongue Longsword" });

    expect(result.content[0].text).toContain("Flame Tongue Longsword");
    expect(result.content[0].text).toContain("Rare");
  });

  it("shouldHandleItemNameCaseInsensitively", async () => {
    const result = await getItem(mockClient, { itemName: "bag of holding" });
    expect(result.content[0].text).toContain("Bag of Holding");
  });
});

describe("searchFeats", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(MOCK_FEATS),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenFeatsFound", async () => {
    const result = await searchFeats(mockClient, { name: "alert" });

    expect(result.content[0].text).toContain("Feat Search Results");
    expect(result.content[0].text).toContain("Alert");
  });

  it("shouldReturnNoResultsMessageWhenNoFeatsFound", async () => {
    const result = await searchFeats(mockClient, { name: "nonexistent" });

    expect(result.content[0].text).toContain("No feats found");
  });

  it("shouldAcceptPrerequisiteParameter", async () => {
    const result = await searchFeats(mockClient, { name: "grappler", prerequisite: "strength" });

    expect(result).toHaveProperty("content");
    expect(result.content[0].text).toContain("Grappler");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const result = await searchFeats(mockClient, {});

    expect(result).toHaveProperty("content");
    expect(result.content[0].text).toContain("Feat Search Results");
  });
});

describe("getCondition", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNotFoundMessageWhenConditionDoesNotExist", async () => {
    const result = await getCondition(mockClient, { conditionName: "Nonexistent Condition" });

    expect(result.content[0].text).toContain("not found");
    expect(result.content[0].text).toContain("Nonexistent Condition");
  });

  it("shouldReturnFormattedConditionDetailsStructure", async () => {
    const result = await getCondition(mockClient, { conditionName: "blinded" });

    expect(result.content[0].text).toContain("Blinded");
    expect(result.content[0].text).toContain("can't see");
  });

  it("shouldHandleCommonConditions", async () => {
    const conditions = ["blinded", "charmed", "deafened", "frightened", "paralyzed", "stunned"];

    for (const conditionName of conditions) {
      const result = await getCondition(mockClient, { conditionName });
      expect(result).toHaveProperty("content");
      expect(result.content[0].text.length).toBeGreaterThan(10);
    }
  });
});

describe("searchClasses", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(MOCK_CLASSES),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNoResultsMessageWhenNoClassesFound", async () => {
    const result = await searchClasses(mockClient, { className: "nonexistent" });

    expect(result.content[0].text).toContain("No classes found");
  });

  it("shouldReturnFormattedClassDetailsStructure", async () => {
    const result = await searchClasses(mockClient, { className: "Fighter" });

    expect(result.content[0].text).toContain("Fighter");
    expect(result.content[0].text).toContain("d10");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const result = await searchClasses(mockClient, {});

    expect(result).toHaveProperty("content");
    expect(result.content[0].text).toContain("Class Search Results");
  });

  it("shouldHandleCommonClasses", async () => {
    const result = await searchClasses(mockClient, {});
    expect(result.content[0].text).toContain("Fighter");
    expect(result.content[0].text).toContain("Wizard");
  });
});
