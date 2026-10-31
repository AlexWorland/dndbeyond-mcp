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
  return (char.classes ?? []).reduce((sum, cls) => sum + cls.level, 0);
}

export function calculateMaxHp(char: DdbCharacter): number {
  if (char.overrideHitPoints != null) return char.overrideHitPoints;

  const base = char.baseHitPoints ?? 0;
  const bonus = char.bonusHitPoints ?? 0;
  const level = computeLevel(char) || 1;

  // D&D Beyond's sheet adds the Constitution modifier once per character level
  // on top of baseHitPoints (hit dice rolls) and bonusHitPoints (feats/items).
  const conScore = computeFinalAbilityScore(
    char.stats ?? [],
    char.bonusStats ?? [],
    char.overrideStats ?? [],
    char.modifiers ?? {},
    3
  );
  const conMod = Math.floor((conScore - 10) / 2);

  return base + bonus + conMod * level;
}

/**
 * Base AC granted by "unarmored armor class" modifiers.
 * D&D Beyond represents natural armor (e.g. Lizardfolk) as a `set` modifier whose
 * value is the bonus over 10 (3 => AC 13 + DEX), but some sources store the full
 * value instead, so accept both conventions.
 */
export function getUnarmoredBaseAc(char: DdbCharacter): number {
  let base = 10;
  for (const list of Object.values(char.modifiers ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.type !== "set" || mod.subType !== "unarmored-armor-class" || mod.value == null) continue;
      const candidate = mod.value <= 10 ? 10 + mod.value : mod.value;
      base = Math.max(base, candidate);
    }
  }
  return base;
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

  for (const item of char.inventory ?? []) {
    if (!item.equipped) continue;

    const itemName = item.definition.name?.toLowerCase() || "";
    const itemType = item.definition.type?.toLowerCase() || "";
    const filterType = item.definition.filterType?.toLowerCase() || "";

    // Check for shield. D&D Beyond leaves `definition.type` empty for many
    // shield items, so the name and filterType are the reliable signals.
    if (itemName.includes("shield") || itemType.includes("shield") || filterType.includes("shield")) {
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
    const classes = char.classes ?? [];
    const isBarbarian = classes.some(cls => cls.definition.name === "Barbarian");
    const isMonk = classes.some(cls => cls.definition.name === "Monk");

    // Without armor, the character gets the best available unarmored formula:
    // natural armor (Lizardfolk etc.), Barbarian/Monk unarmored defense, or plain 10 + DEX.
    const naturalArmorBase = getUnarmoredBaseAc(char);
    const candidates = [10 + dexMod];
    if (isBarbarian) candidates.push(10 + dexMod + conMod);
    if (isMonk) candidates.push(10 + dexMod + wisMod);
    if (naturalArmorBase > 10) candidates.push(naturalArmorBase + dexMod);

    finalAc = Math.max(...candidates);

    // "bonus" style unarmored armor class modifiers stack on top
    finalAc += sumModifierBonuses(char.modifiers, "unarmored-armor-class");
  } else if (armorType === "light") {
    finalAc = baseAc + dexMod;
  } else if (armorType === "medium") {
    finalAc = baseAc + Math.min(dexMod, 2);
  } else if (armorType === "heavy") {
    finalAc = baseAc; // No DEX bonus
  }

  // Add shield bonus
  finalAc += shieldBonus;

  // Add AC modifiers from features/spells (unarmored handled above)
  const acBonus = sumModifierBonuses(char.modifiers, "armor-class")
    + sumModifierBonuses(char.modifiers, "armored-armor-class");

  finalAc += acBonus;

  return finalAc;
}
