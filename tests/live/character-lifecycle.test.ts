import { describe, it, expect, afterAll } from "vitest";
import { getLiveClient, createTestCharacter, deleteTestCharacter } from "./setup.js";
import { ENDPOINTS } from "../../src/api/endpoints.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";

/**
 * Live character lifecycle test.
 *
 * Creates a fresh character, exercises all creation/modification endpoints,
 * then deletes it. Tests run sequentially since each depends on prior state.
 *
 * Uses 2024 PHB IDs (not legacy). Legacy IDs have different numbering:
 *   - Legacy class IDs: 1=Bard, 5=Ranger, 10=Fighter
 *   - 2024 class IDs:  2190876=Bard, 2190882=Ranger, 2190879=Fighter
 *   - Legacy race IDs: entityRaceId=1 + entityRaceTypeId=1743923279 = Human (legacy)
 *   - 2024 race IDs:   entityRaceId=1751441 + entityRaceTypeId=1743923279 = Human (2024)
 */
describe("Live: Character Lifecycle", () => {
  let client: DdbClient;
  let testCharacterId: number | null = null;

  // Cleanup: always try to delete the test character
  afterAll(async () => {
    if (testCharacterId && client) {
      await deleteTestCharacter(client, testCharacterId);
    }
  });

  it("should create a character via standard-build", async () => {
    client = await getLiveClient();
    testCharacterId = await createTestCharacter(client);
    expect(testCharacterId).toBeGreaterThan(0);
  });

  it("should add a class (Fighter)", async () => {
    expect(testCharacterId).not.toBeNull();
    // 2024 Fighter classId=2190879
    await client.post(
      ENDPOINTS.character.addClass(),
      { characterId: testCharacterId, classId: 2190879, level: 1 },
      [`character:${testCharacterId}`]
    );
  });

  it("should set background (Soldier)", async () => {
    expect(testCharacterId).not.toBeNull();
    // 2024 Soldier backgroundId=406488
    await client.put(
      ENDPOINTS.character.setBackground(),
      { characterId: testCharacterId, backgroundId: 406488 },
      [`character:${testCharacterId}`]
    );
  });

  it("should set species (Human)", async () => {
    expect(testCharacterId).not.toBeNull();
    // 2024 Human: entityRaceId=1751441, entityRaceTypeId=1743923279
    await client.put(
      ENDPOINTS.character.setRace(),
      { characterId: testCharacterId, entityRaceId: 1751441, entityRaceTypeId: 1743923279 },
      [`character:${testCharacterId}`]
    );
  });

  it("should set ability scores", async () => {
    expect(testCharacterId).not.toBeNull();
    // Standard array: 15, 14, 13, 12, 10, 8
    const scores = [
      { statId: 1, value: 15 }, // STR
      { statId: 2, value: 13 }, // DEX
      { statId: 3, value: 14 }, // CON
      { statId: 4, value: 8 },  // INT
      { statId: 5, value: 10 }, // WIS
      { statId: 6, value: 12 }, // CHA
    ];
    for (const score of scores) {
      await client.put(
        ENDPOINTS.character.setAbilityScore(),
        { characterId: testCharacterId, statId: score.statId, type: 1, value: score.value },
        [`character:${testCharacterId}`]
      );
    }
  });

  it("should update character name", async () => {
    expect(testCharacterId).not.toBeNull();
    await client.put(
      ENDPOINTS.character.updateName(),
      { characterId: testCharacterId, name: "MCP Test Character" },
      [`character:${testCharacterId}`]
    );
  });

  it("should read the created character and verify data", async () => {
    expect(testCharacterId).not.toBeNull();
    const cacheKey = `live-test-lifecycle:${testCharacterId}:${Date.now()}`;
    const character = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(testCharacterId!),
      cacheKey,
      1
    );

    expect(character.name).toBe("MCP Test Character");
    expect(character.race.fullName).toBe("Human");
    expect(character.classes.length).toBeGreaterThan(0);
    expect(character.classes[0].definition.name).toBe("Fighter");
  });

  it("should delete the character", async () => {
    expect(testCharacterId).not.toBeNull();
    await client.delete(
      ENDPOINTS.character.delete(),
      { characterId: testCharacterId },
      [`character:${testCharacterId}`]
    );
    // Mark as null so afterAll doesn't try to delete again
    testCharacterId = null;
  });
});
