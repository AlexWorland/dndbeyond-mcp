import { describe, it, expect, vi, beforeEach } from "vitest";
import { updatePactMagic } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";

describe("updatePactMagic", () => {
  let mockClient: DdbClient;

  beforeEach(() => {
    mockClient = {
      get: vi.fn().mockResolvedValue({ name: "Test Warlock", pactMagic: { level: 2, used: 0, available: 2 } }),
      getRaw: vi.fn(),
      put: vi.fn().mockResolvedValue({}),
    } as unknown as DdbClient;
  });

  it("should update pact magic slots", async () => {
    const result = await updatePactMagic(mockClient, {
      characterId: 123,
      used: 1,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/spell/slots",
      { characterId: 123, spellslots: { level2: 1 }, pact: true },
      ["character:123"]
    );

    expect(result.content[0].text).toBe("Updated pact magic slots to 1 used.");
  });

  it("should reject negative used slots", async () => {
    const result = await updatePactMagic(mockClient, {
      characterId: 123,
      used: -1,
    });

    expect(result.content[0].text).toBe("Used pact magic slots cannot be negative.");
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  it("should allow resetting to 0", async () => {
    const result = await updatePactMagic(mockClient, {
      characterId: 123,
      used: 0,
    });

    expect(mockClient.put).toHaveBeenCalledWith(
      "https://character-service.dndbeyond.com/character/v5/spell/slots",
      { characterId: 123, spellslots: { level2: 0 }, pact: true },
      ["character:123"]
    );

    expect(result.content[0].text).toBe("Updated pact magic slots to 0 used.");
  });
});
