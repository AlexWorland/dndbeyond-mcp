import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchSpells, getSpell } from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";
import { DdbCharacter, DdbSpell } from "../../src/types/character.js";

describe("searchSpells", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  const createMockCharacter = (spells: DdbSpell[]): DdbCharacter => ({
    id: 123,
    readonlyUrl: "https://example.com",
    name: "Test Character",
    race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false },
    classes: [],
    level: 5,
    background: { definition: null },
    stats: [],
    bonusStats: [],
    overrideStats: [],
    baseHitPoints: 30,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currentXp: 0,
    alignmentId: 1,
    lifestyleId: 1,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: {
      race: [],
      class: spells,
      background: [],
      item: [],
      feat: [],
    },
    inventory: [],
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
  });

  const createMockSpell = (
    name: string,
    level: number,
    school: string,
    concentration = false,
    ritual = false
  ): DdbSpell => ({
    id: Math.floor(Math.random() * 10000),
    definition: {
      name,
      level,
      school,
      description: `Description of ${name}`,
      range: { origin: "Self", value: null },
      duration: { durationType: "Instantaneous", durationInterval: null },
      castingTime: { castingTimeInterval: 1 },
      components: [1, 2],
      concentration,
      ritual,
    },
    prepared: true,
    alwaysPrepared: false,
    usesSpellSlot: true,
  });

  it("should filter spells by name (case-insensitive)", async () => {
    const spells = [
      createMockSpell("Fireball", 3, "Evocation"),
      createMockSpell("Fire Bolt", 0, "Evocation"),
      createMockSpell("Magic Missile", 1, "Evocation"),
    ];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { name: "fire" }, [123]);

    expect(result.content[0].text).toContain("Fireball");
    expect(result.content[0].text).toContain("Fire Bolt");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should filter spells by level", async () => {
    const spells = [
      createMockSpell("Fire Bolt", 0, "Evocation"),
      createMockSpell("Magic Missile", 1, "Evocation"),
      createMockSpell("Fireball", 3, "Evocation"),
    ];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { level: 1 }, [123]);

    expect(result.content[0].text).toContain("Magic Missile");
    expect(result.content[0].text).not.toContain("Fire Bolt");
    expect(result.content[0].text).not.toContain("Fireball");
  });

  it("should filter spells by school", async () => {
    const spells = [
      createMockSpell("Fireball", 3, "Evocation"),
      createMockSpell("Shield", 1, "Abjuration"),
      createMockSpell("Charm Person", 1, "Enchantment"),
    ];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { school: "Evocation" }, [123]);

    expect(result.content[0].text).toContain("Fireball");
    expect(result.content[0].text).not.toContain("Shield");
    expect(result.content[0].text).not.toContain("Charm Person");
  });

  it("should filter spells by concentration", async () => {
    const spells = [
      createMockSpell("Bless", 1, "Enchantment", true, false),
      createMockSpell("Magic Missile", 1, "Evocation", false, false),
    ];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { concentration: true }, [123]);

    expect(result.content[0].text).toContain("Bless");
    expect(result.content[0].text).toContain("Concentration");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should filter spells by ritual", async () => {
    const spells = [
      createMockSpell("Detect Magic", 1, "Divination", false, true),
      createMockSpell("Magic Missile", 1, "Evocation", false, false),
    ];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { ritual: true }, [123]);

    expect(result.content[0].text).toContain("Detect Magic");
    expect(result.content[0].text).toContain("Ritual");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should handle multiple filters simultaneously", async () => {
    const spells = [
      createMockSpell("Bless", 1, "Enchantment", true, false),
      createMockSpell("Concentration Test", 1, "Evocation", true, false),
      createMockSpell("Magic Missile", 1, "Evocation", false, false),
    ];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(
      mockClient,
      { level: 1, school: "Evocation", concentration: true },
      [123]
    );

    expect(result.content[0].text).toContain("Concentration Test");
    expect(result.content[0].text).not.toContain("Bless");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should return no results message when no spells match", async () => {
    const spells = [createMockSpell("Fireball", 3, "Evocation")];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { name: "nonexistent" }, [123]);

    expect(result.content[0].text).toBe("No spells found matching the criteria.");
  });

  it("should handle cantrips correctly", async () => {
    const spells = [createMockSpell("Fire Bolt", 0, "Evocation")];

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter(spells));

    const result = await searchSpells(mockClient, { level: 0 }, [123]);

    expect(result.content[0].text).toContain("Fire Bolt");
    expect(result.content[0].text).toContain("Cantrip");
  });

  it("should deduplicate spells across multiple characters", async () => {
    const spell1 = createMockSpell("Fireball", 3, "Evocation");
    const spell2 = { ...spell1 }; // Same spell

    vi.mocked(mockClient.get)
      .mockResolvedValueOnce(createMockCharacter([spell1]))
      .mockResolvedValueOnce(createMockCharacter([spell2]));

    const result = await searchSpells(mockClient, { name: "Fireball" }, [123, 456]);

    const matches = (result.content[0].text.match(/Fireball/g) || []).length;
    expect(matches).toBe(1); // Should only appear once in results
  });
});

describe("getSpell", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
    } as unknown as DdbClient;
  });

  const createMockCharacter = (spells: DdbSpell[]): DdbCharacter => ({
    id: 123,
    readonlyUrl: "https://example.com",
    name: "Test Character",
    race: { fullName: "Human", baseRaceName: "Human", isHomebrew: false },
    classes: [],
    level: 5,
    background: { definition: null },
    stats: [],
    bonusStats: [],
    overrideStats: [],
    baseHitPoints: 30,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currentXp: 0,
    alignmentId: 1,
    lifestyleId: 1,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: {
      race: [],
      class: spells,
      background: [],
      item: [],
      feat: [],
    },
    inventory: [],
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
  });

  it("should format complete spell details", async () => {
    const spell: DdbSpell = {
      id: 1,
      definition: {
        name: "Fireball",
        level: 3,
        school: "Evocation",
        description:
          "A bright streak flashes from your pointing finger to a point you choose within range.",
        range: { origin: "feet", value: 150 },
        duration: { durationType: "Instantaneous", durationInterval: null },
        castingTime: { castingTimeInterval: 1 },
        components: [1, 2, 3],
        concentration: false,
        ritual: false,
      },
      prepared: true,
      alwaysPrepared: false,
      usesSpellSlot: true,
    };

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter([spell]));

    const result = await getSpell(mockClient, { spellName: "Fireball" }, [123]);
    const text = result.content[0].text;

    expect(text).toContain("# Fireball");
    expect(text).toContain("3rd-level Evocation");
    expect(text).toContain("**Casting Time:** 1 action");
    expect(text).toContain("**Range:** 150 feet");
    expect(text).toContain("**Components:** V, S, M");
    expect(text).toContain("**Duration:** Instantaneous");
    expect(text).toContain("A bright streak flashes");
  });

  it("should handle concentration and ritual tags", async () => {
    const spell: DdbSpell = {
      id: 2,
      definition: {
        name: "Detect Magic",
        level: 1,
        school: "Divination",
        description: "You sense the presence of magic.",
        range: { origin: "Self", value: null },
        duration: { durationType: "minutes", durationInterval: 10 },
        castingTime: { castingTimeInterval: 1 },
        components: [1, 2],
        concentration: true,
        ritual: true,
      },
      prepared: true,
      alwaysPrepared: false,
      usesSpellSlot: true,
    };

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter([spell]));

    const result = await getSpell(mockClient, { spellName: "Detect Magic" }, [123]);
    const text = result.content[0].text;

    expect(text).toContain("Concentration, Ritual");
  });

  it("should handle cantrips correctly", async () => {
    const spell: DdbSpell = {
      id: 3,
      definition: {
        name: "Fire Bolt",
        level: 0,
        school: "Evocation",
        description: "You hurl a mote of fire.",
        range: { origin: "feet", value: 120 },
        duration: { durationType: "Instantaneous", durationInterval: null },
        castingTime: { castingTimeInterval: 1 },
        components: [1, 2],
        concentration: false,
        ritual: false,
      },
      prepared: true,
      alwaysPrepared: false,
      usesSpellSlot: false,
    };

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter([spell]));

    const result = await getSpell(mockClient, { spellName: "Fire Bolt" }, [123]);
    const text = result.content[0].text;

    expect(text).toContain("Cantrip Evocation");
  });

  it("should handle spell not found", async () => {
    vi.mocked(mockClient.get).mockResolvedValue(
      createMockCharacter([
        {
          id: 1,
          definition: {
            name: "Other Spell",
            level: 1,
            school: "Evocation",
            description: "",
            range: { origin: "Self", value: null },
            duration: { durationType: "Instantaneous", durationInterval: null },
            castingTime: { castingTimeInterval: 1 },
            components: [1],
            concentration: false,
            ritual: false,
          },
          prepared: true,
          alwaysPrepared: false,
          usesSpellSlot: true,
        },
      ])
    );

    const result = await getSpell(mockClient, { spellName: "Nonexistent Spell" }, [123]);

    expect(result.content[0].text).toContain(
      'Spell "Nonexistent Spell" not found in any character\'s spell list.'
    );
  });

  it("should handle case-insensitive spell name matching", async () => {
    const spell: DdbSpell = {
      id: 1,
      definition: {
        name: "Fireball",
        level: 3,
        school: "Evocation",
        description: "Fire everywhere.",
        range: { origin: "feet", value: 150 },
        duration: { durationType: "Instantaneous", durationInterval: null },
        castingTime: { castingTimeInterval: 1 },
        components: [1, 2, 3],
        concentration: false,
        ritual: false,
      },
      prepared: true,
      alwaysPrepared: false,
      usesSpellSlot: true,
    };

    vi.mocked(mockClient.get).mockResolvedValue(createMockCharacter([spell]));

    const result = await getSpell(mockClient, { spellName: "FIREBALL" }, [123]);

    expect(result.content[0].text).toContain("# Fireball");
  });
});
