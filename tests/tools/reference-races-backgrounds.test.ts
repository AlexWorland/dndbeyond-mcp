import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchRaces, searchBackgrounds } from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";
import { RaceSearchParams, BackgroundSearchParams } from "../../src/types/reference.js";

const MOCK_RACES = [
  {
    id: 1,
    name: "Human",
    description: "Humans are the most adaptable and ambitious people among the common races.",
    isHomebrew: false,
    sources: [{ sourceId: 1 }],
  },
  {
    id: 2,
    name: "Elf",
    description: "Elves are a magical people of otherworldly grace, living in the world but not entirely part of it.",
    isHomebrew: false,
    sources: [{ sourceId: 1 }],
  },
  {
    id: 3,
    name: "Half-Elf",
    description: "Half-elves combine what some say are the best qualities of their elf and human parents.",
    isHomebrew: false,
    sources: [{ sourceId: 1 }],
  },
];

const MOCK_BACKGROUNDS = [
  {
    id: 1,
    name: "Acolyte",
    description: "You have spent your life in the service of a temple to a specific god or pantheon of gods.",
    isHomebrew: false,
    sources: [{ sourceId: 1 }],
  },
  {
    id: 2,
    name: "Criminal",
    description: "You are an experienced criminal with a history of breaking the law.",
    isHomebrew: false,
    sources: [{ sourceId: 1 }],
  },
  {
    id: 3,
    name: "Folk Hero",
    description: "You come from a humble social rank, but you are destined for so much more.",
    isHomebrew: false,
    sources: [{ sourceId: 1 }],
  },
];

describe("searchRaces", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(MOCK_RACES),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenRacesFound", async () => {
    const result = await searchRaces(mockClient, { name: "elf" });

    expect(result.content[0].text).toContain("Race Search Results");
    expect(result.content[0].text).toContain("Elf");
    expect(result.content[0].text).toContain("Half-Elf");
  });

  it("shouldReturnNoResultsMessageWhenNoRacesFound", async () => {
    const result = await searchRaces(mockClient, { name: "nonexistent" });

    expect(result.content[0].text).toContain("No races found");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const result = await searchRaces(mockClient, {});

    expect(result).toHaveProperty("content");
    expect(result.content[0].text).toContain("Race Search Results");
    expect(result.content[0].text).toContain("Human");
    expect(result.content[0].text).toContain("Elf");
  });

  it("shouldHandleCaseInsensitiveSearch", async () => {
    const result = await searchRaces(mockClient, { name: "HUMAN" });

    expect(result.content[0].text).toContain("Human");
  });

  it("shouldSortRacesAlphabetically", async () => {
    const result = await searchRaces(mockClient, {});
    const text = result.content[0].text;
    const elfIndex = text.indexOf("Elf");
    const humanIndex = text.indexOf("Human");

    // Elf should appear before Human alphabetically
    expect(elfIndex).toBeGreaterThan(0);
    expect(humanIndex).toBeGreaterThan(elfIndex);
  });
});

describe("searchBackgrounds", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(MOCK_BACKGROUNDS),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("shouldReturnFormattedListWhenBackgroundsFound", async () => {
    const result = await searchBackgrounds(mockClient, { name: "criminal" });

    expect(result.content[0].text).toContain("Background Search Results");
    expect(result.content[0].text).toContain("Criminal");
  });

  it("shouldReturnNoResultsMessageWhenNoBackgroundsFound", async () => {
    const result = await searchBackgrounds(mockClient, { name: "nonexistent" });

    expect(result.content[0].text).toContain("No backgrounds found");
  });

  it("shouldAcceptEmptySearchParameters", async () => {
    const result = await searchBackgrounds(mockClient, {});

    expect(result).toHaveProperty("content");
    expect(result.content[0].text).toContain("Background Search Results");
    expect(result.content[0].text).toContain("Acolyte");
    expect(result.content[0].text).toContain("Criminal");
  });

  it("shouldHandleCaseInsensitiveSearch", async () => {
    const result = await searchBackgrounds(mockClient, { name: "FOLK" });

    expect(result.content[0].text).toContain("Folk Hero");
  });

  it("shouldSortBackgroundsAlphabetically", async () => {
    const result = await searchBackgrounds(mockClient, {});
    const text = result.content[0].text;
    const acolyteIndex = text.indexOf("Acolyte");
    const criminalIndex = text.indexOf("Criminal");

    // Acolyte should appear before Criminal alphabetically
    expect(acolyteIndex).toBeGreaterThan(0);
    expect(criminalIndex).toBeGreaterThan(acolyteIndex);
  });
});
