import { describe, it, expect } from "vitest";
import { setupLiveCharacter } from "./setup.js";
import {
  updateHp,
  updateCurrency,
  updateSpellSlots,
  updateDeathSaves,
} from "../../src/tools/character.js";
import { ENDPOINTS } from "../../src/api/endpoints.js";
import type { DdbCharacter } from "../../src/types/character.js";

/**
 * Fetch raw character data with cache bypass for fresh reads.
 */
async function fetchCharacterState(
  client: Awaited<ReturnType<typeof setupLiveCharacter>>["client"],
  characterId: number
): Promise<DdbCharacter> {
  const cacheKey = `live-test-char:${characterId}:${Date.now()}`;
  return client.get<DdbCharacter>(
    ENDPOINTS.character.get(characterId),
    cacheKey,
    1
  );
}

/**
 * D&D Beyond deprecated v5 write endpoints in 2025-2026.
 * These tests verify the behavior of write operations:
 * - If the API still works: test write + rollback
 * - If deprecated: verify graceful deprecation message
 */
describe("Live: Write endpoints", () => {
  it("should handle HP update (write or deprecation notice)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();

    const result = await updateHp(client, {
      characterId: testCharacterId,
      hpChange: -1,
    });
    const text = result.content[0].text;

    if (text.includes("temporarily unavailable")) {
      // Deprecated — verify graceful message
      expect(text).toContain("deprecated");
      expect(text).toContain(String(testCharacterId));
    } else {
      // Still works — rollback the damage
      expect(text).toContain("HP");
      await updateHp(client, {
        characterId: testCharacterId,
        hpChange: 1,
      });
    }
  });

  it("should handle currency update (write or deprecation notice)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();

    const result = await updateCurrency(client, {
      characterId: testCharacterId,
      currency: "gp",
      delta: 1,
    });
    const text = result.content[0].text;

    if (text.includes("temporarily unavailable")) {
      expect(text).toContain("deprecated");
      expect(text).toContain(String(testCharacterId));
    } else {
      expect(text).toContain("gp");
      // Rollback
      await updateCurrency(client, {
        characterId: testCharacterId,
        currency: "gp",
        delta: -1,
      });
    }
  });

  it("should handle death save update (write or deprecation notice)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();

    const before = await fetchCharacterState(client, testCharacterId);
    const originalSuccesses = before.deathSaves.successCount ?? 0;
    const originalFailures = before.deathSaves.failCount ?? 0;

    const result = await updateDeathSaves(client, {
      characterId: testCharacterId,
      type: "success",
      count: 1,
    });
    const text = result.content[0].text;

    if (text.includes("temporarily unavailable")) {
      expect(text).toContain("deprecated");
    } else {
      // Rollback
      await updateDeathSaves(client, {
        characterId: testCharacterId,
        type: "success",
        count: originalSuccesses,
      });
      await updateDeathSaves(client, {
        characterId: testCharacterId,
        type: "failure",
        count: originalFailures,
      });
    }
  });

  it("should handle spell slot update (write or deprecation notice)", async () => {
    const { client, testCharacterId } = await setupLiveCharacter();

    const before = await fetchCharacterState(client, testCharacterId);
    const slots = before.spellSlots;

    if (!slots || slots.length === 0 || !slots.some((s) => s.available > 0)) {
      return; // Character has no spell slots — skip
    }

    const slotLevel = slots.find((s) => s.available > 0)!;
    const originalUsed = slotLevel.used;
    const newUsed = Math.min(originalUsed + 1, slotLevel.available);

    const result = await updateSpellSlots(client, {
      characterId: testCharacterId,
      level: slotLevel.level,
      used: newUsed,
    });
    const text = result.content[0].text;

    if (text.includes("temporarily unavailable")) {
      expect(text).toContain("deprecated");
    } else {
      // Rollback
      await updateSpellSlots(client, {
        characterId: testCharacterId,
        level: slotLevel.level,
        used: originalUsed,
      });
    }
  });
});
