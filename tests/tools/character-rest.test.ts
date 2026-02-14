import { describe, it, expect, vi, beforeEach } from "vitest";
import { longRest, shortRest } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";

describe("longRest", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      getRaw: vi.fn(),
      put: vi.fn(),
    };
  });

  it("should reset HP, spell slots, pact magic, and long-rest abilities", async () => {
    const mockCharacter: Partial<DdbCharacter> = {
      id: 123,
      name: "Test Character",
      baseHitPoints: 50,
      bonusHitPoints: 0,
      overrideHitPoints: null,
      removedHitPoints: 10,
      temporaryHitPoints: 0,
      classes: [
        {
          id: 1,
          definition: { name: "Warlock" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      actions: {
        class: [
          {
            id: 1,
            entityTypeId: 1234567890,
            name: "Second Wind",
            componentId: 1,
            componentTypeId: 1,
            limitedUse: {
              maxUses: 1,
              numberUsed: 1,
              resetType: 1, // Long Rest
              resetTypeDescription: "Long Rest",
            },
          },
        ],
      },
      stats: [],
      bonusStats: [],
      overrideStats: [],
      modifiers: {},
    };

    vi.mocked(mockClient.get).mockResolvedValue(mockCharacter as DdbCharacter);

    const result = await longRest(mockClient, { characterId: 123 });

    expect(result.content[0].text).toContain("Long rest completed for Test Character:");
    expect(result.content[0].text).toContain("HP restored to full (50/50)");
    // Warlock uses pact magic, not spell slots
    expect(result.content[0].text).not.toContain("Spell slots reset (levels 1-9)");
    expect(result.content[0].text).toContain("Pact magic reset");
    expect(result.content[0].text).toContain("Long-rest abilities reset: Second Wind");

    // Verify HP reset call
    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/character/123/life/hp/damage-taken",
      { removedHitPoints: 0, temporaryHitPoints: 0 },
      ["character:123"]
    );

    // Verify pact magic reset (Warlock doesn't use spell slots, only pact magic)
    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/character/123/spell/pact-magic",
      { used: 0 },
      ["character:123"]
    );

    // Verify limited use reset
    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/action/limited-use",
      {
        characterId: 123,
        id: "1",
        entityTypeId: "1234567890",
        uses: 0,
      },
      ["character:123"]
    );
  });

  it("should handle characters without warlock class", async () => {
    const mockCharacter: Partial<DdbCharacter> = {
      id: 123,
      name: "Fighter",
      baseHitPoints: 60,
      bonusHitPoints: 0,
      overrideHitPoints: null,
      removedHitPoints: 5,
      temporaryHitPoints: 0,
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
      actions: {},
      stats: [],
      bonusStats: [],
      overrideStats: [],
      modifiers: {},
    };

    vi.mocked(mockClient.get).mockResolvedValue(mockCharacter as DdbCharacter);

    const result = await longRest(mockClient, { characterId: 123 });

    expect(result.content[0].text).toContain("Long rest completed for Fighter:");
    expect(result.content[0].text).toContain("HP restored to full (60/60)");
    // Fighter doesn't have spell slots
    expect(result.content[0].text).not.toContain("Spell slots reset (levels 1-9)");
    expect(result.content[0].text).not.toContain("Pact magic reset");
  });
});

describe("shortRest", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      getRaw: vi.fn(),
      put: vi.fn(),
    };
  });

  it("should reset pact magic and short-rest abilities", async () => {
    const mockCharacter: Partial<DdbCharacter> = {
      id: 123,
      name: "Test Character",
      classes: [
        {
          id: 1,
          definition: { name: "Warlock" },
          subclassDefinition: null,
          level: 5,
          isStartingClass: true,
          classFeatures: [],
        },
      ],
      actions: {
        class: [
          {
            id: 2,
            entityTypeId: 9876543210,
            name: "Action Surge",
            componentId: 2,
            componentTypeId: 2,
            limitedUse: {
              maxUses: 1,
              numberUsed: 1,
              resetType: 2, // Short Rest
              resetTypeDescription: "Short Rest",
            },
          },
        ],
      },
    };

    vi.mocked(mockClient.get).mockResolvedValue(mockCharacter as DdbCharacter);

    const result = await shortRest(mockClient, { characterId: 123 });

    expect(result.content[0].text).toContain("Short rest completed for Test Character:");
    expect(result.content[0].text).toContain("Pact magic reset");
    expect(result.content[0].text).toContain("Short-rest abilities reset: Action Surge");
    expect(result.content[0].text).toContain("Hit dice spending not available via API");

    // Verify pact magic reset
    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/character/123/spell/pact-magic",
      { used: 0 },
      ["character:123"]
    );

    // Verify limited use reset
    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/action/limited-use",
      {
        characterId: 123,
        id: "2",
        entityTypeId: "9876543210",
        uses: 0,
      },
      ["character:123"]
    );
  });

  it("should handle characters without warlock class", async () => {
    const mockCharacter: Partial<DdbCharacter> = {
      id: 123,
      name: "Fighter",
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
      actions: {},
    };

    vi.mocked(mockClient.get).mockResolvedValue(mockCharacter as DdbCharacter);

    const result = await shortRest(mockClient, { characterId: 123 });

    expect(result.content[0].text).toContain("Short rest completed for Fighter:");
    expect(result.content[0].text).not.toContain("Pact magic reset");
    expect(result.content[0].text).toContain("Hit dice spending not available via API");
  });
});
