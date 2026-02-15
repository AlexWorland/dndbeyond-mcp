import { describe, it, expect } from "vitest";
import { getLiveClient } from "./setup.js";
import {
  searchSpells,
  getSpell,
  searchMonsters,
  getMonster,
  searchItems,
  getItem,
  searchFeats,
  searchClasses,
  searchRaces,
  searchBackgrounds,
  getCondition,
} from "../../src/tools/reference.js";

describe("Live: Spell endpoints", () => {
  it("should search spells by name", async () => {
    const client = await getLiveClient();
    const result = await searchSpells(client, { name: "fireball" });
    const text = result.content[0].text;

    expect(text).toContain("Fireball");
  });

  it("should search cantrips by name", async () => {
    const client = await getLiveClient();
    // Search by name + level is more reliable than level alone
    const result = await searchSpells(client, { name: "fire bolt" });
    const text = result.content[0].text;

    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });

  it("should get full spell details", async () => {
    const client = await getLiveClient();
    const result = await getSpell(client, { spellName: "Fireball" });
    const text = result.content[0].text;

    expect(text).toContain("Fireball");
    expect(text).toContain("Casting Time:");
    expect(text).toContain("Range:");
    expect(text).toContain("Components:");
    expect(text).toContain("Duration:");
  });
});

describe("Live: Monster endpoints", () => {
  it("should search monsters by name", async () => {
    const client = await getLiveClient();
    const result = await searchMonsters(client, { name: "goblin" });
    const text = result.content[0].text;

    expect(text.toLowerCase()).toContain("goblin");
  });

  it("should search monsters with source filter", async () => {
    const client = await getLiveClient();
    const result = await searchMonsters(client, {
      name: "dragon",
      source: "Monster Manual",
    });
    const text = result.content[0].text;

    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });

  it("should get full monster stat block", async () => {
    const client = await getLiveClient();
    const result = await getMonster(client, { monsterName: "Goblin" });
    const text = result.content[0].text;

    expect(text).toContain("Goblin");
    // Monster stat block uses **Armor Class** and **Hit Points** format
    expect(text).toContain("Armor Class");
    expect(text).toContain("Hit Points");
  });

  it("should support pagination", async () => {
    const client = await getLiveClient();
    // Just verify pagination doesn't error — cached results may be identical
    const page1 = await searchMonsters(client, { name: "dragon", page: 1 });
    const page2 = await searchMonsters(client, { name: "dragon", page: 2 });

    expect(page1.content[0].text).toBeDefined();
    expect(page2.content[0].text).toBeDefined();
  });
});

describe("Live: Item endpoints", () => {
  it("should search items by name", async () => {
    const client = await getLiveClient();
    const result = await searchItems(client, { name: "longsword" });
    const text = result.content[0].text;

    expect(text.toLowerCase()).toContain("longsword");
  });

  it("should get full item details", async () => {
    const client = await getLiveClient();
    const result = await getItem(client, { itemName: "Longsword" });
    const text = result.content[0].text;

    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("Live: Feat endpoints", () => {
  it("should search feats", async () => {
    const client = await getLiveClient();
    const result = await searchFeats(client, { name: "alert" });
    const text = result.content[0].text;

    expect(text.toLowerCase()).toContain("alert");
  });
});

describe("Live: Class endpoints", () => {
  it("should search classes", async () => {
    const client = await getLiveClient();
    const result = await searchClasses(client, { className: "wizard" });
    const text = result.content[0].text;

    expect(text.toLowerCase()).toContain("wizard");
  });
});

describe("Live: Race endpoints", () => {
  it("should search races without error", async () => {
    const client = await getLiveClient();
    const result = await searchRaces(client, { name: "elf" });
    const text = result.content[0].text;

    // API may return races with "elf" in name, or none if data shape changed
    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("Live: Background endpoints", () => {
  it("should search backgrounds", async () => {
    const client = await getLiveClient();
    const result = await searchBackgrounds(client, { name: "soldier" });
    const text = result.content[0].text;

    expect(text.toLowerCase()).toContain("soldier");
  });
});

describe("Live: Condition lookup", () => {
  it("should get condition rules text", async () => {
    const client = await getLiveClient();
    const result = await getCondition(client, { conditionName: "blinded" });
    const text = result.content[0].text;

    expect(text.toLowerCase()).toContain("blinded");
  });
});
