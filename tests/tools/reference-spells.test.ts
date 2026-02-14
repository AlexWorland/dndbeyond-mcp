import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchSpells, getSpell } from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";
import { DdbSpell } from "../../src/types/character.js";

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
  usesSpellSlot: level > 0,
});

// Pool of spells for compendium mock
const COMPENDIUM_SPELLS = [
  createMockSpell("Fireball", 3, "Evocation"),
  createMockSpell("Fire Bolt", 0, "Evocation"),
  createMockSpell("Magic Missile", 1, "Evocation"),
  createMockSpell("Shield", 1, "Abjuration"),
  createMockSpell("Bless", 1, "Enchantment", true, false),
  createMockSpell("Detect Magic", 1, "Divination", true, true),
  createMockSpell("Charm Person", 1, "Enchantment"),
];

describe("searchSpells", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(COMPENDIUM_SPELLS),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("should filter spells by name (case-insensitive)", async () => {
    const result = await searchSpells(mockClient, { name: "fire" });

    expect(result.content[0].text).toContain("Fireball");
    expect(result.content[0].text).toContain("Fire Bolt");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should filter spells by level", async () => {
    const result = await searchSpells(mockClient, { level: 1 });

    expect(result.content[0].text).toContain("Magic Missile");
    expect(result.content[0].text).not.toContain("Fire Bolt");
    expect(result.content[0].text).not.toContain("Fireball");
  });

  it("should filter spells by school", async () => {
    const result = await searchSpells(mockClient, { school: "Evocation" });

    expect(result.content[0].text).toContain("Fireball");
    expect(result.content[0].text).not.toContain("Shield");
    expect(result.content[0].text).not.toContain("Charm Person");
  });

  it("should filter spells by concentration", async () => {
    const result = await searchSpells(mockClient, { concentration: true });

    expect(result.content[0].text).toContain("Bless");
    expect(result.content[0].text).toContain("Concentration");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should filter spells by ritual", async () => {
    const result = await searchSpells(mockClient, { ritual: true });

    expect(result.content[0].text).toContain("Detect Magic");
    expect(result.content[0].text).toContain("Ritual");
    expect(result.content[0].text).not.toContain("Magic Missile");
  });

  it("should handle multiple filters simultaneously", async () => {
    const result = await searchSpells(mockClient, {
      level: 1,
      school: "Evocation",
      concentration: false,
    });

    expect(result.content[0].text).toContain("Magic Missile");
    expect(result.content[0].text).not.toContain("Bless");
    expect(result.content[0].text).not.toContain("Fireball");
  });

  it("should return no results message when no spells match", async () => {
    const result = await searchSpells(mockClient, { name: "nonexistent" });

    expect(result.content[0].text).toBe("No spells found matching the criteria.");
  });

  it("should handle cantrips correctly", async () => {
    const result = await searchSpells(mockClient, { level: 0 });

    expect(result.content[0].text).toContain("Fire Bolt");
    expect(result.content[0].text).toContain("Cantrip");
  });

  it("should deduplicate spells from compendium", async () => {
    const result = await searchSpells(mockClient, { name: "Fireball" });

    const matches = (result.content[0].text.match(/Fireball/g) || []).length;
    expect(matches).toBe(1);
  });
});

describe("getSpell", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue(COMPENDIUM_SPELLS),
      getRaw: vi.fn(),
    } as unknown as DdbClient;
  });

  it("should format complete spell details", async () => {
    const result = await getSpell(mockClient, { spellName: "Fireball" });
    const text = result.content[0].text;

    expect(text).toContain("# Fireball");
    expect(text).toContain("Evocation");
  });

  it("should handle concentration and ritual tags", async () => {
    const result = await getSpell(mockClient, { spellName: "Detect Magic" });
    const text = result.content[0].text;

    expect(text).toContain("Detect Magic");
    expect(text).toContain("Concentration");
    expect(text).toContain("Ritual");
  });

  it("should handle cantrips correctly", async () => {
    const result = await getSpell(mockClient, { spellName: "Fire Bolt" });
    const text = result.content[0].text;

    expect(text).toContain("Cantrip");
    expect(text).toContain("Evocation");
  });

  it("should handle spell not found", async () => {
    const result = await getSpell(mockClient, { spellName: "Nonexistent Spell" });

    expect(result.content[0].text).toContain(
      'Spell "Nonexistent Spell" not found in the compendium.'
    );
  });

  it("should handle case-insensitive spell name matching", async () => {
    const result = await getSpell(mockClient, { spellName: "FIREBALL" });

    expect(result.content[0].text).toContain("# Fireball");
  });
});
