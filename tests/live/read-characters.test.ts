import { describe, it, expect } from "vitest";
import { setupLiveCharacter } from "./setup.js";
import { getCharacter, listCharacters } from "../../src/tools/character.js";

describe("Live: Character endpoints", () => {
  it("should list all characters across campaigns", async () => {
    const { client } = await setupLiveCharacter();
    const result = await listCharacters(client);
    const text = result.content[0].text;

    expect(text).toBeDefined();
    expect(text.length).toBeGreaterThan(0);
  });

  it("should get character summary (detail=summary)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();
    const result = await getCharacter(client, {
      characterId: testCharacterId,
      detail: "summary",
    });
    const text = result.content[0].text;

    expect(text).toContain("Name:");
    expect(text).toContain("Race:");
    expect(text).toContain("Class:");
    expect(text).toContain("Level:");
    expect(text).toContain("HP:");
    expect(text).toContain("AC:");
  });

  it("should get character sheet (detail=sheet, default)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();
    const result = await getCharacter(client, {
      characterId: testCharacterId,
    });
    const text = result.content[0].text;

    expect(text).toContain("===");
    expect(text).toContain("--- Ability Scores ---");
    expect(text).toContain("--- Saving Throws");
    expect(text).toContain("--- Skills");
    expect(text).toContain("--- Limited-Use Resources ---");
    expect(text).toContain("--- Class Features ---");
    expect(text).toContain("--- Racial Traits ---");
  });

  it("should include proficiencies in character sheet", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();
    const result = await getCharacter(client, {
      characterId: testCharacterId,
      detail: "sheet",
    });
    const text = result.content[0].text;

    expect(text).toContain("--- Proficiencies ---");
  });

  it("should get full character with definitions (detail=full)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();
    const result = await getCharacter(client, {
      characterId: testCharacterId,
      detail: "full",
    });
    const text = result.content[0].text;

    expect(text).toContain("===");
    expect(text.length).toBeGreaterThan(2000);
  });
});
