import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchMonsters, getMonster } from "../../src/tools/reference-extended.js";
import { DdbClient } from "../../src/api/client.js";
import { MonsterSearchParams } from "../../src/types/reference.js";

describe("searchMonsters", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenMonstersFound", async () => {
    const params: MonsterSearchParams = { name: "dragon" };

    const result = await searchMonsters(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0]).toHaveProperty("text");
    expect(result.content[0].text).toContain("Monster Search Results");
  });

  it("shouldReturnNoResultsMessageWhenNoMonstersFound", async () => {
    const params: MonsterSearchParams = { name: "nonexistent" };

    const result = await searchMonsters(mockClient, params);

    expect(result.content[0].text).toContain("No monsters found");
  });

  it("shouldAcceptMultipleSearchParameters", async () => {
    const params: MonsterSearchParams = {
      name: "dragon",
      cr: 10,
      type: "dragon",
      size: "huge",
      environment: "mountain",
    };

    const result = await searchMonsters(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const params: MonsterSearchParams = {};

    const result = await searchMonsters(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(result.content[0]).toHaveProperty("type", "text");
  });
});

describe("getMonster", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnNotFoundMessageWhenMonsterDoesNotExist", async () => {
    const params = { monsterName: "Nonexistent Monster" };

    const result = await getMonster(mockClient, params);

    expect(result.content[0].text).toContain("not found");
    expect(result.content[0].text).toContain("Nonexistent Monster");
  });

  it("shouldReturnFormattedStatBlockStructure", async () => {
    const params = { monsterName: "Adult Red Dragon" };

    const result = await getMonster(mockClient, params);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0]).toHaveProperty("text");
  });

  it("shouldHandleMonsterNameCaseInsensitively", async () => {
    const params1 = { monsterName: "DRAGON" };
    const params2 = { monsterName: "dragon" };
    const params3 = { monsterName: "Dragon" };

    const result1 = await getMonster(mockClient, params1);
    const result2 = await getMonster(mockClient, params2);
    const result3 = await getMonster(mockClient, params3);

    expect(result1).toHaveProperty("content");
    expect(result2).toHaveProperty("content");
    expect(result3).toHaveProperty("content");
  });
});
