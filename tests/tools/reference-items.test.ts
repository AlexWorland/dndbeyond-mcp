import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchItems,
  getItem,
  searchFeats,
  getCondition,
  searchClasses,
} from "../../src/tools/reference-extended.js";
import { DdbClient } from "../../src/api/client.js";
import { ItemSearchParams, FeatSearchParams } from "../../src/types/reference.js";

describe("searchItems", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenItemsFound", async () => {
    const params: ItemSearchParams = { name: "sword" };

    const result = await searchItems(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0].text).toContain("Magic Item Search Results");
  });

  it("shouldReturnNoResultsMessageWhenNoItemsFound", async () => {
    const params: ItemSearchParams = { name: "nonexistent" };

    const result = await searchItems(mockClient, params);

    expect(result.content[0].text).toContain("No items found");
  });

  it("shouldAcceptMultipleSearchParameters", async () => {
    const params: ItemSearchParams = {
      name: "sword",
      rarity: "legendary",
      type: "weapon",
      attunement: true,
    };

    const result = await searchItems(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const params: ItemSearchParams = {};

    const result = await searchItems(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });
});

describe("getItem", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNotFoundMessageWhenItemDoesNotExist", async () => {
    const params = { itemName: "Nonexistent Item" };

    const result = await getItem(mockClient, params);

    expect(result.content[0].text).toContain("not found");
    expect(result.content[0].text).toContain("Nonexistent Item");
  });

  it("shouldReturnFormattedItemDetailsStructure", async () => {
    const params = { itemName: "Sword of Sharpness" };

    const result = await getItem(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0]).toHaveProperty("text");
  });

  it("shouldHandleItemNameCaseInsensitively", async () => {
    const params1 = { itemName: "SWORD" };
    const params2 = { itemName: "sword" };
    const params3 = { itemName: "Sword" };

    const result1 = await getItem(mockClient, params1);
    const result2 = await getItem(mockClient, params2);
    const result3 = await getItem(mockClient, params3);

    expect(result1).toHaveProperty("content");
    expect(result2).toHaveProperty("content");
    expect(result3).toHaveProperty("content");
  });
});

describe("searchFeats", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenFeatsFound", async () => {
    const params: FeatSearchParams = { name: "alert" };

    const result = await searchFeats(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0].text).toContain("Feat Search Results");
  });

  it("shouldReturnNoResultsMessageWhenNoFeatsFound", async () => {
    const params: FeatSearchParams = { name: "nonexistent" };

    const result = await searchFeats(mockClient, params);

    expect(result.content[0].text).toContain("No feats found");
  });

  it("shouldAcceptPrerequisiteParameter", async () => {
    const params: FeatSearchParams = {
      name: "magic initiate",
      prerequisite: "spellcasting",
    };

    const result = await searchFeats(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const params: FeatSearchParams = {};

    const result = await searchFeats(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });
});

describe("getCondition", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNotFoundMessageWhenConditionDoesNotExist", async () => {
    const params = { conditionName: "Nonexistent Condition" };

    const result = await getCondition(mockClient, params);

    expect(result.content[0].text).toContain("not found");
    expect(result.content[0].text).toContain("Nonexistent Condition");
  });

  it("shouldReturnFormattedConditionDetailsStructure", async () => {
    const params = { conditionName: "Blinded" };

    const result = await getCondition(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0]).toHaveProperty("text");
  });

  it("shouldHandleCommonConditions", async () => {
    const conditions = ["Blinded", "Charmed", "Deafened", "Frightened", "Paralyzed", "Stunned"];

    for (const conditionName of conditions) {
      const result = await getCondition(mockClient, { conditionName });
      expect(result).toHaveProperty("content");
      expect(result.content[0]).toHaveProperty("type", "text");
    }
  });
});

describe("searchClasses", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNoResultsMessageWhenNoClassesFound", async () => {
    const params = { className: "nonexistent" };

    const result = await searchClasses(mockClient, params);

    expect(result.content[0].text).toContain("No classes found");
  });

  it("shouldReturnFormattedClassDetailsStructure", async () => {
    const params = { className: "Fighter" };

    const result = await searchClasses(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0]).toHaveProperty("text");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const params = {};

    const result = await searchClasses(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldHandleCommonClasses", async () => {
    const classes = ["Fighter", "Wizard", "Rogue", "Cleric", "Barbarian"];

    for (const className of classes) {
      const result = await searchClasses(mockClient, { className });
      expect(result).toHaveProperty("content");
      expect(result.content[0]).toHaveProperty("type", "text");
    }
  });
});
