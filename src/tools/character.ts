import type { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import { HttpError } from "../resilience/index.js";
import type {
  DdbCharacter,
  DdbAction,
  DdbModifier,
  DdbSpell,
  DdbFeat,
  DdbClassFeature,
  DdbRacialTrait,
  DdbInventoryItem,
} from "../types/character.js";
import type { DdbCampaign, DdbCampaignCharacter2 } from "../types/api.js";
import { fuzzyMatch, levenshteinDistance } from "../utils/fuzzy-match.js";
import { ABILITY_NAMES, ABILITY_SUBTYPE_MAP, calculateAbilityModifier, sumModifierBonuses, computeFinalAbilityScore, computeLevel, calculateMaxHp, calculateCurrentHp, calculateAc } from "../utils/character-calculations.js";

interface GetCharacterParams {
  characterId?: number;
  characterName?: string;
}

interface GetDefinitionParams {
  characterId?: number;
  characterName?: string;
  name: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function formatAbilityScores(char: DdbCharacter): string {
  return ABILITY_NAMES.map((name, idx) => {
    const id = idx + 1;
    const score = computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, char.modifiers, id);
    const modifier = calculateAbilityModifier(score);
    return `${name}: ${score} (${modifier})`;
  }).join(" | ");
}

function formatClasses(char: DdbCharacter): string {
  const classes = char.classes
    .sort((a, b) => (b.isStartingClass ? 1 : 0) - (a.isStartingClass ? 1 : 0))
    .map((cls) => {
      const subclass = cls.subclassDefinition?.name ? ` (${cls.subclassDefinition.name})` : "";
      return `${cls.definition.name}${subclass} ${cls.level}`;
    });
  return classes.join(" / ");
}

function formatHp(char: DdbCharacter): string {
  const current = calculateCurrentHp(char);
  const max = calculateMaxHp(char);
  const temp = char.temporaryHitPoints;
  return temp > 0 ? `${current}/${max} (+${temp} temp)` : `${current}/${max}`;
}

function formatSpells(char: DdbCharacter): string {
  const allSpells = getAllSpells(char);

  if (allSpells.length === 0) return StringUtils.EMPTY;

  const prepared = allSpells.filter((s) => s.prepared || s.alwaysPrepared);
  const preparedByLevel = prepared.reduce((acc, spell) => {
    const level = spell.definition.level;
    if (!acc[level]) acc[level] = [];
    acc[level].push(spell.definition.name);
    return acc;
  }, {} as Record<number, string[]>);

  const lines = Object.entries(preparedByLevel)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([level, spells]) => {
      const levelLabel = level === "0" ? "Cantrips" : `Level ${level}`;
      return `  ${levelLabel}: ${spells.join(", ")}`;
    });

  return `\nPrepared Spells:\n${lines.join("\n")}`;
}

function formatInventory(char: DdbCharacter): string {
  const equipped = char.inventory.filter((item) => item.equipped);
  if (equipped.length === 0) return StringUtils.EMPTY;

  const items = equipped.map((item) => {
    const qty = item.quantity > 1 ? ` (x${item.quantity})` : StringUtils.EMPTY;
    return `  - ${item.definition.name}${qty}`;
  });

  return `\nEquipped Items:\n${items.join("\n")}`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getAllSpells(char: DdbCharacter): DdbSpell[] {
  return [
    ...(char.spells.class ?? []),
    ...(char.spells.race ?? []),
    ...(char.spells.background ?? []),
    ...(char.spells.item ?? []),
    ...(char.spells.feat ?? []),
  ];
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return StringUtils.EMPTY;
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function resolveCharacterId(
  client: DdbClient,
  params: GetCharacterParams
): Promise<number | string> {
  if (params.characterId) return params.characterId;
  if (params.characterName) {
    const foundId = await findCharacterByName(client, params.characterName);
    if (!foundId) return `Character "${params.characterName}" not found.`;
    return foundId;
  }
  return "Either characterId or characterName must be provided.";
}

// Normalizes class/subclass feature access — class features nest under .definition,
// subclass features have flat properties
function featureName(f: DdbClassFeature): string {
  return f.definition?.name ?? f.name ?? "Unknown";
}
function featureLevel(f: DdbClassFeature): number {
  return f.definition?.requiredLevel ?? f.requiredLevel ?? 0;
}
function featureDescription(f: DdbClassFeature): string {
  return f.definition?.description ?? f.description ?? "";
}

function calculateProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

function getAbilityScoreNumeric(char: DdbCharacter, id: number): number {
  return computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, char.modifiers, id);
}

function getAbilityModNumeric(char: DdbCharacter, id: number): number {
  return Math.floor((getAbilityScoreNumeric(char, id) - 10) / 2);
}

// ============================================================================
// CHARACTER SHEET FORMATTING
// ============================================================================

const ABILITY_FULL_NAMES: Record<number, string> = {
  1: "Strength",
  2: "Dexterity",
  3: "Constitution",
  4: "Intelligence",
  5: "Wisdom",
  6: "Charisma",
};

const SAVING_THROW_SUBTYPES: Record<number, string> = {
  1: "strength-saving-throws",
  2: "dexterity-saving-throws",
  3: "constitution-saving-throws",
  4: "intelligence-saving-throws",
  5: "wisdom-saving-throws",
  6: "charisma-saving-throws",
};

const SKILL_DEFINITIONS: Array<{ name: string; abilityId: number; subType: string }> = [
  { name: "Acrobatics", abilityId: 2, subType: "acrobatics" },
  { name: "Animal Handling", abilityId: 5, subType: "animal-handling" },
  { name: "Arcana", abilityId: 4, subType: "arcana" },
  { name: "Athletics", abilityId: 1, subType: "athletics" },
  { name: "Deception", abilityId: 6, subType: "deception" },
  { name: "History", abilityId: 4, subType: "history" },
  { name: "Insight", abilityId: 5, subType: "insight" },
  { name: "Intimidation", abilityId: 6, subType: "intimidation" },
  { name: "Investigation", abilityId: 4, subType: "investigation" },
  { name: "Medicine", abilityId: 5, subType: "medicine" },
  { name: "Nature", abilityId: 4, subType: "nature" },
  { name: "Perception", abilityId: 5, subType: "perception" },
  { name: "Performance", abilityId: 6, subType: "performance" },
  { name: "Persuasion", abilityId: 6, subType: "persuasion" },
  { name: "Religion", abilityId: 4, subType: "religion" },
  { name: "Sleight of Hand", abilityId: 2, subType: "sleight-of-hand" },
  { name: "Stealth", abilityId: 2, subType: "stealth" },
  { name: "Survival", abilityId: 5, subType: "survival" },
];

function hasModifierBySubType(
  modifiers: Record<string, DdbModifier[]>,
  subType: string,
  type: string
): boolean {
  for (const list of Object.values(modifiers)) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.subType === subType && mod.type === type) return true;
    }
  }
  return false;
}

function formatSavingThrows(char: DdbCharacter): string {
  const profBonus = calculateProficiencyBonus(computeLevel(char));
  const saves = [];

  for (let id = 1; id <= 6; id++) {
    const mod = getAbilityModNumeric(char, id);
    const proficient = hasModifierBySubType(char.modifiers, SAVING_THROW_SUBTYPES[id], "proficiency");
    const total = mod + (proficient ? profBonus : 0);
    const sign = total >= 0 ? "+" : "";
    const prof = proficient ? " *" : "";
    saves.push(`${ABILITY_NAMES[id - 1]}: ${sign}${total}${prof}`);
  }

  return saves.join(" | ");
}

function formatSkills(char: DdbCharacter): string {
  const profBonus = calculateProficiencyBonus(computeLevel(char));

  const lines = SKILL_DEFINITIONS.map((skill) => {
    const abilityMod = getAbilityModNumeric(char, skill.abilityId);
    const proficient = hasModifierBySubType(char.modifiers, skill.subType, "proficiency");
    const expertise = hasModifierBySubType(char.modifiers, skill.subType, "expertise");

    let total = abilityMod;
    let marker = "";
    if (expertise) {
      total += profBonus * 2;
      marker = " **";
    } else if (proficient) {
      total += profBonus;
      marker = " *";
    }

    const sign = total >= 0 ? "+" : "";
    return `  ${skill.name}: ${sign}${total}${marker}`;
  });

  return lines.join("\n");
}

// Proficiency subTypes that belong to other sections (saving throws, skills)
const EXCLUDED_PROFICIENCY_SUBTYPES = new Set([
  "strength-saving-throws", "dexterity-saving-throws", "constitution-saving-throws",
  "intelligence-saving-throws", "wisdom-saving-throws", "charisma-saving-throws",
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival",
]);

const ARMOR_SUBTYPES = new Set(["light-armor", "medium-armor", "heavy-armor", "shields"]);
const WEAPON_GROUPS = new Set(["simple-weapons", "martial-weapons"]);

// Known language subTypes (lowercase, hyphenated)
const LANGUAGE_SUBTYPES = new Set([
  "common", "dwarvish", "elvish", "giant", "gnomish", "goblin", "halfling", "orc",
  "abyssal", "celestial", "draconic", "deep-speech", "infernal", "primordial",
  "sylvan", "undercommon", "thieves-cant", "druidic", "aarakocra", "auran",
  "aquan", "ignan", "terran",
]);

function formatProficiencies(char: DdbCharacter): string {
  const armor: Set<string> = new Set();
  const weapons: Set<string> = new Set();
  const tools: Set<string> = new Set();
  const languages: Set<string> = new Set();

  for (const list of Object.values(char.modifiers)) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.type !== "proficiency") continue;
      if (EXCLUDED_PROFICIENCY_SUBTYPES.has(mod.subType)) continue;

      const displayName = mod.friendlySubtypeName || mod.subType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

      if (ARMOR_SUBTYPES.has(mod.subType)) {
        armor.add(displayName);
      } else if (WEAPON_GROUPS.has(mod.subType)) {
        weapons.add(displayName);
      } else if (LANGUAGE_SUBTYPES.has(mod.subType)) {
        languages.add(displayName);
      } else if (mod.subType.endsWith("-tools") || mod.subType.includes("tools") ||
                 mod.subType.includes("kit") || mod.subType.includes("supplies") ||
                 mod.subType.includes("instrument") || mod.subType.includes("set")) {
        tools.add(displayName);
      } else if (mod.friendlySubtypeName && /^[A-Z]/.test(mod.friendlySubtypeName) &&
                 !mod.subType.includes("weapon") && !mod.subType.includes("armor")) {
        // Individual weapon proficiencies (e.g., "battleaxes", "handaxes") go to weapons
        weapons.add(displayName);
      } else {
        weapons.add(displayName); // Default: treat unknown proficiencies as weapon-like
      }
    }
  }

  const lines: string[] = [];
  if (armor.size > 0) lines.push(`Armor: ${[...armor].sort().join(", ")}`);
  if (weapons.size > 0) lines.push(`Weapons: ${[...weapons].sort().join(", ")}`);
  if (tools.size > 0) lines.push(`Tools: ${[...tools].sort().join(", ")}`);
  if (languages.size > 0) lines.push(`Languages: ${[...languages].sort().join(", ")}`);

  if (lines.length === 0) return StringUtils.EMPTY;

  return `\n--- Proficiencies ---\n${lines.join("\n")}`;
}

function formatSpellcasting(char: DdbCharacter): string {
  const allSpells = getAllSpells(char);

  if (allSpells.length === 0) return StringUtils.EMPTY;

  const SPELLCASTING_ABILITY: Record<string, number> = {
    "Wizard": 4, "Artificer": 4,  // INT
    "Sorcerer": 6, "Warlock": 6, "Bard": 6, "Paladin": 6,  // CHA
    "Cleric": 5, "Druid": 5, "Ranger": 5,  // WIS
  };

  const profBonus = calculateProficiencyBonus(computeLevel(char));
  const spellcastingClasses = char.classes.filter(cls => SPELLCASTING_ABILITY[cls.definition.name]);

  if (spellcastingClasses.length === 0) {
    // Fallback to WIS if no known spellcasting class
    const wisMod = getAbilityModNumeric(char, 5);
    const spellSaveDC = 8 + profBonus + wisMod;
    const spellAttack = profBonus + wisMod;
    const attackSign = spellAttack >= 0 ? "+" : "";
    return `Spell Save DC: ${spellSaveDC} | Spell Attack: ${attackSign}${spellAttack}`;
  }

  const dcStrings = spellcastingClasses.map(cls => {
    const abilityId = SPELLCASTING_ABILITY[cls.definition.name] ?? 5;
    const abilityMod = getAbilityModNumeric(char, abilityId);
    const spellSaveDC = 8 + profBonus + abilityMod;
    const spellAttack = profBonus + abilityMod;
    const attackSign = spellAttack >= 0 ? "+" : "";

    if (spellcastingClasses.length > 1) {
      return `${cls.definition.name}: DC ${spellSaveDC} (${attackSign}${spellAttack} attack)`;
    }
    return `Spell Save DC: ${spellSaveDC} | Spell Attack: ${attackSign}${spellAttack}`;
  });

  return dcStrings.join(" | ");
}

function formatLimitedUseResources(char: DdbCharacter): string {
  const resources: string[] = [];
  const actions = char.actions ?? {};

  for (const list of Object.values(actions)) {
    if (!Array.isArray(list)) continue;
    for (const action of list) {
      if (action.limitedUse) {
        const used = action.limitedUse.numberUsed;
        const max = action.limitedUse.maxUses;
        const remaining = max - used;
        const reset = action.limitedUse.resetTypeDescription || "unknown";
        resources.push(`  ${action.name}: ${remaining}/${max} (${reset})`);
      }
    }
  }

  return resources.length > 0 ? resources.join("\n") : "  None";
}

function formatFeatNames(char: DdbCharacter): string {
  if (!char.feats || char.feats.length === 0) return "None";
  return char.feats.map((f) => f.definition.name).join(", ");
}

function getActiveClassFeatures(char: DdbCharacter): Array<{ name: string; className: string; level: number }> {
  const seen = new Set<string>();
  const features: Array<{ name: string; className: string; level: number }> = [];

  for (const cls of char.classes) {
    const classFeatures = cls.classFeatures ?? [];
    for (const feature of classFeatures) {
      if (featureLevel(feature) <= cls.level && !seen.has(featureName(feature))) {
        seen.add(featureName(feature));
        features.push({
          name: featureName(feature),
          className: cls.definition.name,
          level: featureLevel(feature),
        });
      }
    }

    if (cls.subclassDefinition?.classFeatures) {
      for (const feature of cls.subclassDefinition.classFeatures) {
        if (featureLevel(feature) <= cls.level && !seen.has(featureName(feature))) {
          seen.add(featureName(feature));
          features.push({
            name: featureName(feature),
            className: `${cls.definition.name} (${cls.subclassDefinition.name})`,
            level: featureLevel(feature),
          });
        }
      }
    }
  }

  return features;
}

function formatClassFeatureNames(char: DdbCharacter): string {
  const features = getActiveClassFeatures(char);
  if (features.length === 0) return "None";
  return features.map((f) => f.name).join(", ");
}

function formatRacialTraitNames(char: DdbCharacter): string {
  const traits = char.race.racialTraits ?? [];
  if (traits.length === 0) return "None";
  return traits.map((t) => t.definition.name).join(", ");
}

function formatSpeed(char: DdbCharacter): string {
  // Base walking speed for most races is 30 ft
  let baseSpeed = 30;

  // Check modifiers for speed bonuses
  let speedBonus = sumModifierBonuses(char.modifiers, "speed");
  speedBonus += sumModifierBonuses(char.modifiers, "unarmored-movement");
  speedBonus += sumModifierBonuses(char.modifiers, "innate-speed-walking");

  const totalSpeed = baseSpeed + speedBonus;
  return `Speed: ${totalSpeed} ft`;
}

function formatSpellSlots(char: DdbCharacter): string {
  if (!char.spellSlots || char.spellSlots.length === 0) {
    return StringUtils.EMPTY;
  }

  const lines = char.spellSlots
    .filter(slot => slot.available > 0)
    .map(slot => {
      const filled = "\u25CF".repeat(slot.available - slot.used);
      const empty = "\u25CB".repeat(slot.used);
      return `Level ${slot.level}: ${filled}${empty} (${slot.used}/${slot.available} used)`;
    });

  if (lines.length === 0) return StringUtils.EMPTY;

  let result = `\n--- Spell Slots ---\n${lines.join("\n")}`;

  // Add pact magic if available
  if (char.pactMagic && char.pactMagic.available > 0) {
    const filled = "\u25CF".repeat(char.pactMagic.available - char.pactMagic.used);
    const empty = "\u25CB".repeat(char.pactMagic.used);
    result += `\nPact Magic (Level ${char.pactMagic.level}): ${filled}${empty} (${char.pactMagic.used}/${char.pactMagic.available} used)`;
  }

  return result;
}

function formatHitDice(char: DdbCharacter): string {
  const hitDiceByClass: string[] = [];

  // Hit die type mapping
  const HIT_DIE_MAP: Record<string, string> = {
    "Barbarian": "d12",
    "Fighter": "d10",
    "Paladin": "d10",
    "Ranger": "d10",
    "Bard": "d8",
    "Cleric": "d8",
    "Druid": "d8",
    "Monk": "d8",
    "Rogue": "d8",
    "Warlock": "d8",
    "Artificer": "d8",
    "Sorcerer": "d6",
    "Wizard": "d6",
  };

  const hitDiceUsed = char.hitDiceUsed ?? 0;

  for (const cls of char.classes) {
    const hitDie = HIT_DIE_MAP[cls.definition.name] ?? "d8";
    const total = cls.level;
    hitDiceByClass.push(`${cls.definition.name}: ${total}${hitDie}`);
  }

  if (hitDiceByClass.length === 0) return StringUtils.EMPTY;

  return `\n--- Hit Dice ---\n${hitDiceByClass.join("\n")}${hitDiceUsed > 0 ? ` (${hitDiceUsed} used)` : ""}`;
}

function formatTraits(char: DdbCharacter): string {
  const traits = char.traits;
  const lines: string[] = [];

  if (traits.personalityTraits) lines.push(`Personality: ${traits.personalityTraits}`);
  if (traits.ideals) lines.push(`Ideals: ${traits.ideals}`);
  if (traits.bonds) lines.push(`Bonds: ${traits.bonds}`);
  if (traits.flaws) lines.push(`Flaws: ${traits.flaws}`);

  if (lines.length === 0) return StringUtils.EMPTY;

  return `\n--- Traits ---\n${lines.join("\n")}`;
}

function formatNotes(char: DdbCharacter): string {
  const notes = char.notes;
  const lines: string[] = [];

  if (notes.backstory) lines.push(`Backstory: ${notes.backstory}`);
  if (notes.personalPossessions) lines.push(`Personal Possessions: ${notes.personalPossessions}`);
  if (notes.otherNotes) lines.push(`Other Notes: ${notes.otherNotes}`);
  if (notes.allies) lines.push(`Allies: ${notes.allies}`);
  if (notes.organizations) lines.push(`Organizations: ${notes.organizations}`);

  if (lines.length === 0) return StringUtils.EMPTY;

  return `\n--- Notes ---\n${lines.join("\n")}`;
}

function formatCharacterSheet(char: DdbCharacter): string {
  const sections = [
    `=== ${char.name} ===`,
    `Race: ${char.race.fullName}`,
    `Class: ${formatClasses(char)}`,
    `Level: ${computeLevel(char)} (Proficiency Bonus: +${calculateProficiencyBonus(computeLevel(char))})`,
    `Background: ${char.background?.definition?.name ?? "None"}`,
    `HP: ${formatHp(char)}`,
    `AC: ${calculateAc(char)}`,
    formatSpeed(char),
    StringUtils.EMPTY,
    `--- Ability Scores ---`,
    formatAbilityScores(char),
    StringUtils.EMPTY,
    `--- Saving Throws (* = proficient) ---`,
    formatSavingThrows(char),
    StringUtils.EMPTY,
    `--- Skills (* = proficient, ** = expertise) ---`,
    formatSkills(char),
  ];

  // Add proficiencies display (after skills, before spellcasting)
  const proficiencies = formatProficiencies(char);
  if (proficiencies) sections.push(proficiencies.trim());

  const spellcasting = formatSpellcasting(char);
  if (spellcasting) {
    sections.push(StringUtils.EMPTY, `--- Spellcasting ---`, spellcasting);
    const spells = formatSpells(char);
    if (spells) sections.push(spells.trim());

    // Add spell slots display
    const spellSlots = formatSpellSlots(char);
    if (spellSlots) sections.push(spellSlots.trim());
  }

  // Add hit dice display
  const hitDice = formatHitDice(char);
  if (hitDice) sections.push(hitDice.trim());

  sections.push(
    StringUtils.EMPTY,
    `--- Limited-Use Resources ---`,
    formatLimitedUseResources(char),
    StringUtils.EMPTY,
    `--- Feats ---`,
    formatFeatNames(char),
    StringUtils.EMPTY,
    `--- Class Features ---`,
    formatClassFeatureNames(char),
    StringUtils.EMPTY,
    `--- Racial Traits ---`,
    formatRacialTraitNames(char)
  );

  const inventory = formatInventory(char);
  if (inventory) sections.push(inventory);

  // Add traits display
  const traits = formatTraits(char);
  if (traits) sections.push(traits.trim());

  // Add notes display
  const notes = formatNotes(char);
  if (notes) sections.push(notes.trim());

  if (char.campaign) {
    sections.push(StringUtils.EMPTY, `Campaign: ${char.campaign.name}`);
  }

  return sections.join("\n");
}

// ============================================================================
// DEFINITION LOOKUP
// ============================================================================

interface DefinitionResult {
  type: string;
  name: string;
  source: string;
  text: string;
}

function formatSpellDefinition(spell: DdbSpell): string {
  const d = spell.definition;
  const ACTIVATION_TYPES: Record<number, string> = {
    1: "Action",
    3: "Bonus Action",
    6: "Reaction",
  };
  const components = (d.components ?? [])
    .map((c) => ({ 1: "V", 2: "S", 3: "M" })[c])
    .filter(Boolean)
    .join(", ");
  const materialNote = d.componentsDescription
    ? ` (${d.componentsDescription})`
    : "";

  const levelLabel = d.level === 0 ? "Cantrip" : `Level ${d.level}`;
  const castingTime = d.activation
    ? `${d.activation.activationTime} ${ACTIVATION_TYPES[d.activation.activationType] ?? "Action"}`
    : "1 Action";

  let range = "Self";
  if (d.range) {
    if (d.range.rangeValue && d.range.origin !== "Self") {
      range = `${d.range.rangeValue} ft`;
    } else {
      range = d.range.origin;
    }
    if (d.range.aoeType && d.range.aoeValue) {
      range += ` (${d.range.aoeValue}-ft ${d.range.aoeType})`;
    }
  }

  let duration = "Instantaneous";
  if (d.duration) {
    const interval = d.duration.durationInterval;
    const unit = d.duration.durationUnit;
    const isConcentration = d.duration.durationType === "Concentration";
    if (interval && unit) {
      duration = `${isConcentration ? "Concentration, up to " : ""}${interval} ${unit}${interval > 1 ? "s" : ""}`;
    } else if (isConcentration) {
      duration = "Concentration";
    }
  }

  const lines = [
    `${d.name} (${levelLabel} ${d.school})`,
    `Casting Time: ${castingTime}`,
    `Range: ${range}`,
    `Components: ${components || "None"}${materialNote}`,
    `Duration: ${duration}`,
  ];
  if (d.ritual) lines.push("Ritual: Yes");
  lines.push(StringUtils.EMPTY, stripHtml(d.description));
  return lines.join("\n");
}

function formatFeatDefinition(feat: DdbFeat): string {
  const d = feat.definition;
  const lines = [d.name];
  if (d.prerequisite) lines.push(`Prerequisite: ${d.prerequisite}`);
  lines.push(StringUtils.EMPTY, stripHtml(d.description));
  return lines.join("\n");
}

function formatClassFeatureDefinition(feature: DdbClassFeature, className: string): string {
  const lines = [
    `${featureName(feature)} (${className}, Level ${featureLevel(feature)})`,
    StringUtils.EMPTY,
    stripHtml(featureDescription(feature)),
  ];
  return lines.join("\n");
}

function formatRacialTraitDefinition(trait: DdbRacialTrait, raceName: string): string {
  const d = trait.definition;
  return `${d.name} (${raceName})\n\n${stripHtml(d.description)}`;
}

function formatItemDefinition(item: DdbInventoryItem): string {
  const d = item.definition;
  const lines = [
    `${d.name} (${d.type}, ${d.rarity})`,
    `Weight: ${d.weight} lb`,
  ];
  lines.push(StringUtils.EMPTY, stripHtml(d.description));
  return lines.join("\n");
}

function searchDefinitions(char: DdbCharacter, query: string): DefinitionResult[] {
  const results: DefinitionResult[] = [];
  const q = query.toLowerCase();

  // Search spells
  const allSpells = getAllSpells(char);
  for (const spell of allSpells) {
    if (spell.definition.name.toLowerCase().includes(q)) {
      results.push({
        type: "Spell",
        name: spell.definition.name,
        source: `Level ${spell.definition.level} ${spell.definition.school}`,
        text: formatSpellDefinition(spell),
      });
    }
  }

  // Search feats
  for (const feat of char.feats ?? []) {
    if (feat.definition.name.toLowerCase().includes(q)) {
      results.push({
        type: "Feat",
        name: feat.definition.name,
        source: "Feat",
        text: formatFeatDefinition(feat),
      });
    }
  }

  // Search active class features (respecting level filter)
  const seen = new Set<string>();
  for (const cls of char.classes) {
    for (const feature of cls.classFeatures ?? []) {
      if (
        featureLevel(feature) <= cls.level &&
        featureName(feature).toLowerCase().includes(q) &&
        !seen.has(featureName(feature))
      ) {
        seen.add(featureName(feature));
        results.push({
          type: "Class Feature",
          name: featureName(feature),
          source: `${cls.definition.name} (Level ${featureLevel(feature)})`,
          text: formatClassFeatureDefinition(feature, cls.definition.name),
        });
      }
    }

    if (cls.subclassDefinition?.classFeatures) {
      for (const feature of cls.subclassDefinition.classFeatures) {
        if (
          featureLevel(feature) <= cls.level &&
          featureName(feature).toLowerCase().includes(q) &&
          !seen.has(featureName(feature))
        ) {
          seen.add(featureName(feature));
          results.push({
            type: "Subclass Feature",
            name: featureName(feature),
            source: `${cls.definition.name} / ${cls.subclassDefinition.name} (Level ${featureLevel(feature)})`,
            text: formatClassFeatureDefinition(feature, `${cls.definition.name} (${cls.subclassDefinition.name})`),
          });
        }
      }
    }
  }

  // Search racial traits
  for (const trait of char.race.racialTraits ?? []) {
    if (trait.definition.name.toLowerCase().includes(q)) {
      results.push({
        type: "Racial Trait",
        name: trait.definition.name,
        source: char.race.fullName,
        text: formatRacialTraitDefinition(trait, char.race.fullName),
      });
    }
  }

  // Search background feature
  const bgDef = char.background?.definition;
  if (bgDef?.featureName && bgDef.featureName.toLowerCase().includes(q)) {
    results.push({
      type: "Background Feature",
      name: bgDef.featureName,
      source: bgDef.name,
      text: `${bgDef.featureName} (${bgDef.name})\n\n${stripHtml(bgDef.featureDescription)}`,
    });
  }

  // Search equipped items
  for (const item of char.inventory.filter((i) => i.equipped)) {
    if (item.definition.name.toLowerCase().includes(q)) {
      results.push({
        type: "Item",
        name: item.definition.name,
        source: `${item.definition.type}, ${item.definition.rarity}`,
        text: formatItemDefinition(item),
      });
    }
  }

  return results;
}

// ============================================================================
// FULL CHARACTER SHEET (WITH ALL DEFINITIONS)
// ============================================================================

function formatCharacterFull(char: DdbCharacter): string {
  const sheet = formatCharacterSheet(char);
  const definitionSections: string[] = [];

  // Spells
  const allSpells = getAllSpells(char);
  const preparedSpells = allSpells.filter((s) => s.prepared || s.alwaysPrepared);
  if (preparedSpells.length > 0) {
    const spellDefs = preparedSpells
      .sort((a, b) => a.definition.level - b.definition.level || a.definition.name.localeCompare(b.definition.name))
      .map((s) => formatSpellDefinition(s));
    definitionSections.push(`\n=== Spell Definitions ===\n\n${spellDefs.join("\n\n---\n\n")}`);
  }

  // Feats
  if (char.feats && char.feats.length > 0) {
    const featDefs = char.feats.map((f) => formatFeatDefinition(f));
    definitionSections.push(`\n=== Feat Definitions ===\n\n${featDefs.join("\n\n---\n\n")}`);
  }

  // Active class features
  const activeFeatures = getActiveClassFeatures(char);
  if (activeFeatures.length > 0) {
    const featureDefs: string[] = [];
    const seen = new Set<string>();

    for (const cls of char.classes) {
      for (const feature of cls.classFeatures ?? []) {
        if (featureLevel(feature) <= cls.level && !seen.has(featureName(feature))) {
          seen.add(featureName(feature));
          featureDefs.push(formatClassFeatureDefinition(feature, cls.definition.name));
        }
      }

      if (cls.subclassDefinition?.classFeatures) {
        for (const feature of cls.subclassDefinition.classFeatures) {
          if (featureLevel(feature) <= cls.level && !seen.has(featureName(feature))) {
            seen.add(featureName(feature));
            featureDefs.push(
              formatClassFeatureDefinition(feature, `${cls.definition.name} (${cls.subclassDefinition.name})`)
            );
          }
        }
      }
    }

    if (featureDefs.length > 0) {
      definitionSections.push(`\n=== Class Feature Definitions ===\n\n${featureDefs.join("\n\n---\n\n")}`);
    }
  }

  // Racial traits
  const traits = char.race.racialTraits ?? [];
  if (traits.length > 0) {
    const traitDefs = traits.map((t) => formatRacialTraitDefinition(t, char.race.fullName));
    definitionSections.push(`\n=== Racial Trait Definitions ===\n\n${traitDefs.join("\n\n---\n\n")}`);
  }

  // Background feature
  const bgDef = char.background?.definition;
  if (bgDef?.featureName) {
    definitionSections.push(
      `\n=== Background Feature ===\n\n${bgDef.featureName} (${bgDef.name})\n\n${stripHtml(bgDef.featureDescription)}`
    );
  }

  // Equipped items with descriptions
  const equippedItems = char.inventory.filter((i) => i.equipped);
  if (equippedItems.length > 0) {
    const itemDefs = equippedItems.map((i) => formatItemDefinition(i));
    definitionSections.push(`\n=== Equipped Item Definitions ===\n\n${itemDefs.join("\n\n---\n\n")}`);
  }

  return sheet + "\n" + definitionSections.join("\n");
}

// ============================================================================
// BASIC CHARACTER FORMAT (original)
// ============================================================================

function formatCharacter(char: DdbCharacter): string {
  const sections = [
    `Name: ${char.name}`,
    `Race: ${char.race.fullName}`,
    `Class: ${formatClasses(char)}`,
    `Level: ${computeLevel(char)}`,
    `HP: ${formatHp(char)}`,
    `AC: ${calculateAc(char)}`,
    `\nAbility Scores:\n${formatAbilityScores(char)}`,
  ];

  if (char.campaign) {
    sections.push(`\nCampaign: ${char.campaign.name}`);
  }

  const spells = formatSpells(char);
  if (spells) sections.push(spells);

  const inventory = formatInventory(char);
  if (inventory) sections.push(inventory);

  return sections.join("\n");
}

async function findCharacterByName(client: DdbClient, name: string): Promise<number | null> {
  const campaignsResponse = await client.get<DdbCampaign[]>(
    ENDPOINTS.campaign.list(),
    "campaigns",
    300_000
  );

  // Fetch characters from each campaign using the new endpoint
  const allCharacters: Array<{ id: number; name: string }> = [];
  for (const campaign of campaignsResponse) {
    const characters = await client.get<DdbCampaignCharacter2[]>(
      ENDPOINTS.campaign.characters(campaign.id),
      `campaign:${campaign.id}:characters`,
      300_000
    );
    allCharacters.push(...characters.map((char) => ({
      id: char.id,
      name: char.name,
    })));
  }

  // 1. Exact match (case-insensitive)
  const exactMatch = allCharacters.find(
    (char) => char.name.toLowerCase() === name.toLowerCase()
  );
  if (exactMatch) return exactMatch.id;

  // 2. Substring match (case-insensitive)
  const lowerName = name.toLowerCase();
  const substringMatches = allCharacters.filter(
    (char) => char.name.toLowerCase().includes(lowerName)
  );
  if (substringMatches.length === 1) return substringMatches[0].id;

  // 3. Fuzzy match via Levenshtein distance — check full names and individual words
  const fuzzyResults: Array<{ id: number; name: string }> = [];
  for (const char of allCharacters) {
    const fullDistance = levenshteinDistance(lowerName, char.name.toLowerCase());
    if (fullDistance <= 3) {
      fuzzyResults.push(char);
      continue;
    }
    // Check individual words (e.g., "Throin" matches "Thorin" in "Thorin Ironforge")
    const words = char.name.split(/\s+/);
    for (const word of words) {
      if (levenshteinDistance(lowerName, word.toLowerCase()) <= 3) {
        fuzzyResults.push(char);
        break;
      }
    }
  }
  if (fuzzyResults.length === 1) return fuzzyResults[0].id;

  return null;
}

export async function getCharacter(
  client: DdbClient,
  params: GetCharacterParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  let characterId: number;

  if (params.characterId) {
    characterId = params.characterId;
  } else if (params.characterName) {
    const foundId = await findCharacterByName(client, params.characterName);
    if (!foundId) {
      return {
        content: [
          {
            type: "text",
            text: `Character "${params.characterName}" not found.`,
          },
        ],
      };
    }
    characterId = foundId;
  } else {
    return {
      content: [
        {
          type: "text",
          text: "Either characterId or characterName must be provided.",
        },
      ],
    };
  }

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(characterId),
    `character:${characterId}`,
    60_000
  );

  return {
    content: [
      {
        type: "text",
        text: formatCharacter(character),
      },
    ],
  };
}

export async function listCharacters(
  client: DdbClient
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const campaignsResponse = await client.get<DdbCampaign[]>(
    ENDPOINTS.campaign.list(),
    "campaigns",
    300_000
  );

  // Fetch characters from each campaign using the characters endpoint
  const allCharacters: Array<{ id: number; name: string; campaignName: string }> = [];
  for (const campaign of campaignsResponse) {
    const characters = await client.get<DdbCampaignCharacter2[]>(
      ENDPOINTS.campaign.characters(campaign.id),
      `campaign:${campaign.id}:characters`,
      300_000
    );
    allCharacters.push(...characters.map((char) => ({
      id: char.id,
      name: char.name,
      campaignName: campaign.name,
    })));
  }

  if (allCharacters.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No characters found.",
        },
      ],
    };
  }

  const characterDetails = await Promise.all(
    allCharacters.map(async (char) => {
      const details = await client.get<DdbCharacter>(
        ENDPOINTS.character.get(char.id),
        `character:${char.id}`,
        60_000
      );
      return {
        name: details.name,
        race: details.race.fullName,
        classes: formatClasses(details),
        level: computeLevel(details),
        campaign: char.campaignName,
      };
    })
  );

  const lines = characterDetails.map(
    (char) =>
      `${char.name} - ${char.race} ${char.classes} (Level ${char.level}) - ${char.campaign}`
  );

  return {
    content: [
      {
        type: "text",
        text: `Characters:\n${lines.join("\n")}`,
      },
    ],
  };
}

// ============================================================================
// NEW CHARACTER SHEET TOOLS
// ============================================================================

export async function getCharacterSheet(
  client: DdbClient,
  params: GetCharacterParams
): Promise<ToolResult> {
  const idOrError = await resolveCharacterId(client, params);
  if (typeof idOrError === "string") {
    return { content: [{ type: "text", text: idOrError }] };
  }

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(idOrError),
    `character:${idOrError}`,
    60_000
  );

  return { content: [{ type: "text", text: formatCharacterSheet(character) }] };
}

export async function getDefinition(
  client: DdbClient,
  params: GetDefinitionParams
): Promise<ToolResult> {
  const idOrError = await resolveCharacterId(client, params);
  if (typeof idOrError === "string") {
    return { content: [{ type: "text", text: idOrError }] };
  }

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(idOrError),
    `character:${idOrError}`,
    60_000
  );

  const results = searchDefinitions(character, params.name);

  if (results.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No definition found matching "${params.name}" on ${character.name}.`,
        },
      ],
    };
  }

  const formatted = results.map((r) => `[${r.type}] ${r.text}`).join("\n\n===\n\n");
  return { content: [{ type: "text", text: formatted }] };
}

export async function getCharacterFull(
  client: DdbClient,
  params: GetCharacterParams
): Promise<ToolResult> {
  const idOrError = await resolveCharacterId(client, params);
  if (typeof idOrError === "string") {
    return { content: [{ type: "text", text: idOrError }] };
  }

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(idOrError),
    `character:${idOrError}`,
    60_000
  );

  return { content: [{ type: "text", text: formatCharacterFull(character) }] };
}

class StringUtils {
  static readonly EMPTY = "";
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

interface UpdateHpParams {
  characterId: number;
  hpChange: number;
  tempHp?: number;
}

export async function updateHp(
  client: DdbClient,
  params: UpdateHpParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const character = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(params.characterId),
      `character:${params.characterId}`,
      60_000
    );

    const newRemovedHp = Math.max(
      0,
      Math.min(
        calculateMaxHp(character),
        character.removedHitPoints - params.hpChange
      )
    );

    const putBody: { removedHitPoints: number; temporaryHitPoints?: number } = {
      removedHitPoints: newRemovedHp,
    };

    if (params.tempHp !== undefined) {
      putBody.temporaryHitPoints = params.tempHp;
    }

    await client.put(
      ENDPOINTS.character.updateHp(params.characterId),
      putBody,
      [`character:${params.characterId}`]
    );

    const action = params.hpChange > 0 ? "Healed" : "Damaged";
    const amount = Math.abs(params.hpChange);
    const newCurrent = calculateMaxHp(character) - newRemovedHp;

    let text = `${action} ${character.name} for ${amount} HP. Current HP: ${newCurrent}/${calculateMaxHp(character)}`;
    if (params.tempHp !== undefined) {
      text += ` (${params.tempHp} temp HP)`;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Character HP updates are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

interface UpdateSpellSlotsParams {
  characterId: number;
  level: number;
  used: number;
}

export async function updateSpellSlots(
  client: DdbClient,
  params: UpdateSpellSlotsParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (params.level < 1 || params.level > 9) {
    return {
      content: [
        {
          type: "text",
          text: "Spell slot level must be between 1 and 9.",
        },
      ],
    };
  }

  if (params.used < 0) {
    return {
      content: [
        {
          type: "text",
          text: "Used spell slots cannot be negative.",
        },
      ],
    };
  }

  try {
    await client.put(
      ENDPOINTS.character.updateSpellSlots(params.characterId),
      { level: params.level, used: params.used },
      [`character:${params.characterId}`]
    );

    return {
      content: [
        {
          type: "text",
          text: `Updated level ${params.level} spell slots to ${params.used} used.`,
        },
      ],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Spell slot updates are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

interface UpdateDeathSavesParams {
  characterId: number;
  type: "success" | "failure";
  count: number;
}

export async function updateDeathSaves(
  client: DdbClient,
  params: UpdateDeathSavesParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!["success", "failure"].includes(params.type)) {
    return {
      content: [
        {
          type: "text",
          text: "Death save type must be 'success' or 'failure'.",
        },
      ],
    };
  }

  if (params.count < 0 || params.count > 3) {
    return {
      content: [
        {
          type: "text",
          text: "Death save count must be between 0 and 3.",
        },
      ],
    };
  }

  const body =
    params.type === "success"
      ? { successCount: params.count }
      : { failCount: params.count };

  try {
    await client.put(
      ENDPOINTS.character.updateDeathSaves(params.characterId),
      body,
      [`character:${params.characterId}`]
    );

    return {
      content: [
        {
          type: "text",
          text: `Updated death saves: ${params.count} ${params.type}${params.count === 1 ? StringUtils.EMPTY : "es"}.`,
        },
      ],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Death save updates are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

interface UpdateCurrencyParams {
  characterId: number;
  currency: "cp" | "sp" | "ep" | "gp" | "pp";
  amount?: number;
  delta?: number;
}

export async function updateCurrency(
  client: DdbClient,
  params: UpdateCurrencyParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const validCurrencies = ["cp", "sp", "ep", "gp", "pp"];
  if (!validCurrencies.includes(params.currency)) {
    return {
      content: [
        {
          type: "text",
          text: "Currency must be one of: cp, sp, ep, gp, pp.",
        },
      ],
    };
  }

  if (params.amount === undefined && params.delta === undefined) {
    return {
      content: [{ type: "text", text: "Either amount or delta must be provided." }],
    };
  }

  let finalAmount: number;
  let description: string;

  if (params.delta !== undefined) {
    // Delta mode: fetch current currency and add/subtract
    const character = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(params.characterId),
      `character:${params.characterId}`,
      60_000
    );
    const current = character.currencies[params.currency];
    finalAmount = Math.max(0, current + params.delta);

    if (params.delta > 0) {
      description = `Added ${params.delta} ${params.currency.toUpperCase()} (${current} → ${finalAmount})`;
    } else {
      description = `Spent ${Math.abs(params.delta)} ${params.currency.toUpperCase()} (${current} → ${finalAmount})`;
    }
  } else {
    finalAmount = params.amount!;
    description = `Set ${params.currency.toUpperCase()} to ${finalAmount}`;
  }

  try {
    await client.put(
      ENDPOINTS.character.updateCurrency(params.characterId),
      { [params.currency]: finalAmount },
      [`character:${params.characterId}`]
    );

    return {
      content: [{ type: "text", text: `${description}.` }],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Currency updates are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

interface UpdatePactMagicParams {
  characterId: number;
  used: number;
}

interface LongRestParams {
  characterId: number;
}

interface ShortRestParams {
  characterId: number;
}

interface UseAbilityParams {
  characterId: number;
  abilityName: string;
  uses?: number;
}

export async function updatePactMagic(
  client: DdbClient,
  params: UpdatePactMagicParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (params.used < 0) {
    return {
      content: [
        {
          type: "text",
          text: "Used pact magic slots cannot be negative.",
        },
      ],
    };
  }

  try {
    await client.put(
      ENDPOINTS.character.updatePactMagic(params.characterId),
      { used: params.used },
      [`character:${params.characterId}`]
    );

    return {
      content: [
        {
          type: "text",
          text: `Updated pact magic slots to ${params.used} used.`,
        },
      ],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Pact magic updates are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

export async function longRest(
  client: DdbClient,
  params: LongRestParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const character = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(params.characterId),
      `character:${params.characterId}`,
      60_000
    );

    const summary: string[] = [`Long rest completed for ${character.name}:`];
    const maxHp = calculateMaxHp(character);

    // Reset HP
    await client.put(
      ENDPOINTS.character.updateHp(params.characterId),
      { removedHitPoints: 0, temporaryHitPoints: 0 },
      [`character:${params.characterId}`]
    );
    summary.push(`\u2022 HP restored to full (${maxHp}/${maxHp})`);

    // Reset spell slots (levels 1-9)
    const FULL_CASTERS = ["Wizard", "Sorcerer", "Bard", "Cleric", "Druid"];
    const HALF_CASTERS = ["Paladin", "Ranger", "Artificer"];
    const hasSpellSlots = character.classes.some(cls =>
      FULL_CASTERS.includes(cls.definition.name) || HALF_CASTERS.includes(cls.definition.name)
    );
    if (hasSpellSlots) {
      for (let level = 1; level <= 9; level++) {
        await client.put(
          ENDPOINTS.character.updateSpellSlots(params.characterId),
          { level, used: 0 },
          [`character:${params.characterId}`]
        );
      }
      summary.push("\u2022 Spell slots reset (levels 1-9)");
    }

    // Reset pact magic
    const hasWarlock = character.classes.some(cls => cls.definition.name === "Warlock");
    if (hasWarlock) {
      await client.put(
        ENDPOINTS.character.updatePactMagic(params.characterId),
        { used: 0 },
        [`character:${params.characterId}`]
      );
      summary.push("\u2022 Pact magic reset");
    }

    // Reset long-rest abilities
    const longRestAbilities: string[] = [];
    const actions = character.actions ?? {};
    for (const list of Object.values(actions)) {
      if (!Array.isArray(list)) continue;
      for (const action of list) {
        if (action.limitedUse && action.limitedUse.resetType === 1) {
          await client.put(
            ENDPOINTS.character.updateLimitedUse(),
            {
              characterId: params.characterId,
              id: String(action.id),
              entityTypeId: String(action.entityTypeId),
              uses: 0,
            },
            [`character:${params.characterId}`]
          );
          longRestAbilities.push(action.name);
        }
      }
    }
    if (longRestAbilities.length > 0) {
      summary.push(`\u2022 Long-rest abilities reset: ${longRestAbilities.join(", ")}`);
    }

    return {
      content: [
        {
          type: "text",
          text: summary.join("\n"),
        },
      ],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Long rest operations are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

export async function shortRest(
  client: DdbClient,
  params: ShortRestParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const character = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(params.characterId),
      `character:${params.characterId}`,
      60_000
    );

    const summary: string[] = [`Short rest completed for ${character.name}:`];

    // Reset pact magic
    const hasWarlock = character.classes.some(cls => cls.definition.name === "Warlock");
    if (hasWarlock) {
      await client.put(
        ENDPOINTS.character.updatePactMagic(params.characterId),
        { used: 0 },
        [`character:${params.characterId}`]
      );
      summary.push("\u2022 Pact magic reset");
    }

    // Reset short-rest abilities
    const shortRestAbilities: string[] = [];
    const actions = character.actions ?? {};
    for (const list of Object.values(actions)) {
      if (!Array.isArray(list)) continue;
      for (const action of list) {
        if (action.limitedUse && action.limitedUse.resetType === 2) {
          await client.put(
            ENDPOINTS.character.updateLimitedUse(),
            {
              characterId: params.characterId,
              id: String(action.id),
              entityTypeId: String(action.entityTypeId),
              uses: 0,
            },
            [`character:${params.characterId}`]
          );
          shortRestAbilities.push(action.name);
        }
      }
    }
    if (shortRestAbilities.length > 0) {
      summary.push(`\u2022 Short-rest abilities reset: ${shortRestAbilities.join(", ")}`);
    }

    // Note about hit dice
    summary.push("\u2022 Hit dice spending not available via API");

    return {
      content: [
        {
          type: "text",
          text: summary.join("\n"),
        },
      ],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Short rest operations are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

interface CastSpellParams {
  characterId: number;
  spellName: string;
  level?: number;
}

export async function castSpell(
  client: DdbClient,
  params: CastSpellParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!params.spellName || params.spellName.trim() === StringUtils.EMPTY) {
    return {
      content: [{ type: "text", text: "Spell name cannot be empty." }],
    };
  }

  try {
    const character = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(params.characterId),
      `character:${params.characterId}`,
      60_000
    );

    // Find the spell in character's spell lists
    const allSpells = getAllSpells(character);
    const spellNameLower = params.spellName.toLowerCase();
    const spell = allSpells.find(
      (s) => s.definition.name.toLowerCase() === spellNameLower
    );

    if (!spell) {
      // Try fuzzy match
      const spellNames = allSpells.map(s => s.definition.name);
      const matches = fuzzyMatch(params.spellName, spellNames, 3);
      if (matches.length > 0) {
        return {
          content: [{
            type: "text",
            text: `Spell "${params.spellName}" not found. Did you mean: ${matches.join(", ")}?`,
          }],
        };
      }
      return {
        content: [{ type: "text", text: `Spell "${params.spellName}" not found on this character.` }],
      };
    }

    const spellLevel = params.level ?? spell.definition.level;

    // Cantrips don't use spell slots
    if (spellLevel === 0) {
      return {
        content: [{ type: "text", text: `Cast ${spell.definition.name} (cantrip) — no spell slot required.` }],
      };
    }

    // Determine if warlock using pact magic
    const isWarlock = character.classes.some(cls => cls.definition.name === "Warlock");
    const hasPactMagic = character.pactMagic && character.pactMagic.available > 0;

    if (isWarlock && hasPactMagic && spellLevel <= character.pactMagic!.level) {
      // Use pact magic slot
      const newUsed = character.pactMagic!.used + 1;
      if (newUsed > character.pactMagic!.available) {
        return {
          content: [{ type: "text", text: `No pact magic slots remaining (${character.pactMagic!.used}/${character.pactMagic!.available} used).` }],
        };
      }
      await client.put(
        ENDPOINTS.character.updatePactMagic(params.characterId),
        { used: newUsed },
        [`character:${params.characterId}`]
      );
      return {
        content: [{
          type: "text",
          text: `Cast ${spell.definition.name} using pact magic (level ${character.pactMagic!.level}). Pact slots: ${newUsed}/${character.pactMagic!.available} used.`,
        }],
      };
    }

    // Use regular spell slot
    const slotData = character.spellSlots?.find(s => s.level === spellLevel);
    if (slotData) {
      const newUsed = slotData.used + 1;
      if (newUsed > slotData.available) {
        return {
          content: [{ type: "text", text: `No level ${spellLevel} spell slots remaining (${slotData.used}/${slotData.available} used).` }],
        };
      }
      await client.put(
        ENDPOINTS.character.updateSpellSlots(params.characterId),
        { level: spellLevel, used: newUsed },
        [`character:${params.characterId}`]
      );
      return {
        content: [{
          type: "text",
          text: `Cast ${spell.definition.name} at level ${spellLevel}. Level ${spellLevel} slots: ${newUsed}/${slotData.available} used.`,
        }],
      };
    }

    // No slot data available — just update the slot count
    await client.put(
      ENDPOINTS.character.updateSpellSlots(params.characterId),
      { level: spellLevel, used: 1 },
      [`character:${params.characterId}`]
    );
    return {
      content: [{
        type: "text",
        text: `Cast ${spell.definition.name} at level ${spellLevel}. Updated level ${spellLevel} spell slot usage.`,
      }],
    };
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️  Spell casting operations are temporarily unavailable.\n\nD&D Beyond has deprecated the v5 character write API endpoints. This feature cannot be used until D&D Beyond provides replacement endpoints.\n\nCharacter ID: ${params.characterId}\nRead operations still work normally.`,
          },
        ],
      };
    }
    throw error;
  }
}

export async function useAbility(
  client: DdbClient,
  params: UseAbilityParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (!params.abilityName || params.abilityName.trim() === StringUtils.EMPTY) {
    return {
      content: [{ type: "text", text: "Ability name cannot be empty." }],
    };
  }

  // Fetch character data to find the action's id and entityTypeId
  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `character:${params.characterId}`,
    60_000
  );

  // Collect all actions into a flat list
  const actions = character.actions ?? {};
  const allActions: DdbAction[] = [];
  for (const list of Object.values(actions)) {
    if (Array.isArray(list)) allActions.push(...list);
  }

  // Try exact match first (case-insensitive)
  let foundAction: DdbAction | null = allActions.find(
    (a) => a.name?.toLowerCase() === params.abilityName.toLowerCase()
  ) ?? null;

  // Fall back to fuzzy matching
  if (!foundAction) {
    const actionNames = allActions.filter(a => a.name).map(a => a.name);
    const matches = fuzzyMatch(params.abilityName, actionNames, 3);

    if (matches.length === 1) {
      // Single close match — use it
      foundAction = allActions.find(a => a.name === matches[0]) ?? null;
    } else if (matches.length > 1) {
      return {
        content: [{
          type: "text",
          text: `Ability "${params.abilityName}" not found. Did you mean one of: ${matches.join(", ")}?`,
        }],
      };
    }
  }

  if (!foundAction) {
    const actionNames = allActions.filter(a => a.name).map(a => a.name);
    const available = actionNames.length > 0 ? `\nAvailable abilities: ${actionNames.join(", ")}` : "";
    return {
      content: [{
        type: "text",
        text: `Ability "${params.abilityName}" not found in character actions.${available}`,
      }],
    };
  }

  if (!foundAction.limitedUse) {
    return {
      content: [
        {
          type: "text",
          text: `"${foundAction.name}" does not have limited uses.`,
        },
      ],
    };
  }

  const currentUsed = foundAction.limitedUse.numberUsed;
  const maxUses = foundAction.limitedUse.maxUses;
  const newUses = params.uses ?? currentUsed + 1;

  if (newUses < 0 || newUses > maxUses) {
    return {
      content: [
        {
          type: "text",
          text: `Uses must be between 0 and ${maxUses}. Currently ${currentUsed}/${maxUses} used.`,
        },
      ],
    };
  }

  // D&D Beyond expects id and entityTypeId as strings, characterId in the body
  await client.put(
    ENDPOINTS.character.updateLimitedUse(),
    {
      characterId: params.characterId,
      id: String(foundAction.id),
      entityTypeId: String(foundAction.entityTypeId),
      uses: newUses,
    },
    [`character:${params.characterId}`]
  );

  return {
    content: [
      {
        type: "text",
        text: `${foundAction.name}: ${newUses}/${maxUses} uses expended.`,
      },
    ],
  };
}
