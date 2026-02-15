import { describe, it, expect } from "vitest";
import {
  computeFinalAbilityScore,
  sumModifierBonuses,
  calculateAc,
  computeLevel,
  calculateMaxHp,
  calculateCurrentHp,
} from "../../src/utils/character-calculations.js";
import type { DdbCharacter, DdbModifier } from "../../src/types/character.js";

describe("computeFinalAbilityScore", () => {
  const baseStats = [
    { id: 1, value: 15 },
    { id: 2, value: 14 },
    { id: 3, value: 13 },
    { id: 4, value: 12 },
    { id: 5, value: 10 },
    { id: 6, value: 8 },
  ];

  it("should compute base + bonus when no override", () => {
    const bonusStats = [{ id: 1, value: 2 }];
    const overrideStats: any[] = [];
    const modifiers = { race: [], class: [], background: [], item: [], feat: [], condition: [] };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(17); // 15 + 2
  });

  it("should return override value when present", () => {
    const bonusStats = [{ id: 1, value: 2 }];
    const overrideStats = [{ id: 1, value: 20 }];
    const modifiers = { race: [], class: [], background: [], item: [], feat: [], condition: [] };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(20);
  });

  it("should add modifier bonuses to base + bonus", () => {
    const bonusStats = [{ id: 1, value: 2 }];
    const overrideStats: any[] = [];
    const modifiers = {
      race: [],
      class: [],
      background: [],
      item: [
        { type: "bonus", subType: "strength-score", value: 1 } as DdbModifier,
      ],
      feat: [],
      condition: [],
    };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(18); // 15 + 2 + 1
  });

  it("should handle missing bonus stat", () => {
    const bonusStats: any[] = [];
    const overrideStats: any[] = [];
    const modifiers = { race: [], class: [], background: [], item: [], feat: [], condition: [] };

    const result = computeFinalAbilityScore(baseStats, bonusStats, overrideStats, modifiers, 1);
    expect(result).toBe(15); // Just base
  });
});

describe("sumModifierBonuses", () => {
  it("should accumulate bonuses for matching subType", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
      ],
      class: [
        { type: "bonus", subType: "armor-class", value: 2 } as DdbModifier,
      ],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(3);
  });

  it("should ignore non-bonus types", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
        { type: "set", subType: "armor-class", value: 13 } as DdbModifier,
      ],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(1); // Only the bonus type
  });

  it("should ignore null values", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
        { type: "bonus", subType: "armor-class", value: null } as DdbModifier,
      ],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(1);
  });

  it("should return 0 when no matching modifiers", () => {
    const modifiers = {
      race: [
        { type: "bonus", subType: "strength-score", value: 2 } as DdbModifier,
      ],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    };

    const result = sumModifierBonuses(modifiers, "armor-class");
    expect(result).toBe(0);
  });
});

describe("calculateAc", () => {
  const baseChar: DdbCharacter = {
    id: 1,
    name: "Test",
    readonlyUrl: "",
    race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false },
    classes: [
      {
        id: 1,
        definition: { name: "Fighter" },
        level: 5,
        isStartingClass: true,
        subclassDefinition: null,
        classFeatures: [],
      },
    ],
    level: 5,
    stats: [
      { id: 1, value: 10 }, // STR
      { id: 2, value: 14 }, // DEX (+2)
      { id: 3, value: 12 }, // CON (+1)
      { id: 4, value: 10 }, // INT
      { id: 5, value: 10 }, // WIS
      { id: 6, value: 10 }, // CHA
    ],
    bonusStats: [],
    overrideStats: [],
    modifiers: { race: [], class: [], background: [], item: [], feat: [], condition: [] },
    inventory: [],
    baseHitPoints: 42,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    background: null,
    currentXp: 0,
    alignmentId: null,
    lifestyleId: null,
    spells: { race: [], class: [], background: [], item: [], feat: [] },
    deathSaves: { failCount: null, successCount: null, isStabilized: false },
    traits: {
      personalityTraits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      appearance: "",
    },
    preferences: {},
    configuration: {},
    campaign: null,
  } as unknown as DdbCharacter;

  it("should calculate unarmored AC (10 + DEX)", () => {
    const result = calculateAc(baseChar);
    expect(result).toBe(12); // 10 + 2
  });

  it("should calculate light armor AC (AC + DEX)", () => {
    const charWithLightArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Leather Armor",
            type: "Light Armor",
            filterType: "Light Armor",
            armorClass: 11,
            rarity: "Common",
            weight: 10,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithLightArmor);
    expect(result).toBe(13); // 11 + 2
  });

  it("should calculate medium armor AC (AC + min(DEX, 2))", () => {
    const charWithMediumArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Scale Mail",
            type: "Medium Armor",
            filterType: "Medium Armor",
            armorClass: 14,
            rarity: "Common",
            weight: 45,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithMediumArmor);
    expect(result).toBe(16); // 14 + 2
  });

  it("should calculate heavy armor AC (AC only, no DEX)", () => {
    const charWithHeavyArmor = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Chain Mail",
            type: "Heavy Armor",
            filterType: "Heavy Armor",
            armorClass: 16,
            rarity: "Common",
            weight: 55,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithHeavyArmor);
    expect(result).toBe(16); // Just armor AC
  });

  it("should add shield bonus to AC", () => {
    const charWithShield = {
      ...baseChar,
      inventory: [
        {
          id: 1,
          definition: {
            name: "Shield",
            type: "Shield",
            filterType: "Shield",
            armorClass: 2,
            rarity: "Common",
            weight: 6,
            cost: null,
            isHomebrew: false,
            description: "",
          },
          equipped: true,
          quantity: 1,
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithShield);
    expect(result).toBe(14); // 10 + 2 (DEX) + 2 (shield)
  });

  it("should calculate Barbarian unarmored defense (10 + DEX + CON)", () => {
    const barbarian = {
      ...baseChar,
      classes: [
        {
          id: 1,
          definition: { name: "Barbarian" },
          level: 5,
          isStartingClass: true,
          subclassDefinition: null,
          classFeatures: [],
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(barbarian);
    expect(result).toBe(13); // 10 + 2 (DEX) + 1 (CON)
  });

  it("should calculate Monk unarmored defense (10 + DEX + WIS)", () => {
    const monk = {
      ...baseChar,
      stats: [
        { id: 1, value: 10 }, // STR
        { id: 2, value: 14 }, // DEX (+2)
        { id: 3, value: 10 }, // CON
        { id: 4, value: 10 }, // INT
        { id: 5, value: 16 }, // WIS (+3)
        { id: 6, value: 10 }, // CHA
      ],
      classes: [
        {
          id: 1,
          definition: { name: "Monk" },
          level: 5,
          isStartingClass: true,
          subclassDefinition: null,
          classFeatures: [],
        },
      ],
    } as unknown as DdbCharacter;

    const result = calculateAc(monk);
    expect(result).toBe(15); // 10 + 2 (DEX) + 3 (WIS)
  });

  it("should add AC modifiers from features", () => {
    const charWithAcBonus = {
      ...baseChar,
      modifiers: {
        race: [],
        class: [
          { type: "bonus", subType: "armor-class", value: 1 } as DdbModifier,
        ],
        background: [],
        item: [],
        feat: [],
        condition: [],
      },
    } as unknown as DdbCharacter;

    const result = calculateAc(charWithAcBonus);
    expect(result).toBe(13); // 10 + 2 (DEX) + 1 (feature)
  });
});

describe("computeLevel", () => {
  it("should sum class levels", () => {
    const char = {
      classes: [
        { level: 5 },
        { level: 3 },
      ],
    } as unknown as DdbCharacter;

    const result = computeLevel(char);
    expect(result).toBe(8);
  });

  it("should handle single class", () => {
    const char = {
      classes: [
        { level: 10 },
      ],
    } as unknown as DdbCharacter;

    const result = computeLevel(char);
    expect(result).toBe(10);
  });
});

describe("calculateMaxHp", () => {
  it("should return base + bonus when no override", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: 5,
      overrideHitPoints: null,
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(47);
  });

  it("should return override when present", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: 5,
      overrideHitPoints: 100,
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(100);
  });

  it("should handle null bonus", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: null,
      overrideHitPoints: null,
    } as unknown as DdbCharacter;

    const result = calculateMaxHp(char);
    expect(result).toBe(42);
  });
});

describe("calculateCurrentHp", () => {
  it("should return max - removed", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: 5,
      overrideHitPoints: null,
      removedHitPoints: 10,
    } as unknown as DdbCharacter;

    const result = calculateCurrentHp(char);
    expect(result).toBe(37); // 47 - 10
  });

  it("should handle zero damage", () => {
    const char = {
      baseHitPoints: 42,
      bonusHitPoints: null,
      overrideHitPoints: null,
      removedHitPoints: 0,
    } as unknown as DdbCharacter;

    const result = calculateCurrentHp(char);
    expect(result).toBe(42);
  });
});
