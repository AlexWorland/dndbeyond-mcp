/**
 * Shared character calculation utilities used by both tools and resources.
 * These are the canonical implementations for ability scores, AC, HP, and level.
 */

import type {
  DdbCharacter,
  DdbAbilityScore,
  DdbModifier,
} from "../types/character.js";

export const ABILITY_NAMES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

// Maps stat ID (1-6) to the subType prefix used in D&D Beyond modifiers
export const ABILITY_SUBTYPE_MAP: Record<number, string> = {
  1: "strength-score",
  2: "dexterity-score",
  3: "constitution-score",
  4: "intelligence-score",
  5: "wisdom-score",
  6: "charisma-score",
};

export function calculateAbilityModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

export function sumModifierBonuses(
  modifiers: Record<string, DdbModifier[]>,
  subType: string
): number {
  let total = 0;
  for (const list of Object.values(modifiers)) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.type === "bonus" && mod.subType === subType && mod.value != null) {
        total += mod.value;
      }
    }
  }
  return total;
}

export function computeFinalAbilityScore(
  base: DdbAbilityScore[],
  bonus: DdbAbilityScore[],
  override: DdbAbilityScore[],
  modifiers: Record<string, DdbModifier[]>,
  id: number
): number {
  const overrideValue = override.find((s) => s.id === id)?.value;
  if (overrideValue !== null && overrideValue !== undefined) return overrideValue;

  const baseValue = base.find((s) => s.id === id)?.value ?? 10;
  const bonusValue = bonus.find((s) => s.id === id)?.value ?? 0;
  const modifierBonus = sumModifierBonuses(modifiers, ABILITY_SUBTYPE_MAP[id] ?? "");
  return baseValue + bonusValue + modifierBonus;
}

export function computeLevel(char: DdbCharacter): number {
  return char.classes.reduce((sum, cls) => sum + cls.level, 0);
}

export function calculateMaxHp(char: DdbCharacter): number {
  const base = char.baseHitPoints;
  const bonus = char.bonusHitPoints ?? 0;
  const override = char.overrideHitPoints;
  return override ?? (base + bonus);
}

export function calculateCurrentHp(char: DdbCharacter): number {
  const max = calculateMaxHp(char);
  return max - char.removedHitPoints;
}

export function calculateAc(char: DdbCharacter): number {
  const dexMod = Math.floor((computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, char.modifiers, 2) - 10) / 2);
  const conMod = Math.floor((computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, char.modifiers, 3) - 10) / 2);
  const wisMod = Math.floor((computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, char.modifiers, 5) - 10) / 2);

  // Find equipped armor and shields
  let baseAc = 10;
  let armorType: "heavy" | "medium" | "light" | "none" = "none";
  let shieldBonus = 0;

  for (const item of char.inventory) {
    if (!item.equipped) continue;

    const itemType = item.definition.type?.toLowerCase() || "";
    const filterType = item.definition.filterType?.toLowerCase() || "";

    // Check for shield
    if (itemType.includes("shield")) {
      shieldBonus = item.definition.armorClass ?? 2;
      continue;
    }

    // Check for armor
    if (itemType.includes("armor")) {
      const acValue = item.definition.armorClass ?? 10;

      if (filterType.includes("heavy") || itemType.includes("heavy")) {
        baseAc = acValue;
        armorType = "heavy";
      } else if (filterType.includes("medium") || itemType.includes("medium")) {
        baseAc = acValue;
        armorType = "medium";
      } else if (filterType.includes("light") || itemType.includes("light")) {
        baseAc = acValue;
        armorType = "light";
      } else {
        // Default to light armor if type unclear
        baseAc = acValue;
        armorType = "light";
      }
    }
  }

  // Apply DEX modifier based on armor type
  let finalAc = baseAc;
  if (armorType === "none") {
    // Check for unarmored defense
    const isBarbarian = char.classes.some(cls => cls.definition.name === "Barbarian");
    const isMonk = char.classes.some(cls => cls.definition.name === "Monk");

    if (isBarbarian) {
      finalAc = 10 + dexMod + conMod;
    } else if (isMonk) {
      finalAc = 10 + dexMod + wisMod;
    } else {
      finalAc = 10 + dexMod;
    }
  } else if (armorType === "light") {
    finalAc = baseAc + dexMod;
  } else if (armorType === "medium") {
    finalAc = baseAc + Math.min(dexMod, 2);
  } else if (armorType === "heavy") {
    finalAc = baseAc; // No DEX bonus
  }

  // Add shield bonus
  finalAc += shieldBonus;

  // Add AC modifiers from features/spells
  const acBonus = sumModifierBonuses(char.modifiers, "armor-class")
    + sumModifierBonuses(char.modifiers, "armored-armor-class")
    + sumModifierBonuses(char.modifiers, "unarmored-armor-class");

  finalAc += acBonus;

  return finalAc;
}
