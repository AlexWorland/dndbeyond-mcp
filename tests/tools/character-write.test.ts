import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addCatalogItem,
  callExperimentalDdbEndpoint,
  createCustomItem,
  deleteCustomItem,
  listExperimentalDdbEndpoints,
  listInventoryItems,
  moveInventoryItem,
  removeInventoryItem,
  restoreHp,
  setCharacterPreference,
  setHelpText,
  setHpBase,
  setHpBonus,
  setHpOverride,
  setInventoryItemAttuned,
  setInventoryItemCharge,
  setInventoryItemEquipped,
  setInventoryItemQuantity,
  setProgression,
  setSpellPrepared,
  addKnownSpell,
  removeKnownSpell,
  updateCurrency,
  updateCustomItem,
  updateDeathSaves,
  updateHp,
  updateSpellSlots,
  useAbility,
} from "../../src/tools/character.js";
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
      temporaryHitPoints: 0,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 0, temporaryHitPoints: 0 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Healed Test Character for 10 HP");
  });

  it("should damage character when hpChange is negative", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: -5,
      temporaryHitPoints: 0,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 15, temporaryHitPoints: 0 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("Damaged Test Character for 5 HP");
  });

  it("should not allow negative HP", async () => {
    await updateHp(mockClient, {
      characterId: 123,
      hpChange: -100,
      temporaryHitPoints: 0,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.anything(),
      { characterId: 123, removedHitPoints: 45, temporaryHitPoints: 0 },
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
      expect.stringContaining("/character/v5/spell/slots"),
      { characterId: 123, spellslots: { level3: 2 }, update: true },
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
      get: vi.fn().mockResolvedValue({ deathSaves: { successCount: 0, failCount: 0 } }),
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
      expect.stringContaining("/character/v5/life/death-saves"),
      { characterId: 123, successCount: 2, failCount: 0 },
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
      expect.stringContaining("/character/v5/life/death-saves"),
      { characterId: 123, successCount: 0, failCount: 1 },
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
      get: vi.fn().mockResolvedValue({ currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }),
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
      expect.stringContaining("/character/v5/inventory/currency"),
      { characterId: 123, cp: 0, sp: 0, ep: 0, gp: 150, pp: 0 },
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
        { characterId: 123, cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, [currency]: 10 },
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

  it("should include temporaryHitPoints in PUT body when temporaryHitPoints is provided", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: 5,
      temporaryHitPoints: 10,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/life/hp/damage-taken"),
      { characterId: 123, removedHitPoints: 5, temporaryHitPoints: 10 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("(10 temp HP)");
  });

  it("should return a clear error when temporaryHitPoints is missing", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: 5,
    });

    expect(mockClient.put).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("temporaryHitPoints is required");
  });

  it("should set temporaryHitPoints to 0 when tempHp is 0", async () => {
    const result = await updateHp(mockClient, {
      characterId: 123,
      hpChange: 0,
      temporaryHitPoints: 0,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      expect.anything(),
      { characterId: 123, removedHitPoints: 10, temporaryHitPoints: 0 },
      ["character:123"]
    );
    expect(result.content[0].text).toContain("(0 temp HP)");
  });
});

describe("new character write helper payloads", () => {
  it("routes progression, HP internals, preferences, and help text", async () => {
    const mockClient = { put: vi.fn().mockResolvedValue({}) } as unknown as DdbClient;

    await setProgression(mockClient, { characterId: 123, currentXp: 900 });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/progression"), { characterId: 123, currentXp: 900 }, ["character:123"]);

    await setHpBase(mockClient, { characterId: 123, baseHitPoints: 44 });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/life/hp/base"), { characterId: 123, baseHitPoints: 44 }, ["character:123"]);

    await setHpBonus(mockClient, { characterId: 123, bonusHitPoints: 3 });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/life/hp/bonus"), { characterId: 123, bonusHitPoints: 3 }, ["character:123"]);

    await setHpOverride(mockClient, { characterId: 123, overrideHitPoints: null });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/life/hp/override"), { characterId: 123, overrideHitPoints: null }, ["character:123"]);

    await restoreHp(mockClient, { characterId: 123, totalHp: 47, restoreType: 1 });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/life/restore"), { characterId: 123, totalHp: 47, restoreType: 1 }, ["character:123"]);

    await setCharacterPreference(mockClient, { characterId: 123, key: "enableOptionalClassFeatures", value: true });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/preferences"), { characterId: 123, enableOptionalClassFeatures: true }, ["character:123"]);

    await setHelpText(mockClient, { characterId: 123, showHelpText: false });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/help-text"), { characterId: 123, showHelpText: false }, ["character:123"]);
  });

  it("validates progression, base HP, and preference keys", async () => {
    const mockClient = { put: vi.fn() } as unknown as DdbClient;

    expect((await setProgression(mockClient, { characterId: 123, currentXp: -1 })).content[0].text).toContain("Current XP must be a non-negative integer");
    expect((await setHpBase(mockClient, { characterId: 123, baseHitPoints: 0 })).content[0].text).toContain("Base HP must be a positive integer");
    expect((await setCharacterPreference(mockClient, { characterId: 123, key: "   ", value: true })).content[0].text).toContain("Preference key cannot be empty");
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it("routes known spell and prepared spell payloads with separate definition and mapping IDs", async () => {
    const mockClient = {
      post: vi.fn().mockResolvedValue({ definition: { name: "Magic Missile" } }),
      delete: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;

    const spellParams = { characterId: 123, classId: 2190886, spellId: 12345, spellMappingId: 67890, spellEntityTypeId: 112233 };
    await addKnownSpell(mockClient, spellParams);
    expect(mockClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/spell"),
      { characterId: 123, characterClassId: 2190886, spellId: 12345, id: 67890, entityTypeId: 112233 },
      ["character:123"]
    );

    await removeKnownSpell(mockClient, spellParams);
    expect(mockClient.delete).toHaveBeenCalledWith(
      expect.stringContaining("/spell"),
      { characterId: 123, characterClassId: 2190886, spellId: 12345, id: 67890, entityTypeId: 112233 },
      ["character:123"]
    );

    await setSpellPrepared(mockClient, { characterId: 123, classMappingId: 456, spellId: 12345, spellMappingId: 67890, spellEntityTypeId: 112233, prepared: true });
    expect(mockClient.put).toHaveBeenCalledWith(
      expect.stringContaining("/spell/prepared"),
      { characterId: 123, characterClassId: 456, spellId: 12345, id: 67890, entityTypeId: 112233, prepared: true },
      ["character:123"]
    );
  });
});

describe("experimental DDB endpoint tools", () => {
  it("lists allowlisted endpoint keys", async () => {
    const result = await listExperimentalDdbEndpoints();
    expect(result.content[0].text).toContain("party_inventory");
    expect(result.content[0].text).toContain("/character/v5/party/inventory/{campaignId}");
  });

  it("calls GET endpoints with interpolated path params and stable cache key", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ partyItems: [] }),
    } as unknown as DdbClient;

    const result = await callExperimentalDdbEndpoint(mockClient, {
      endpoint: "party_inventory",
      body: { campaignId: 42 },
    });

    expect(mockClient.get).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/party/inventory/42"),
      expect.stringMatching(/^experimental:party_inventory:[a-f0-9]{16}$/),
      0
    );
    expect(vi.mocked(mockClient.get).mock.calls[0][0]).not.toContain("campaignId=42");
    expect(result.content[0].text).toContain("Called GET");
  });

  it("returns friendly errors for unknown endpoints and missing path params", async () => {
    const mockClient = { get: vi.fn() } as unknown as DdbClient;

    const unknown = await callExperimentalDdbEndpoint(mockClient, { endpoint: "nope" });
    expect(unknown.content[0].text).toContain("Unknown experimental endpoint");

    const missing = await callExperimentalDdbEndpoint(mockClient, { endpoint: "party_inventory" });
    expect(missing.content[0].text).toContain("Missing path parameter: campaignId");
    expect(mockClient.get).not.toHaveBeenCalled();
  });
});

describe("inventory and custom item helpers", () => {
  const catalogItem = {
    id: 9001,
    quantity: 2,
    equipped: false,
    isAttuned: false,
    definition: { id: 101, entityTypeId: 202, name: "Dagger", definitionKey: "202:101", isCustomItem: false },
  };
  const customItem = {
    id: 9002,
    quantity: 1,
    equipped: false,
    isAttuned: false,
    definition: { id: 303, entityTypeId: 988229960, name: "Custom Torch", definitionKey: "988229960:303", isCustomItem: true, weight: 1, cost: 2 },
  };
  const inventoryCharacter = {
    ...mockCharacter,
    inventory: [catalogItem, customItem] as any,
  };

  it("lists inventory items and can filter custom items", async () => {
    const mockClient = { get: vi.fn().mockResolvedValue(inventoryCharacter) } as unknown as DdbClient;

    const all = await listInventoryItems(mockClient, { characterId: 123 });
    expect(all.content[0].text).toContain("Dagger");
    expect(all.content[0].text).toContain("Custom Torch");

    const nonCustom = await listInventoryItems(mockClient, { characterId: 123, includeCustom: false });
    expect(nonCustom.content[0].text).toContain("Dagger");
    expect(nonCustom.content[0].text).not.toContain("Custom Torch");
  });

  it("adds catalog items by explicit IDs or name lookup", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue([{ id: 55, entityTypeId: 66, name: "Rope" }]),
      post: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;

    await addCatalogItem(mockClient, { characterId: 123, entityId: 1, entityTypeId: 2, quantity: 3 });
    expect(mockClient.post).toHaveBeenCalledWith(
      expect.stringContaining("/inventory/item"),
      expect.objectContaining({ characterId: 123, equipment: [expect.objectContaining({ entityId: 1, entityTypeId: 2, quantity: 3 })] }),
      ["character:123"]
    );

    await addCatalogItem(mockClient, { characterId: 123, itemName: "rope" });
    expect(mockClient.post).toHaveBeenLastCalledWith(
      expect.stringContaining("/inventory/item"),
      expect.objectContaining({ equipment: [expect.objectContaining({ entityId: 55, entityTypeId: 66, quantity: 1 })] }),
      ["character:123"]
    );
  });

  it("rejects invalid catalog quantity", async () => {
    const mockClient = { post: vi.fn() } as unknown as DdbClient;
    const result = await addCatalogItem(mockClient, { characterId: 123, entityId: 1, entityTypeId: 2, quantity: 0 });
    expect(result.content[0].text).toContain("Quantity must be a positive integer");
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it("updates inventory item quantity/equipped/attuned/charges and movement", async () => {
    const mockClient = { put: vi.fn().mockResolvedValue({}) } as unknown as DdbClient;

    await setInventoryItemQuantity(mockClient, { characterId: 123, inventoryItemId: 9001, quantity: 4 });
    await setInventoryItemEquipped(mockClient, { characterId: 123, inventoryItemId: 9001, value: true });
    await setInventoryItemAttuned(mockClient, { characterId: 123, inventoryItemId: 9001, value: true });
    await setInventoryItemCharge(mockClient, { characterId: 123, inventoryItemId: 9001, charges: 2 });
    await moveInventoryItem(mockClient, { characterId: 123, inventoryItemId: 9001, containerEntityId: 777, containerEntityTypeId: 888 });

    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/inventory/item/quantity"), { characterId: 123, id: 9001, quantity: 4 }, ["character:123"]);
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/inventory/item/equipped"), { characterId: 123, id: 9001, value: true }, ["character:123"]);
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/inventory/item/attuned"), { characterId: 123, id: 9001, value: true }, ["character:123"]);
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/inventory/item/charge"), { characterId: 123, id: 9001, charges: 2 }, ["character:123"]);
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/inventory/item/move"), { characterId: 123, id: 9001, containerEntityId: 777, containerEntityTypeId: 888 }, ["character:123"]);
  });

  it("removes catalog items directly and custom items without a second fetch", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(inventoryCharacter),
      delete: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;

    await removeInventoryItem(mockClient, { characterId: 123, inventoryItemId: 9001 });
    expect(mockClient.delete).toHaveBeenCalledWith(expect.stringContaining("/inventory/item"), { characterId: 123, id: 9001 }, ["character:123"]);

    await removeInventoryItem(mockClient, { characterId: 123, inventoryItemId: 9002 });
    expect(mockClient.get).toHaveBeenCalledTimes(2);
    expect(mockClient.delete).toHaveBeenLastCalledWith(expect.stringContaining("/custom/item"), { characterId: 123, id: 303, mappingId: 9002, partyId: null }, ["character:123"]);
  });

  it("creates, updates, and deletes custom items", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(inventoryCharacter),
      post: vi.fn().mockResolvedValue({ addItems: [customItem] }),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;

    await createCustomItem(mockClient, { characterId: 123, name: "Lantern", quantity: 1, weight: 2, cost: 5 });
    expect(mockClient.post).toHaveBeenCalledWith(expect.stringContaining("/custom/item"), expect.objectContaining({ characterId: 123, name: "Lantern", quantity: 1, weight: 2, cost: 5 }), ["character:123"]);

    await updateCustomItem(mockClient, { characterId: 123, inventoryItemId: 9002, name: "Updated Torch", quantity: 2 });
    expect(mockClient.put).toHaveBeenCalledWith(expect.stringContaining("/custom/item"), expect.objectContaining({ characterId: 123, id: 303, mappingId: 9002, name: "Updated Torch", quantity: 2 }), ["character:123"]);

    await deleteCustomItem(mockClient, { characterId: 123, inventoryItemId: 9002 });
    expect(mockClient.delete).toHaveBeenCalledWith(expect.stringContaining("/custom/item"), { characterId: 123, id: 303, mappingId: 9002, partyId: null }, ["character:123"]);
  });

  it("rejects invalid custom item inputs", async () => {
    const mockClient = { post: vi.fn(), put: vi.fn() } as unknown as DdbClient;

    expect((await createCustomItem(mockClient, { characterId: 123, name: " ", quantity: 1 })).content[0].text).toContain("name cannot be empty");
    expect((await createCustomItem(mockClient, { characterId: 123, name: "Bad", quantity: 0 })).content[0].text).toContain("Quantity must be a positive integer");
    expect((await setInventoryItemQuantity(mockClient, { characterId: 123, inventoryItemId: 1, quantity: -1 })).content[0].text).toContain("Quantity must be a non-negative integer");
    expect((await setInventoryItemCharge(mockClient, { characterId: 123, inventoryItemId: 1, charges: -1 })).content[0].text).toContain("Charges must be a non-negative integer");
  });
});
