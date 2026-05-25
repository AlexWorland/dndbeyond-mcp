import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DdbClient } from "../../src/api/client.js";
import {
  deleteCustomEntityValues,
  deleteCustomValue,
  generateCharacterPdf,
  getCharacterRuleData,
  getCharacterShareUrl,
  getPartyInventory,
  manageCharacterFeat,
  manageCharacterInfusion,
  manageCustomAction,
  manageCustomDefenseAdjustment,
  manageCustomMovement,
  manageCustomProficiency,
  manageCustomSense,
  manageOptionalFeature,
  managePremadeInfo,
  manageRollResult,
  manageVehicle,
  setCharacterCampaignSetting,
  setCharacterDecoration,
  setCharacterFeatureFlag,
  setCharacterSourceCategories,
  setCustomBackground,
  setCustomValue,
  setHasCustomBackground,
} from "../../src/tools/character.js";

function mockClient(): DdbClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
    put: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as DdbClient;
}

describe("extended DDB character-service endpoint tools", () => {
  let client: DdbClient;

  beforeEach(() => {
    client = mockClient();
  });

  it("sets source categories", async () => {
    await setCharacterSourceCategories(client, { characterId: 123, activeSourceCategories: [26, 1] });
    expect(client.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/character/source-categories"),
      { characterId: 123, activeSourceCategories: [26, 1] },
      ["character:123"]
    );
  });

  it("sets campaign setting", async () => {
    await setCharacterCampaignSetting(client, { characterId: 123, campaignSettingId: 1, enabledSourceIds: [1, 2] });
    expect(client.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/campaign-setting"),
      { characterId: 123, campaignSettingId: 1, enabledSourceIds: [1, 2] },
      ["character:123"]
    );
  });

  it("updates custom background and toggle separately", async () => {
    await setCustomBackground(client, { characterId: 123, name: "Archivist", description: "Probe", backgroundType: null });
    expect(client.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/custom/background"),
      { characterId: 123, name: "Archivist", description: "Probe", backgroundType: null },
      ["character:123"]
    );

    await setHasCustomBackground(client, { characterId: 123, hasCustomBackground: true });
    expect(client.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/configuration/has-custom-background"),
      { characterId: 123, hasCustomBackground: true },
      ["character:123"]
    );
  });

  it("sets and deletes custom values", async () => {
    await setCustomValue(client, { characterId: 123, typeId: 5, value: 13, notes: "passive override" });
    expect(client.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/custom/value"),
      { characterId: 123, typeId: 5, value: 13, notes: "passive override" },
      ["character:123"]
    );

    await deleteCustomValue(client, { characterId: 123, typeId: 5 });
    expect(client.delete).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/custom/value"),
      { characterId: 123, typeId: 5 },
      ["character:123"]
    );

    await deleteCustomEntityValues(client, { characterId: 123, valueId: 1, valueTypeId: 2 });
    expect(client.delete).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/custom/entity/values"),
      { characterId: 123, valueId: 1, valueTypeId: 2 },
      ["character:123"]
    );
  });

  it("manages custom proficiency and preserves type on update", async () => {
    await manageCustomProficiency(client, { operation: "update", characterId: 123, id: 456, name: "Tool", type: 2 });
    expect(client.put).toHaveBeenCalledWith(
      expect.stringContaining("/character/v5/custom/proficiency"),
      { characterId: 123, id: 456, name: "Tool", type: 2 },
      ["character:123"]
    );
  });

  it("manages custom movement/sense/defense/action", async () => {
    await manageCustomMovement(client, { operation: "create", characterId: 123, movementId: 4, distance: 60, source: "Wings" });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/custom/movement"), { characterId: 123, movementId: 4, distance: 60, source: "Wings" }, ["character:123"]);

    await manageCustomSense(client, { operation: "update", characterId: 123, senseId: 2, distance: 90, source: "Goggles" });
    expect(client.put).toHaveBeenCalledWith(expect.stringContaining("/custom/sense"), { characterId: 123, senseId: 2, distance: 90, source: "Goggles" }, ["character:123"]);

    await manageCustomDefenseAdjustment(client, { operation: "delete", characterId: 123, type: 2, adjustmentId: 1 });
    expect(client.delete).toHaveBeenCalledWith(expect.stringContaining("/custom/defense-adjustment"), { characterId: 123, type: 2, adjustmentId: 1 }, ["character:123"]);

    await manageCustomAction(client, { operation: "update", characterId: 123, id: "789", name: "Swing", actionType: 3, description: "Probe" });
    expect(client.put).toHaveBeenCalledWith(expect.stringContaining("/custom/action"), { characterId: 123, id: "789", name: "Swing", actionType: 3, description: "Probe" }, ["character:123"]);
  });

  it("routes decoration endpoints", async () => {
    await setCharacterDecoration(client, { characterId: 123, kind: "themeColor", themeColorId: 42 });
    expect(client.put).toHaveBeenCalledWith(expect.stringContaining("/decoration/theme-color"), { characterId: 123, themeColorId: 42 }, ["character:123"]);

    await setCharacterDecoration(client, { characterId: 123, kind: "customPortrait", avatarId: 99 });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/decoration/portrait/custom"), { characterId: 123, avatarId: 99 }, ["character:123"]);
  });

  it("routes roll result endpoint family", async () => {
    await manageRollResult(client, { operation: "createGroup", characterId: 123, groupKey: "abilities" });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/roll-result-group"), { characterId: 123, groupKey: "abilities" }, ["character:123"]);

    await manageRollResult(client, { operation: "listGroups", characterId: 123 });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining("/roll-result-groups?characterId=123"), expect.stringContaining("roll-listGroups"), 0);
  });

  it("routes feat/infusion/optional-feature families", async () => {
    await manageCharacterFeat(client, { operation: "createAdHoc", characterId: 123, id: 1 });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/feat/ad-hoc"), { characterId: 123, id: 1 }, ["character:123"]);

    await manageCharacterInfusion(client, { operation: "createKnown", characterId: 123, choiceKey: "x", infusionId: 1 });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/known-infusion"), { characterId: 123, choiceKey: "x", infusionId: 1 }, ["character:123"]);

    await manageOptionalFeature(client, { operation: "deleteClassFeatureCollection", characterId: 123, classFeatureIds: [1, 2] });
    expect(client.delete).toHaveBeenCalledWith(expect.stringContaining("/optional-feature/class-feature/collection"), { characterId: 123, classFeatureIds: [1, 2] }, ["character:123"]);
  });

  it("routes premade and vehicle families", async () => {
    await managePremadeInfo(client, { operation: "get", characterId: 123 });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining("/premade/123"), expect.stringContaining("premade-get"), 0);

    await manageVehicle(client, { operation: "setFuel", characterId: 123, id: 999, remainingFuel: 10 });
    expect(client.put).toHaveBeenCalledWith(expect.stringContaining("/vehicle/fuel"), { characterId: 123, id: 999, remainingFuel: 10 }, ["character:123"]);
  });

  it("routes read-only and misc endpoints", async () => {
    await getPartyInventory(client, { campaignId: 42 });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining("/party/inventory/42"), expect.stringContaining("party-inventory:42"), 0);

    await getCharacterRuleData(client, { characterId: 123 });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining("/rule-data?characterId=123"), expect.stringContaining("rule-data"), 0);

    await getCharacterShareUrl(client, { characterId: 123 });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining("/share/url?characterId=123"), expect.stringContaining("share-url"), 0);

    await generateCharacterPdf(client, { characterId: 123, exportData: "{}" });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/pdf"), { characterId: 123, exportData: "{}" }, ["character:123"]);

    await setCharacterFeatureFlag(client, { flags: ["release-gate-character-sheet-campaign-settings"] });
    expect(client.post).toHaveBeenCalledWith(expect.stringContaining("/featureflag"), { flags: ["release-gate-character-sheet-campaign-settings"] }, undefined);
  });
});
