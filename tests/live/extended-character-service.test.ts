import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "../../src/api/endpoints.js";
import {
  deleteCustomValue,
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
import type { DdbCharacter } from "../../src/types/character.js";
import { deleteTestCharacter, getLiveClient } from "./setup.js";

type ToolResult = { content: Array<{ type: "text"; text: string }> };
type VehicleMapping = { id: number; [key: string]: unknown };
type VehicleComponentMapping = { id: number; [key: string]: unknown };

async function fetchCharacter(client: Awaited<ReturnType<typeof getLiveClient>>, characterId: number): Promise<DdbCharacter> {
  return client.get(ENDPOINTS.character.get(characterId), `live-extended:${characterId}:${Date.now()}`, 0);
}

function parseToolJson<T>(result: ToolResult): T {
  const [, json = ""] = result.content[0].text.split("\n\n");
  expect(json).not.toBe("");
  return JSON.parse(json) as T;
}

describe("Live: extended character-service endpoint tools", () => {
  it("mutates and reads back reverse-engineered endpoint families on a throwaway character", async () => {
    const client = await getLiveClient();
    const characterId = await client.post<number>(
      ENDPOINTS.character.builder.quickBuild(),
      { classId: 252717, entityRaceId: 1751441, entityRaceTypeId: 1743923279 },
      undefined,
    );

    try {
      await client.put(ENDPOINTS.character.updateName(), { characterId, name: "DDB MCP EXTENDED ENDPOINT E2E DELETE ME" }, [`character:${characterId}`]);

      await setCharacterSourceCategories(client, { characterId, activeSourceCategories: [26, 1] });
      await setCharacterCampaignSetting(client, { characterId, campaignSettingId: 1, enabledSourceIds: [1, 2, 3, 5] });

      await setHasCustomBackground(client, { characterId, hasCustomBackground: true });
      await setCustomBackground(client, { characterId, name: "DDB MCP E2E Background", description: "Temporary live endpoint verification.", featuresBackgroundDefinitionId: null, characteristicsBackgroundDefinitionId: null, backgroundType: null });
      let character = await fetchCharacter(client, characterId);
      expect(character.background?.hasCustomBackground || character.background?.customBackground?.name).toBeTruthy();

      await setCustomValue(client, { characterId, typeId: 5, value: 13, notes: "DDB MCP E2E passive perception override" });
      character = await fetchCharacter(client, characterId);
      expect(character.characterValues ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ typeId: 5, value: expect.anything() })]));
      await deleteCustomValue(client, { characterId, typeId: 5 });

      await manageCustomProficiency(client, { operation: "create", characterId, name: "DDB MCP E2E Language", type: 3 });
      character = await fetchCharacter(client, characterId);
      const proficiency = (character.customProficiencies ?? []).find((entry) => entry.name === "DDB MCP E2E Language");
      expect(proficiency?.id).toBeTruthy();
      await manageCustomProficiency(client, { operation: "update", characterId, id: proficiency.id, name: "DDB MCP E2E Tool", type: 2 });
      await manageCustomProficiency(client, { operation: "delete", characterId, id: proficiency.id });

      await manageCustomMovement(client, { operation: "create", characterId, movementId: 4, distance: 60, source: "DDB MCP E2E" });
      character = await fetchCharacter(client, characterId);
      expect(character.customSpeeds ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ movementId: 4, distance: 60 })]));
      await manageCustomMovement(client, { operation: "update", characterId, movementId: 4, distance: 50, source: "DDB MCP E2E updated" });
      await manageCustomMovement(client, { operation: "delete", characterId, movementId: 4 });

      await manageCustomSense(client, { operation: "create", characterId, senseId: 2, distance: 30, source: "DDB MCP E2E" });
      await manageCustomSense(client, { operation: "update", characterId, senseId: 2, distance: 60, source: "DDB MCP E2E updated" });
      await manageCustomSense(client, { operation: "delete", characterId, senseId: 2 });

      await manageCustomDefenseAdjustment(client, { operation: "create", characterId, type: 2, adjustmentId: 1, source: "DDB MCP E2E" });
      await manageCustomDefenseAdjustment(client, { operation: "update", characterId, type: 2, adjustmentId: 1, source: "DDB MCP E2E updated" });
      await manageCustomDefenseAdjustment(client, { operation: "delete", characterId, type: 2, adjustmentId: 1 });

      await manageCustomAction(client, { operation: "create", characterId, name: "DDB MCP E2E Action", actionType: 3 });
      character = await fetchCharacter(client, characterId);
      const action = (character.customActions ?? []).find((entry) => entry.name === "DDB MCP E2E Action");
      expect(action?.id).toBeTruthy();
      await manageCustomAction(client, { operation: "update", characterId, id: action.id, name: "DDB MCP E2E Action Updated", actionType: 3, description: "temporary e2e action" });
      await manageCustomAction(client, { operation: "delete", characterId, id: action.id });

      await manageCharacterFeat(client, { operation: "createAdHoc", characterId, id: 29 });
      character = await fetchCharacter(client, characterId);
      expect(character.feats ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ definition: expect.objectContaining({ id: 29 }) })]));
      await manageCharacterFeat(client, { operation: "deleteAdHoc", characterId, id: 29 });

      const infusionId = "8f2ff7bf-b8ee-4550-a5bd-d36210ff44ac";
      const choiceKey = ["artificer", "infusion", "1"].join("-");
      await manageCharacterInfusion(client, { operation: "createKnown", characterId, choiceKey, infusionId });
      await manageCharacterInfusion(client, { operation: "listKnown", characterId });
      await manageCharacterInfusion(client, { operation: "updateKnown", characterId, choiceKey, infusionId, itemId: null, itemTypeId: null, itemName: null });
      character = await fetchCharacter(client, characterId);
      const infusionTarget = (character.inventory ?? []).find((item) => /Studded Leather|Leather Armor/i.test(item.definition?.name ?? ""));
      if (infusionTarget?.id) {
        await manageCharacterInfusion(client, { operation: "addItem", characterId, choiceKey, infusionId, inventoryMappingId: infusionTarget.id, modifierGroupId: null });
        await manageCharacterInfusion(client, { operation: "listItems", characterId });
        await manageCharacterInfusion(client, { operation: "deleteItem", characterId, infusionId, inventoryMappingId: infusionTarget.id });
      }
      await manageCharacterInfusion(client, { operation: "deleteKnown", characterId, choiceKey });

      await manageOptionalFeature(client, { operation: "addClassFeature", characterId, classFeatureId: 10292232, affectedClassFeatureId: 10292233 });
      await manageOptionalFeature(client, { operation: "updateClassFeature", characterId, classFeatureId: 10292232, affectedClassFeatureId: 10292233 });
      await manageOptionalFeature(client, { operation: "deleteClassFeature", characterId, classFeatureId: 10292232 });
      await manageOptionalFeature(client, { operation: "addRacialTrait", characterId, racialTraitId: 13856144, affectedRacialTraitId: 13856145 });
      await manageOptionalFeature(client, { operation: "updateRacialTrait", characterId, racialTraitId: 13856144, affectedRacialTraitId: 13856145 });
      await manageOptionalFeature(client, { operation: "deleteRacialTrait", characterId, racialTraitId: 13856144 });
      await manageOptionalFeature(client, { operation: "deleteClassFeatureCollection", characterId, classFeatureIds: [] });
      await manageOptionalFeature(client, { operation: "deleteRacialTraitCollection", characterId, racialTraitIds: [] });

      await setCharacterDecoration(client, {
        characterId,
        kind: "portrait",
        avatarId: 10064,
        avatarUrl: "https://www.dndbeyond.com/avatars/10/64/636339379309450725.png?width=150&height=150&fit=crop&quality=95&auto=webp",
      });
      character = await fetchCharacter(client, characterId);
      expect(character.decorations?.avatarId).toBe(10064);

      await setCharacterFeatureFlag(client, { flags: ["release-gate-character-sheet-campaign-settings", "release-gate-character-sheet-tour"] });

      const campaigns = await client.get<any[]>(ENDPOINTS.campaign.list(), `live-extended-campaigns:${Date.now()}`, 0);
      const campaign = campaigns[0];
      if (campaign?.id) await getPartyInventory(client, { campaignId: campaign.id });

      await getCharacterRuleData(client, { characterId });
      await getCharacterShareUrl(client, { characterId });

      const componentKey = "AbilityManager__Type--1";
      await manageRollResult(client, { operation: "listGroups", characterId, componentKey });
      const groupKey = randomUUID();
      let previousRollKey: string | null = null;
      const rollResults = Array.from({ length: 6 }, () => {
        const roll = { rollKey: randomUUID(), nextRollKey: previousRollKey, rollTotal: null, assignedValue: null, rollValues: [] as unknown[] };
        previousRollKey = roll.rollKey;
        return roll;
      });
      await manageRollResult(client, { operation: "createGroup", characterId, groupKey, componentKey, nextGroupKey: null, rollResults });
      await manageRollResult(client, { operation: "deleteGroup", characterId, groupKey, componentKey });

      await manageVehicle(client, { operation: "create", characterId, vehicleId: "sjliv", name: "DDB MCP E2E Vehicle" });
      const vehiclesResult = await manageVehicle(client, { operation: "list", characterId });
      const vehicles = parseToolJson<VehicleMapping[]>(vehiclesResult);
      const vehicleId = vehicles[0]?.id;
      expect(vehicleId).toBeGreaterThan(0);
      await manageVehicle(client, { operation: "setFuel", characterId, id: vehicleId, remainingFuel: 0 });
      await manageVehicle(client, { operation: "createCondition", characterId, vehicleMappingId: vehicleId, conditionId: 1, level: 1 });
      await manageVehicle(client, { operation: "updateCondition", characterId, vehicleMappingId: vehicleId, conditionId: 1, level: 2 });
      await manageVehicle(client, { operation: "deleteCondition", characterId, vehicleMappingId: vehicleId, conditionId: 1 });
      const componentsResult = await manageVehicle(client, { operation: "createComponent", characterId, vehicleMappingId: vehicleId, componentIds: ["sjliv06c", "sj93b3"] });
      const components = parseToolJson<VehicleComponentMapping[]>(componentsResult);
      const componentMappingId = components[0]?.id;
      expect(componentMappingId).toBeGreaterThan(0);
      await manageVehicle(client, { operation: "listComponents", characterId, vehicleMappingId: vehicleId });
      await manageVehicle(client, { operation: "updateComponentHp", characterId, id: componentMappingId, removedHitPoints: 1 });
      await manageVehicle(client, { operation: "updateComponent", characterId, id: componentMappingId, vehicleMappingId: vehicleId, componentId: "sjliv06c", displayOrder: 1 });
      await manageVehicle(client, { operation: "delete", characterId, id: vehicleId });

      await setHasCustomBackground(client, { characterId, hasCustomBackground: false });
    } finally {
      await deleteTestCharacter(client, characterId);
    }
  }, 240_000);
});
