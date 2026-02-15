import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateHp, updateSpellSlots, updateDeathSaves, updateCurrency, useAbility } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";

const mockCharacter: DdbCharacter = {
  id: 123,
  readonlyUrl: "https://example.com",
  name: "Test Character",
  race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false },
  classes: [
    {
      id: 1,
      definition: { name: "Fighter" },
      subclassDefinition: null,
      level: 5,
      isStartingClass: true,
    },
  ],
  level: 5,
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
    race: [],
    class: [],
    background: [],
    item: [],
    feat: [],
    condition: [],
  },
  baseHitPoints: 40,
  bonusHitPoints: 5,
  overrideHitPoints: null,
  removedHitPoints: 10,
  temporaryHitPoints: 0,
  currentXp: 6500,
  alignmentId: 1,
  lifestyleId: 1,
  currencies: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
  spells: {
    race: [],
    class: [],
    background: [],
    item: [],
    feat: [],
  },
  inventory: [],
  deathSaves: { failCount: 0, successCount: 0, isStabilized: false },
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
};

// Character with actions for useAbility tests
const mockCharacterWithActions: DdbCharacter = {
  ...mockCharacter,
  actions: {
    class: [
      {
        id: 100,
        entityTypeId: 200,
        name: "Action Surge",
        limitedUse: {
          maxUses: 1,
          numberUsed: 0,
          resetTypeDescription: "Short Rest",
        },
      },
    ],
  },
};

describe("updateHp", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(mockCharacter),
      getRaw: vi.fn(),
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should heal character when hpChange is positive", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: 10,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 0 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Healed Test Character for 10 HP");
  });

  it("should damage character when hpChange is negative", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: -5,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 15 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Damaged Test Character for 5 HP");
  });

  it("should not allow negative HP", async () => {
    await updateHp(mockClient, {
      characterId: 123,
      hpChange: -100,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.anything(),
      { characterId: 123, removedHitPoints: 45 },
      expect.anything()
    );
  });
});

describe("updateSpellSlots", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should update spell slots for valid level", async () => {
    const result = await updateSpellSlots(mockClient, {
      characterId: 123,
      level: 3,
      used: 2,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/character/123/spell/slots"),
      { level: 3, used: 2 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Updated level 3 spell slots to 2 used");
  });

  it("should reject invalid spell level below 1", async () => {
    const result = await updateSpellSlots(mockClient, {
      characterId: 123,
      level: 0,
      used: 1,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Spell slot level must be between 1 and 9");
  });

  it("should reject invalid spell level above 9", async () => {
    const result = await updateSpellSlots(mockClient, {
      characterId: 123,
      level: 10,
      used: 1,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Spell slot level must be between 1 and 9");
  });

  it("should reject negative used slots", async () => {
    const result = await updateSpellSlots(mockClient, {
      characterId: 123,
      level: 1,
      used: -1,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Used spell slots cannot be negative");
  });
});

describe("updateDeathSaves", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should update success death saves", async () => {
    const result = await updateDeathSaves(mockClient, {
      characterId: 123,
      type: "success",
      count: 2,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/character/123/life/death-saves"),
      { successCount: 2 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Updated death saves: 2 successes");
  });

  it("should update failure death saves", async () => {
    const result = await updateDeathSaves(mockClient, {
      characterId: 123,
      type: "failure",
      count: 1,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/character/123/life/death-saves"),
      { failCount: 1 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Updated death saves: 1 failure");
  });

  it("should reject invalid type", async () => {
    const result = await updateDeathSaves(mockClient, {
      characterId: 123,
      type: "invalid" as "success",
      count: 1,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Death save type must be 'success' or 'failure'");
  });

  it("should reject count below 0", async () => {
    const result = await updateDeathSaves(mockClient, {
      characterId: 123,
      type: "success",
      count: -1,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Death save count must be between 0 and 3");
  });

  it("should reject count above 3", async () => {
    const result = await updateDeathSaves(mockClient, {
      characterId: 123,
      type: "success",
      count: 4,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Death save count must be between 0 and 3");
  });
});

describe("updateCurrency", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should update gold pieces", async () => {
    const result = await updateCurrency(mockClient, {
      characterId: 123,
      currency: "gp",
      amount: 150,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/character/123/inventory/currency"),
      { gp: 150 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Set GP to 150");
  });

  it("should update all currency types", async () => {
    const currencies = ["cp", "sp", "ep", "gp", "pp"] as const;

    for (const currency of currencies) {
      await updateCurrency(mockClient, {
        characterId: 123,
        currency,
        amount: 10,
      });

      expect(mockClient.put).toHaveBeenCalledWith(
        expect.anything(),
        { [currency]: 10 },
        ["character:123"]
      );
    }
  });

  it("should reject invalid currency type", async () => {
    const result = await updateCurrency(mockClient, {
      characterId: 123,
      currency: "invalid" as "gp",
      amount: 100,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Currency must be one of: cp, sp, ep, gp, pp");
  });
});

describe("useAbility", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(mockCharacterWithActions),
      getRaw: vi.fn(),
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should use a limited ability", async () => {
    const result = await useAbility(mockClient, {
      characterId: 123,
      abilityName: "Action Surge",
    });

    expect(mockClient.get).toHaveBeenCalled();
    expect(mockClient.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        characterId: 123,
        id: "100",
        entityTypeId: "200",
        uses: 1,
      }),
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Action Surge");
    expect(result.content[0].text).toContain("1/1 uses expended");
  });

  it("should reject empty ability name", async () => {
    const result = await useAbility(mockClient, {
      characterId: 123,
      abilityName: "",
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Ability name cannot be empty");
  });

  it("should reject whitespace-only ability name", async () => {
    const result = await useAbility(mockClient, {
      characterId: 123,
      abilityName: "   ",
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Ability name cannot be empty");
  });
});

describe("updateHp with temporary HP", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(mockCharacter),
      getRaw: vi.fn(),
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should include temporaryHitPoints in PUT body when tempHp is provided", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: 5,
      tempHp: 10,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 5, temporaryHitPoints: 10 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("(10 temp HP)");
  });

  it("should not include temporaryHitPoints when tempHp is undefined", async () => {
    await updateHp(mockClient, {
      characterId: 123,
      hpChange: 5,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 5 },
      ["character:123"]
    );
  });

  it("should set temporaryHitPoints to 0 when tempHp is 0", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: 0,
      tempHp: 0,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.anything(),
      { characterId: 123, removedHitPoints: 10, temporaryHitPoints: 0 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("(0 temp HP)");
  });
});
