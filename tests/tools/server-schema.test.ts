import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  characterFeatSchema,
  characterInfusionSchema,
  decorationSchema,
  customActionSchema,
  customMovementSchema,
  customProficiencySchema,
  customSenseSchema,
  optionalFeatureSchema,
  rollResultSchema,
  setCustomValueSchema,
  updateHpSchema,
  vehicleSchema,
} from "../../src/server.js";

const updateHpObject = z.object(updateHpSchema);
const setCustomValueObject = z.object(setCustomValueSchema);

describe("MCP tool schemas", () => {
  it("requires DDB temporaryHitPoints on update_hp", () => {
    expect(updateHpObject.safeParse({ characterId: 1, hpChange: -5 }).success).toBe(false);
    expect(updateHpObject.safeParse({ characterId: 1, hpChange: -5, temporaryHitPoints: 0 }).success).toBe(true);
  });

  it("requires set_custom_value.value even though the value may be any JSON type", () => {
    expect(setCustomValueObject.safeParse({ characterId: 1, typeId: 2 }).success).toBe(false);
    expect(setCustomValueObject.safeParse({ characterId: 1, typeId: 2, value: null }).success).toBe(true);
    expect(setCustomValueObject.safeParse({ characterId: 1, typeId: 2, value: "" }).success).toBe(true);
  });

  it("models custom proficiency operation-specific required fields", () => {
    expect(customProficiencySchema.safeParse({ operation: "create", characterId: 1, name: "X" }).success).toBe(false);
    expect(customProficiencySchema.safeParse({ operation: "create", characterId: 1, name: "X", type: 3 }).success).toBe(true);
    expect(customProficiencySchema.safeParse({ operation: "delete", characterId: 1 }).success).toBe(false);
    expect(customProficiencySchema.safeParse({ operation: "delete", characterId: 1, id: 2 }).success).toBe(true);
  });

  it("models custom movement and sense distance requirements", () => {
    expect(customMovementSchema.safeParse({ operation: "create", characterId: 1, movementId: 4 }).success).toBe(false);
    expect(customMovementSchema.safeParse({ operation: "create", characterId: 1, movementId: 4, distance: 60 }).success).toBe(true);
    expect(customMovementSchema.safeParse({ operation: "delete", characterId: 1, movementId: 4 }).success).toBe(true);

    expect(customSenseSchema.safeParse({ operation: "update", characterId: 1, senseId: 2 }).success).toBe(false);
    expect(customSenseSchema.safeParse({ operation: "update", characterId: 1, senseId: 2, distance: 120 }).success).toBe(true);
    expect(customSenseSchema.safeParse({ operation: "delete", characterId: 1, senseId: 2 }).success).toBe(true);
  });

  it("models custom action operation-specific required fields", () => {
    expect(customActionSchema.safeParse({ operation: "create", characterId: 1, name: "X" }).success).toBe(false);
    expect(customActionSchema.safeParse({ operation: "create", characterId: 1, name: "X", actionType: 3 }).success).toBe(true);
    expect(customActionSchema.safeParse({ operation: "update", characterId: 1 }).success).toBe(false);
    expect(customActionSchema.safeParse({ operation: "update", characterId: 1, id: 2 }).success).toBe(true);
  });


  it("models decoration and roll-result required fields", () => {
    expect(decorationSchema.safeParse({ kind: "themeColor", characterId: 1 }).success).toBe(false);
    expect(decorationSchema.safeParse({ kind: "themeColor", characterId: 1, themeColorId: 42 }).success).toBe(true);
    expect(decorationSchema.safeParse({ kind: "portrait", characterId: 1, avatarId: 10064 }).success).toBe(true);

    expect(rollResultSchema.safeParse({ operation: "createGroup", characterId: 1, groupKey: "g" }).success).toBe(false);
    expect(rollResultSchema.safeParse({ operation: "createGroup", characterId: 1, groupKey: "g", componentKey: "c", rollResults: [] }).success).toBe(true);
    expect(rollResultSchema.safeParse({ operation: "deleteGroup", characterId: 1, groupKey: "g" }).success).toBe(false);
    expect(rollResultSchema.safeParse({ operation: "deleteGroup", characterId: 1, groupKey: "g", componentKey: "c" }).success).toBe(true);
  });

  it("models feat, infusion, and optional-feature payload fields", () => {
    expect(characterFeatSchema.safeParse({ operation: "addFromEntity", characterId: 1, entityId: 2 }).success).toBe(false);
    expect(characterFeatSchema.safeParse({ operation: "addFromEntity", characterId: 1, entityId: 2, entityTypeId: 3 }).success).toBe(true);

    expect(characterInfusionSchema.safeParse({ operation: "createKnown", characterId: 1, infusionId: 2 }).success).toBe(false);
    expect(characterInfusionSchema.safeParse({ operation: "createKnown", characterId: 1, choiceKey: "x", infusionId: 2 }).success).toBe(true);
    expect(characterInfusionSchema.safeParse({ operation: "deleteItem", characterId: 1, infusionId: 2 }).success).toBe(false);
    expect(characterInfusionSchema.safeParse({ operation: "deleteItem", characterId: 1, infusionId: 2, inventoryMappingId: 3 }).success).toBe(true);

    expect(optionalFeatureSchema.safeParse({ operation: "addClassFeature", characterId: 1, classFeatureId: 2 }).success).toBe(false);
    expect(optionalFeatureSchema.safeParse({ operation: "addClassFeature", characterId: 1, classFeatureId: 2, affectedClassFeatureId: 3 }).success).toBe(true);
    expect(optionalFeatureSchema.safeParse({ operation: "deleteRacialTraitCollection", characterId: 1 }).success).toBe(false);
    expect(optionalFeatureSchema.safeParse({ operation: "deleteRacialTraitCollection", characterId: 1, racialTraitIds: [] }).success).toBe(true);
  });

  it("models vehicle operation-specific required fields", () => {
    expect(vehicleSchema.safeParse({ operation: "create", characterId: 1 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ operation: "create", characterId: 1, vehicleId: "sjliv" }).success).toBe(true);
    expect(vehicleSchema.safeParse({ operation: "createComponent", characterId: 1, vehicleMappingId: 2 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ operation: "createComponent", characterId: 1, vehicleMappingId: 2, componentIds: ["sjliv06c"] }).success).toBe(true);
    expect(vehicleSchema.safeParse({ operation: "updateComponentHp", characterId: 1, id: 2 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ operation: "updateComponentHp", characterId: 1, id: 2, removedHitPoints: 1 }).success).toBe(true);
  });
});
