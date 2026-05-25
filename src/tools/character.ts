import { createHash } from "node:crypto";
import type { DdbClient } from "../api/client.js";
import { DDB_CHARACTER_SERVICE, ENDPOINTS } from "../api/endpoints.js";
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
  detail?: "summary" | "sheet" | "full";
}

interface GetDefinitionParams {
  characterId?: number;
  characterName?: string;
  name: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

type ExperimentalDdbMethod = "GET" | "POST" | "PUT" | "DELETE";

const EXPERIMENTAL_CHARACTER_ENDPOINTS: Record<string, { method: ExperimentalDdbMethod; path: string; note?: string }> = {
  party_inventory: { method: "GET", path: "party/inventory/{campaignId}" },
  campaign_setting: { method: "PUT", path: "campaign-setting" },
  character_source_categories: { method: "PUT", path: "character/source-categories" },
  custom_background: { method: "PUT", path: "custom/background" },
  has_custom_background: { method: "PUT", path: "configuration/has-custom-background" },
  custom_value: { method: "PUT", path: "custom/value" },
  delete_custom_value: { method: "DELETE", path: "custom/value" },
  delete_custom_entity_values: { method: "DELETE", path: "custom/entity/values" },
  create_custom_proficiency: { method: "POST", path: "custom/proficiency" },
  update_custom_proficiency: { method: "PUT", path: "custom/proficiency" },
  delete_custom_proficiency: { method: "DELETE", path: "custom/proficiency" },
  create_custom_movement: { method: "POST", path: "custom/movement" },
  update_custom_movement: { method: "PUT", path: "custom/movement" },
  delete_custom_movement: { method: "DELETE", path: "custom/movement" },
  create_custom_action: { method: "POST", path: "custom/action" },
  update_custom_action: { method: "PUT", path: "custom/action" },
  delete_custom_action: { method: "DELETE", path: "custom/action" },
  create_custom_sense: { method: "POST", path: "custom/sense" },
  update_custom_sense: { method: "PUT", path: "custom/sense" },
  delete_custom_sense: { method: "DELETE", path: "custom/sense" },
  create_custom_defense_adjustment: { method: "POST", path: "custom/defense-adjustment" },
  update_custom_defense_adjustment: { method: "PUT", path: "custom/defense-adjustment" },
  delete_custom_defense_adjustment: { method: "DELETE", path: "custom/defense-adjustment" },
  set_backdrop: { method: "PUT", path: "decoration/backdrop" },
  set_frame: { method: "PUT", path: "decoration/frame" },
  set_portrait: { method: "PUT", path: "decoration/portrait" },
  create_custom_portrait: { method: "POST", path: "decoration/portrait/custom" },
  set_theme_color: { method: "PUT", path: "decoration/theme-color" },
  set_social_image: { method: "PUT", path: "decoration/social-image" },
  get_roll_result_groups: { method: "GET", path: "roll-result-groups" },
  create_roll_result_group: { method: "POST", path: "roll-result-group" },
  update_roll_result: { method: "PUT", path: "roll-result" },
  update_roll_result_group: { method: "PUT", path: "roll-result-group" },
  update_roll_result_group_order: { method: "PUT", path: "roll-result-group/order" },
  delete_roll_result_group: { method: "DELETE", path: "roll-result-group" },
  delete_roll_result_groups: { method: "DELETE", path: "roll-result-groups" },
  create_ad_hoc_feat: { method: "POST", path: "feat/ad-hoc" },
  delete_ad_hoc_feat: { method: "DELETE", path: "feat/ad-hoc" },
  add_feat_from_entity: { method: "POST", path: "feat/from-entity" },
  get_infusion_items: { method: "GET", path: "infusion/items" },
  add_infusion_item: { method: "POST", path: "infusion/item" },
  delete_infusion_item: { method: "DELETE", path: "infusion/item" },
  get_known_infusions: { method: "GET", path: "known-infusions" },
  create_known_infusion: { method: "POST", path: "known-infusion" },
  update_known_infusion: { method: "PUT", path: "known-infusion" },
  delete_known_infusion: { method: "DELETE", path: "known-infusion" },
  add_optional_class_feature: { method: "POST", path: "optional-feature/class-feature" },
  update_optional_class_feature: { method: "PUT", path: "optional-feature/class-feature" },
  delete_optional_class_feature: { method: "DELETE", path: "optional-feature/class-feature" },
  delete_optional_class_features: { method: "DELETE", path: "optional-feature/class-feature/collection" },
  add_optional_racial_trait: { method: "POST", path: "optional-feature/racial-trait" },
  update_optional_racial_trait: { method: "PUT", path: "optional-feature/racial-trait" },
  delete_optional_racial_trait: { method: "DELETE", path: "optional-feature/racial-trait" },
  delete_optional_racial_traits: { method: "DELETE", path: "optional-feature/racial-trait/collection" },
  generate_pdf: { method: "POST", path: "pdf" },
  get_premade: { method: "GET", path: "premade/{characterId}" },
  create_premade: { method: "POST", path: "premade" },
  update_premade: { method: "PUT", path: "premade" },
  delete_premade: { method: "DELETE", path: "premade" },
  get_rule_data: { method: "GET", path: "rule-data" },
  get_share_url: { method: "GET", path: "share/url" },
  get_vehicles: { method: "GET", path: "vehicles" },
  create_vehicle: { method: "POST", path: "vehicle" },
  update_vehicle: { method: "PUT", path: "vehicle" },
  delete_vehicle: { method: "DELETE", path: "vehicle" },
  set_vehicle_fuel: { method: "PUT", path: "vehicle/fuel" },
  create_vehicle_condition: { method: "POST", path: "vehicle/condition" },
  update_vehicle_condition: { method: "PUT", path: "vehicle/condition" },
  delete_vehicle_condition: { method: "DELETE", path: "vehicle/condition" },
  get_vehicle_components: { method: "GET", path: "vehicle/components" },
  create_vehicle_component: { method: "POST", path: "vehicle/component" },
  update_vehicle_component: { method: "PUT", path: "vehicle/component" },
  update_vehicle_component_hp: { method: "PUT", path: "vehicle/component/hp" },
  set_featureflag: { method: "POST", path: "featureflag", note: "account/session scoped; use with care" },
};



function interpolateExperimentalPath(path: string, body: Record<string, unknown>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = body[key];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(String(value));
  });
}

function appendQuery(url: string, body: Record<string, unknown>, excludeKeys: ReadonlySet<string> = new Set()): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (excludeKeys.has(key) || value === undefined || value === null || key === "body") continue;
    if (typeof value === "object") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
}

function getPathParamNames(path: string): Set<string> {
  return new Set([...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]));
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`).join(",")}}`;
}

function hashedCacheKey(prefix: string, value: unknown): string {
  return `${prefix}:${createHash("sha256").update(stableJsonStringify(value)).digest("hex").slice(0, 16)}`;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export async function listExperimentalDdbEndpoints(): Promise<ToolResult> {
  const lines = ["# Experimental D&D Beyond character endpoints\n"];
  for (const [key, endpoint] of Object.entries(EXPERIMENTAL_CHARACTER_ENDPOINTS).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${key}: ${endpoint.method} /character/v5/${endpoint.path}${endpoint.note ? ` — ${endpoint.note}` : ""}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export async function callExperimentalDdbEndpoint(
  client: DdbClient,
  params: { endpoint: string; body?: Record<string, unknown> }
): Promise<ToolResult> {
  const endpoint = EXPERIMENTAL_CHARACTER_ENDPOINTS[params.endpoint];
  if (!endpoint) {
    return { content: [{ type: "text", text: `Unknown experimental endpoint "${params.endpoint}". Use list_experimental_ddb_endpoints.` }] };
  }

  const body = params.body ?? {};

  try {
    const path = interpolateExperimentalPath(endpoint.path, body);
    let url = `${DDB_CHARACTER_SERVICE}/character/v5/${path}`;
    let result: unknown;

    if (endpoint.method === "GET") {
      url = appendQuery(url, body, getPathParamNames(endpoint.path));
      result = await client.get<unknown>(url, hashedCacheKey(`experimental:${params.endpoint}`, body), 0);
    } else if (endpoint.method === "POST") {
      result = await client.post<unknown>(url, body, typeof body.characterId === "number" ? [`character:${body.characterId}`] : undefined);
    } else if (endpoint.method === "PUT") {
      result = await client.put<unknown>(url, body, typeof body.characterId === "number" ? [`character:${body.characterId}`] : undefined);
    } else {
      result = await client.delete<unknown>(url, body, typeof body.characterId === "number" ? [`character:${body.characterId}`] : undefined);
    }

    const rendered = typeof result === "string" ? result : safeJsonStringify(result);
    return { content: [{ type: "text", text: `Called ${endpoint.method} /character/v5/${endpoint.path}\n\n${rendered ?? ""}`.slice(0, 12_000) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Failed to call ${endpoint.method} /character/v5/${endpoint.path}: ${message}` }] };
  }
}

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
  const pactSlots = Array.isArray(char.pactMagic)
    ? char.pactMagic.filter((slot) => slot.available > 0)
    : char.pactMagic && char.pactMagic.available > 0 ? [char.pactMagic] : [];
  for (const pact of pactSlots) {
    const filled = "\u25CF".repeat(pact.available - pact.used);
    const empty = "\u25CB".repeat(pact.used);
    result += `\nPact Magic (Level ${pact.level}): ${filled}${empty} (${pact.used}/${pact.available} used)`;
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
  const idOrError = await resolveCharacterId(client, params);
  if (typeof idOrError === "string") {
    return { content: [{ type: "text", text: idOrError }] };
  }

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(idOrError),
    `character:${idOrError}`,
    60_000
  );

  const detail = params.detail ?? "sheet";
  let text: string;
  switch (detail) {
    case "summary":
      text = formatCharacter(character);
      break;
    case "full":
      text = formatCharacterFull(character);
      break;
    case "sheet":
    default:
      text = formatCharacterSheet(character);
      break;
  }

  return { content: [{ type: "text", text }] };
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
// DEFINITION LOOKUP TOOL
// ============================================================================

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


class StringUtils {
  static readonly EMPTY = "";
}

type CharacterServiceOperation = "get" | "post" | "put" | "delete";
type CharacterPayload = Record<string, unknown>;

function characterServiceUrl(path: string): string {
  return `${DDB_CHARACTER_SERVICE}/character/v5/${path}`;
}

function invalidateFor(payload: CharacterPayload): string[] | undefined {
  return typeof payload.characterId === "number" ? [`character:${payload.characterId}`] : undefined;
}

function flattenPayload(payload: CharacterPayload): CharacterPayload {
  const nested = payload.payload;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return payload;
  const { payload: _payload, ...rest } = payload;
  return { ...(nested as CharacterPayload), ...rest };
}

async function characterServiceRequest(
  client: DdbClient,
  method: CharacterServiceOperation,
  path: string,
  payload: CharacterPayload,
  cacheKeyPrefix: string
): Promise<unknown> {
  payload = flattenPayload(payload);
  const url = characterServiceUrl(path);
  if (method === "get") {
    return client.get<unknown>(appendQuery(url, payload), `${cacheKeyPrefix}:${safeJsonStringify(payload)}`, 0);
  }
  if (method === "post") return client.post<unknown>(url, payload, invalidateFor(payload));
  if (method === "put") return client.put<unknown>(url, payload, invalidateFor(payload));
  return client.delete<unknown>(url, payload, invalidateFor(payload));
}

function requiredPayload(params: CharacterPayload, keys: string[]): string | null {
  const missing = keys.filter((key) => params[key] === undefined || params[key] === null || params[key] === "");
  return missing.length ? `Missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.` : null;
}

function renderMutationResult(verb: string, subject: string, payload: CharacterPayload, result?: unknown): ToolResult {
  const character = typeof payload.characterId === "number" ? ` for character ${payload.characterId}` : "";
  let suffix = StringUtils.EMPTY;
  if (result !== undefined && result !== null && result !== "") {
    const rendered = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    suffix = `\n\n${rendered.slice(0, 6_000)}`;
  }
  return { content: [{ type: "text", text: `${verb} ${subject}${character}.${suffix}` }] };
}

export async function setCharacterSourceCategories(client: DdbClient, params: { characterId: number; activeSourceCategories: number[] }): Promise<ToolResult> {
  const missing = requiredPayload(params as unknown as CharacterPayload, ["characterId", "activeSourceCategories"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "put", "character/source-categories", params as unknown as CharacterPayload, "character-source-categories");
  return renderMutationResult("Updated", "source categories", params as unknown as CharacterPayload);
}

export async function setCharacterCampaignSetting(client: DdbClient, params: { characterId: number; campaignSettingId?: number | null; enabledSourceIds?: number[]; [key: string]: unknown }): Promise<ToolResult> {
  const missing = requiredPayload(params, ["characterId"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "put", "campaign-setting", params, "character-campaign-setting");
  return renderMutationResult("Updated", "campaign setting", params);
}

export async function setCustomBackground(client: DdbClient, params: { characterId: number; name?: string | null; description?: string | null; featuresBackgroundDefinitionId?: number | null; characteristicsBackgroundDefinitionId?: number | null; backgroundType?: number | null; [key: string]: unknown }): Promise<ToolResult> {
  const missing = requiredPayload(params, ["characterId"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "put", "custom/background", params, "custom-background");
  return renderMutationResult("Updated", "custom background", params);
}

export async function setHasCustomBackground(client: DdbClient, params: { characterId: number; hasCustomBackground: boolean }): Promise<ToolResult> {
  const missing = requiredPayload(params as unknown as CharacterPayload, ["characterId", "hasCustomBackground"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "put", "configuration/has-custom-background", params as unknown as CharacterPayload, "has-custom-background");
  return renderMutationResult("Updated", "custom-background flag", params as unknown as CharacterPayload);
}

export async function setCustomValue(client: DdbClient, params: { characterId: number; typeId: number; value: unknown; notes?: string | null; valueId?: number | string | null; valueTypeId?: number | string | null; contextId?: number | string | null; contextTypeId?: number | string | null; partyId?: number | null }): Promise<ToolResult> {
  const missing = requiredPayload(params as CharacterPayload, ["characterId", "typeId", "value"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "put", "custom/value", params as CharacterPayload, "custom-value");
  return renderMutationResult("Updated", "custom value", params as CharacterPayload);
}

export async function deleteCustomValue(client: DdbClient, params: { characterId: number; typeId: number; valueId?: number | string | null; valueTypeId?: number | string | null; contextId?: number | string | null; contextTypeId?: number | string | null; partyId?: number | null }): Promise<ToolResult> {
  const missing = requiredPayload(params as CharacterPayload, ["characterId", "typeId"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "delete", "custom/value", params as CharacterPayload, "delete-custom-value");
  return renderMutationResult("Deleted", "custom value", params as CharacterPayload);
}

export async function deleteCustomEntityValues(client: DdbClient, params: { characterId: number; valueId?: number | string | null; valueTypeId?: number | string | null; contextId?: number | string | null; contextTypeId?: number | string | null; partyId?: number | null }): Promise<ToolResult> {
  const missing = requiredPayload(params as CharacterPayload, ["characterId"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  await characterServiceRequest(client, "delete", "custom/entity/values", params as CharacterPayload, "delete-custom-entity-values");
  return renderMutationResult("Deleted", "custom entity values", params as CharacterPayload);
}

export async function manageCustomProficiency(client: DdbClient, params: { operation: "create" | "update" | "delete"; characterId: number; id?: number; name?: string; type?: number; [key: string]: unknown }): Promise<ToolResult> {
  const method = params.operation === "create" ? "post" : params.operation === "update" ? "put" : "delete";
  const missing = requiredPayload(params, params.operation === "create" ? ["characterId", "name", "type"] : ["characterId", "id"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, "custom/proficiency", payload, "custom-proficiency");
  return renderMutationResult(params.operation === "delete" ? "Deleted" : params.operation === "create" ? "Created" : "Updated", "custom proficiency", payload, result);
}

export async function manageCustomMovement(client: DdbClient, params: { operation: "create" | "update" | "delete"; characterId: number; movementId: number; distance?: number | null; source?: string | null }): Promise<ToolResult> {
  const method = params.operation === "create" ? "post" : params.operation === "update" ? "put" : "delete";
  const missing = requiredPayload(params as CharacterPayload, params.operation === "delete" ? ["characterId", "movementId"] : ["characterId", "movementId", "distance"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, "custom/movement", payload as CharacterPayload, "custom-movement");
  return renderMutationResult(params.operation === "delete" ? "Deleted" : params.operation === "create" ? "Created" : "Updated", "custom movement", payload as CharacterPayload, result);
}

export async function manageCustomSense(client: DdbClient, params: { operation: "create" | "update" | "delete"; characterId: number; senseId: number; distance?: number | null; source?: string | null }): Promise<ToolResult> {
  const method = params.operation === "create" ? "post" : params.operation === "update" ? "put" : "delete";
  const missing = requiredPayload(params as CharacterPayload, params.operation === "delete" ? ["characterId", "senseId"] : ["characterId", "senseId", "distance"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, "custom/sense", payload as CharacterPayload, "custom-sense");
  return renderMutationResult(params.operation === "delete" ? "Deleted" : params.operation === "create" ? "Created" : "Updated", "custom sense", payload as CharacterPayload, result);
}

export async function manageCustomDefenseAdjustment(client: DdbClient, params: { operation: "create" | "update" | "delete"; characterId: number; type: number; adjustmentId: number; source?: string | null; [key: string]: unknown }): Promise<ToolResult> {
  const method = params.operation === "create" ? "post" : params.operation === "update" ? "put" : "delete";
  const missing = requiredPayload(params, ["characterId", "type", "adjustmentId"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, "custom/defense-adjustment", payload, "custom-defense-adjustment");
  return renderMutationResult(params.operation === "delete" ? "Deleted" : params.operation === "create" ? "Created" : "Updated", "custom defense adjustment", payload, result);
}

export async function manageCustomAction(client: DdbClient, params: { operation: "create" | "update" | "delete"; characterId: number; id?: number | string; name?: string; actionType?: number; [key: string]: unknown }): Promise<ToolResult> {
  const method = params.operation === "create" ? "post" : params.operation === "update" ? "put" : "delete";
  const missing = requiredPayload(params, params.operation === "create" ? ["characterId", "name", "actionType"] : ["characterId", "id"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, "custom/action", payload, "custom-action");
  return renderMutationResult(params.operation === "delete" ? "Deleted" : params.operation === "create" ? "Created" : "Updated", "custom action", payload, result);
}

export async function setCharacterDecoration(client: DdbClient, params: { characterId: number; kind: "backdrop" | "frame" | "portrait" | "customPortrait" | "themeColor" | "socialImage"; [key: string]: unknown }): Promise<ToolResult> {
  const pathByKind = { backdrop: "decoration/backdrop", frame: "decoration/frame", portrait: "decoration/portrait", customPortrait: "decoration/portrait/custom", themeColor: "decoration/theme-color", socialImage: "decoration/social-image" } as const;
  const method: CharacterServiceOperation = params.kind === "customPortrait" ? "post" : "put";
  const missing = requiredPayload(params, ["characterId", "kind"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { kind, ...payload } = params;
  const result = await characterServiceRequest(client, method, pathByKind[kind], payload, `decoration-${kind}`);
  return renderMutationResult("Updated", `${kind} decoration`, payload, result);
}

export async function manageRollResult(client: DdbClient, params: { operation: "listGroups" | "createGroup" | "updateGroup" | "updateGroupOrder" | "deleteGroup" | "deleteGroups" | "updateResult"; characterId: number; [key: string]: unknown }): Promise<ToolResult> {
  const table = {
    listGroups: ["get", "roll-result-groups", "Listed"],
    createGroup: ["post", "roll-result-group", "Created"],
    updateGroup: ["put", "roll-result-group", "Updated"],
    updateGroupOrder: ["put", "roll-result-group/order", "Updated"],
    deleteGroup: ["delete", "roll-result-group", "Deleted"],
    deleteGroups: ["delete", "roll-result-groups", "Deleted"],
    updateResult: ["put", "roll-result", "Updated"],
  } as const;
  const missing = requiredPayload(params, ["characterId", "operation"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const [method, path, verb] = table[params.operation];
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, path, payload, `roll-${params.operation}`);
  return renderMutationResult(verb, "roll-result data", payload, result);
}

export async function manageCharacterFeat(client: DdbClient, params: { operation: "createAdHoc" | "deleteAdHoc" | "addFromEntity"; characterId: number; [key: string]: unknown }): Promise<ToolResult> {
  const table = { createAdHoc: ["post", "feat/ad-hoc", "Created"], deleteAdHoc: ["delete", "feat/ad-hoc", "Deleted"], addFromEntity: ["post", "feat/from-entity", "Added"] } as const;
  const missing = requiredPayload(params, ["characterId", "operation"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const [method, path, verb] = table[params.operation];
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, path, payload, `feat-${params.operation}`);
  return renderMutationResult(verb, "feat data", payload, result);
}

export async function manageCharacterInfusion(client: DdbClient, params: { operation: "listItems" | "addItem" | "deleteItem" | "listKnown" | "createKnown" | "updateKnown" | "deleteKnown"; characterId: number; [key: string]: unknown }): Promise<ToolResult> {
  const table = {
    listItems: ["get", "infusion/items", "Listed"], addItem: ["post", "infusion/item", "Added"], deleteItem: ["delete", "infusion/item", "Deleted"],
    listKnown: ["get", "known-infusions", "Listed"], createKnown: ["post", "known-infusion", "Created"], updateKnown: ["put", "known-infusion", "Updated"], deleteKnown: ["delete", "known-infusion", "Deleted"],
  } as const;
  const missing = requiredPayload(params, ["characterId", "operation"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const [method, path, verb] = table[params.operation];
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, path, payload, `infusion-${params.operation}`);
  return renderMutationResult(verb, "infusion data", payload, result);
}

export async function manageOptionalFeature(client: DdbClient, params: { operation: "addClassFeature" | "updateClassFeature" | "deleteClassFeature" | "deleteClassFeatureCollection" | "addRacialTrait" | "updateRacialTrait" | "deleteRacialTrait" | "deleteRacialTraitCollection"; characterId: number; [key: string]: unknown }): Promise<ToolResult> {
  const table = {
    addClassFeature: ["post", "optional-feature/class-feature", "Added"], updateClassFeature: ["put", "optional-feature/class-feature", "Updated"], deleteClassFeature: ["delete", "optional-feature/class-feature", "Deleted"], deleteClassFeatureCollection: ["delete", "optional-feature/class-feature/collection", "Deleted"],
    addRacialTrait: ["post", "optional-feature/racial-trait", "Added"], updateRacialTrait: ["put", "optional-feature/racial-trait", "Updated"], deleteRacialTrait: ["delete", "optional-feature/racial-trait", "Deleted"], deleteRacialTraitCollection: ["delete", "optional-feature/racial-trait/collection", "Deleted"],
  } as const;
  const missing = requiredPayload(params, ["characterId", "operation"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const [method, path, verb] = table[params.operation];
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, path, payload, `optional-feature-${params.operation}`);
  return renderMutationResult(verb, "optional feature", payload, result);
}

export async function managePremadeInfo(client: DdbClient, params: { operation: "get" | "create" | "update" | "delete"; characterId: number; [key: string]: unknown }): Promise<ToolResult> {
  const table = { get: ["get", "premade/{characterId}", "Loaded"], create: ["post", "premade", "Created"], update: ["put", "premade", "Updated"], delete: ["delete", "premade", "Deleted"] } as const;
  const missing = requiredPayload(params, ["characterId", "operation"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const [method, rawPath, verb] = table[params.operation];
  const { operation: _operation, ...payload } = params;
  const path = interpolateExperimentalPath(rawPath, payload);
  const result = await characterServiceRequest(client, method, path, payload, `premade-${params.operation}`);
  return renderMutationResult(verb, "premade info", payload, result);
}

export async function manageVehicle(client: DdbClient, params: { operation: "list" | "create" | "update" | "delete" | "setFuel" | "createCondition" | "updateCondition" | "deleteCondition" | "listComponents" | "createComponent" | "updateComponent" | "updateComponentHp"; characterId?: number; vehicleMappingId?: number | string; id?: number | string; vehicleId?: number | string; componentId?: number | string; componentIds?: Array<number | string>; conditionId?: number; removedHitPoints?: number; [key: string]: unknown }): Promise<ToolResult> {
  const table = {
    list: ["get", "vehicles", "Listed", ["characterId"]],
    create: ["post", "vehicle", "Created", ["characterId", "vehicleId"]],
    update: ["put", "vehicle", "Updated", ["characterId", "id"]],
    delete: ["delete", "vehicle", "Deleted", ["characterId", "id"]],
    setFuel: ["put", "vehicle/fuel", "Updated", ["characterId", "id"]],
    createCondition: ["post", "vehicle/condition", "Created", ["characterId", "vehicleMappingId", "conditionId"]],
    updateCondition: ["put", "vehicle/condition", "Updated", ["characterId", "vehicleMappingId", "conditionId"]],
    deleteCondition: ["delete", "vehicle/condition", "Deleted", ["characterId", "vehicleMappingId", "conditionId"]],
    listComponents: ["get", "vehicle/components", "Listed", ["characterId", "vehicleMappingId"]],
    createComponent: ["post", "vehicle/component", "Created", ["characterId", "vehicleMappingId", "componentIds"]],
    updateComponent: ["put", "vehicle/component", "Updated", ["characterId", "id", "vehicleMappingId", "componentId"]],
    updateComponentHp: ["put", "vehicle/component/hp", "Updated", ["characterId", "id", "removedHitPoints"]],
  } as const;
  const [method, path, verb, requiredFields] = table[params.operation];
  const missing = requiredPayload(params, ["operation", ...requiredFields]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const { operation: _operation, ...payload } = params;
  const result = await characterServiceRequest(client, method, path, payload, `vehicle-${params.operation}`);
  return renderMutationResult(verb, "vehicle data", payload, result);
}

export async function getPartyInventory(client: DdbClient, params: { campaignId: number }): Promise<ToolResult> {
  const missing = requiredPayload(params as unknown as CharacterPayload, ["campaignId"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const url = `${DDB_CHARACTER_SERVICE}/character/v5/party/inventory/${encodeURIComponent(String(params.campaignId))}`;
  const result = await client.get<unknown>(url, `party-inventory:${params.campaignId}:${Date.now()}`, 0);
  return renderMutationResult("Loaded", "party inventory", params as unknown as CharacterPayload, result);
}

export async function getCharacterRuleData(client: DdbClient, params: { characterId: number }): Promise<ToolResult> {
  const result = await characterServiceRequest(client, "get", "rule-data", params as unknown as CharacterPayload, "rule-data");
  return renderMutationResult("Loaded", "rule data", params as unknown as CharacterPayload, result);
}

export async function getCharacterShareUrl(client: DdbClient, params: { characterId: number }): Promise<ToolResult> {
  const result = await characterServiceRequest(client, "get", "share/url", params as unknown as CharacterPayload, "share-url");
  return renderMutationResult("Loaded", "share URL", params as unknown as CharacterPayload, result);
}

export async function generateCharacterPdf(client: DdbClient, params: { characterId: number; exportData: string; [key: string]: unknown }): Promise<ToolResult> {
  const missing = requiredPayload(params, ["characterId", "exportData"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const result = await characterServiceRequest(client, "post", "pdf", params, "pdf");
  return renderMutationResult("Generated", "PDF", params, result);
}

export async function setCharacterFeatureFlag(client: DdbClient, params: { flags?: string[]; [key: string]: unknown }): Promise<ToolResult> {
  const missing = requiredPayload(params, ["flags"]);
  if (missing) return { content: [{ type: "text", text: missing }] };
  const result = await characterServiceRequest(client, "post", "featureflag", params, "featureflag");
  return renderMutationResult("Loaded", "feature flags", params, result);
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

  const putBody: { characterId: number; removedHitPoints: number; temporaryHitPoints?: number } = {
    characterId: params.characterId,
    removedHitPoints: newRemovedHp,
  };

  if (params.tempHp !== undefined) {
    putBody.temporaryHitPoints = params.tempHp;
  }

  await client.put(
    ENDPOINTS.character.updateHp(),
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
}

interface SetInspirationParams {
  characterId: number;
  inspiration: boolean;
}

export async function setInspiration(
  client: DdbClient,
  params: SetInspirationParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setInspiration(),
    { characterId: params.characterId, inspiration: params.inspiration },
    [`character:${params.characterId}`]
  );
  const state = params.inspiration ? "granted" : "removed";
  return { content: [{ type: "text", text: `Inspiration ${state} for character ${params.characterId}.` }] };
}

interface AddConditionParams {
  characterId: number;
  conditionId: number;
  level?: number | null;
}

const CONDITION_NAMES: Record<number, string> = {
  1: "Blinded", 2: "Charmed", 3: "Deafened", 4: "Frightened",
  5: "Grappled", 6: "Incapacitated", 7: "Invisible", 8: "Paralyzed",
  9: "Petrified", 10: "Poisoned", 11: "Prone", 12: "Restrained",
  13: "Stunned", 14: "Unconscious", 15: "Exhaustion",
};

export async function addCondition(
  client: DdbClient,
  params: AddConditionParams
): Promise<ToolResult> {
  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `character:${params.characterId}`,
    60_000
  );
  const maxHp = calculateMaxHp(character);

  await client.put(
    ENDPOINTS.character.condition(),
    {
      characterId: params.characterId,
      id: params.conditionId,
      level: params.level ?? null,
      totalHp: maxHp,
    },
    [`character:${params.characterId}`]
  );

  const name = CONDITION_NAMES[params.conditionId] ?? `Condition ${params.conditionId}`;
  const levelText = params.level ? ` (level ${params.level})` : "";
  return { content: [{ type: "text", text: `Added ${name}${levelText} to character ${params.characterId}.` }] };
}

interface RemoveConditionParams {
  characterId: number;
  conditionId: number;
}

export async function removeCondition(
  client: DdbClient,
  params: RemoveConditionParams
): Promise<ToolResult> {
  await client.delete(
    ENDPOINTS.character.condition(),
    { characterId: params.characterId, id: params.conditionId },
    [`character:${params.characterId}`]
  );

  const name = CONDITION_NAMES[params.conditionId] ?? `Condition ${params.conditionId}`;
  return { content: [{ type: "text", text: `Removed ${name} from character ${params.characterId}.` }] };
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

  await client.put(
    ENDPOINTS.character.updateSpellSlots(),
    {
      characterId: params.characterId,
      spellslots: { [`level${params.level}`]: params.used },
      update: true,
    },
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

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `character:${params.characterId}`,
    60_000
  );
  const body = {
    successCount: params.type === "success" ? params.count : (character.deathSaves.successCount ?? 0),
    failCount: params.type === "failure" ? params.count : (character.deathSaves.failCount ?? 0),
  };

  await client.put(
    ENDPOINTS.character.updateDeathSaves(),
    { characterId: params.characterId, ...body },
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

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `character:${params.characterId}`,
    60_000
  );

  let finalAmount: number;
  let description: string;

  if (params.delta !== undefined) {
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

  const nextCurrencies = { ...character.currencies, [params.currency]: finalAmount };

  await client.put(
    ENDPOINTS.character.updateCurrency(),
    { characterId: params.characterId, ...nextCurrencies },
    [`character:${params.characterId}`]
  );

  return {
    content: [{ type: "text", text: `${description}.` }],
  };
}

interface SetProgressionParams { characterId: number; currentXp: number }
interface SetHpBaseParams { characterId: number; baseHitPoints: number }
interface SetHpBonusParams { characterId: number; bonusHitPoints: number }
interface SetHpOverrideParams { characterId: number; overrideHitPoints: number | null }
interface RestoreHpParams { characterId: number; totalHp: number; restoreType: number }
interface SetCharacterPreferenceParams { characterId: number; key: string; value: string | number | boolean | null }
interface SetHelpTextParams { characterId: number; showHelpText: boolean }
interface SpellKnownParams { characterId: number; classId: number; spellId: number; spellMappingId: number; spellEntityTypeId: number }
interface SetSpellPreparedParams { characterId: number; classMappingId: number; spellId: number; spellMappingId: number; spellEntityTypeId: number; prepared: boolean }

export async function setProgression(client: DdbClient, params: SetProgressionParams): Promise<ToolResult> {
  if (!Number.isInteger(params.currentXp) || params.currentXp < 0) {
    return { content: [{ type: "text", text: "Current XP must be a non-negative integer." }] };
  }
  await client.put(ENDPOINTS.character.setProgression(), { characterId: params.characterId, currentXp: params.currentXp }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Set character ${params.characterId} XP to ${params.currentXp}.` }] };
}

export async function setHpBase(client: DdbClient, params: SetHpBaseParams): Promise<ToolResult> {
  if (!Number.isInteger(params.baseHitPoints) || params.baseHitPoints < 1) return { content: [{ type: "text", text: "Base HP must be a positive integer." }] };
  await client.put(ENDPOINTS.character.hp.setBase(), { characterId: params.characterId, baseHitPoints: params.baseHitPoints }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Set base HP to ${params.baseHitPoints}.` }] };
}

export async function setHpBonus(client: DdbClient, params: SetHpBonusParams): Promise<ToolResult> {
  await client.put(ENDPOINTS.character.hp.setBonus(), { characterId: params.characterId, bonusHitPoints: params.bonusHitPoints }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Set bonus HP to ${params.bonusHitPoints}.` }] };
}

export async function setHpOverride(client: DdbClient, params: SetHpOverrideParams): Promise<ToolResult> {
  await client.put(ENDPOINTS.character.hp.setOverride(), { characterId: params.characterId, overrideHitPoints: params.overrideHitPoints }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Set override HP to ${params.overrideHitPoints ?? "none"}.` }] };
}

export async function restoreHp(client: DdbClient, params: RestoreHpParams): Promise<ToolResult> {
  await client.put(ENDPOINTS.character.hp.restore(), { characterId: params.characterId, totalHp: params.totalHp, restoreType: params.restoreType }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Restored HP using restoreType ${params.restoreType}.` }] };
}

export async function setCharacterPreference(client: DdbClient, params: SetCharacterPreferenceParams): Promise<ToolResult> {
  if (!params.key.trim()) return { content: [{ type: "text", text: "Preference key cannot be empty." }] };
  await client.put(ENDPOINTS.character.setPreferences(), { characterId: params.characterId, [params.key]: params.value }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Set preference ${params.key} for character ${params.characterId}.` }] };
}

export async function setHelpText(client: DdbClient, params: SetHelpTextParams): Promise<ToolResult> {
  await client.put(ENDPOINTS.character.setHelpText(), { characterId: params.characterId, showHelpText: params.showHelpText }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `${params.showHelpText ? "Enabled" : "Disabled"} help text for character ${params.characterId}.` }] };
}

export async function addKnownSpell(client: DdbClient, params: SpellKnownParams): Promise<ToolResult> {
  const result = await client.post<DdbSpell>(ENDPOINTS.character.spell.add(), {
    characterId: params.characterId,
    characterClassId: params.classId,
    spellId: params.spellId,
    id: params.spellMappingId,
    entityTypeId: params.spellEntityTypeId,
  }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Added known spell ${result.definition?.name ?? params.spellId} to character ${params.characterId}.` }] };
}

export async function removeKnownSpell(client: DdbClient, params: SpellKnownParams): Promise<ToolResult> {
  await client.delete(ENDPOINTS.character.spell.remove(), {
    characterId: params.characterId,
    characterClassId: params.classId,
    spellId: params.spellId,
    id: params.spellMappingId,
    entityTypeId: params.spellEntityTypeId,
  }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `Removed known spell ${params.spellId} from character ${params.characterId}.` }] };
}

export async function setSpellPrepared(client: DdbClient, params: SetSpellPreparedParams): Promise<ToolResult> {
  await client.put(ENDPOINTS.character.spell.setPrepared(), {
    characterId: params.characterId,
    characterClassId: params.classMappingId,
    spellId: params.spellId,
    id: params.spellMappingId,
    entityTypeId: params.spellEntityTypeId,
    prepared: params.prepared,
  }, [`character:${params.characterId}`]);
  return { content: [{ type: "text", text: `${params.prepared ? "Prepared" : "Unprepared"} spell mapping ${params.spellMappingId}.` }] };
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

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `character:${params.characterId}`,
    60_000
  );
  const pactSlots = Array.isArray(character.pactMagic)
    ? character.pactMagic.find((slot) => slot.available > 0) ?? character.pactMagic.find((slot) => slot.level > 0)
    : character.pactMagic;
  const pactLevel = pactSlots?.level;
  if (!pactLevel) {
    return {
      content: [{ type: "text", text: `${character.name} does not have pact magic slots.` }],
    };
  }

  await client.put(
    ENDPOINTS.character.updateSpellSlots(),
    {
      characterId: params.characterId,
      spellslots: { [`level${pactLevel}`]: params.used },
      pact: true,
    },
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
}

export async function longRest(
  client: DdbClient,
  params: LongRestParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Server-side long rest handles all resets atomically:
  // HP, spell slots, pact magic, limited-use abilities, hit dice, death saves
  await client.get<unknown>(
    ENDPOINTS.character.rest.long(params.characterId),
    `rest:long:${params.characterId}:${Date.now()}`,
    0
  );
  client.invalidateCache(`character:${params.characterId}`);

  return {
    content: [
      {
        type: "text",
        text: `Long rest completed for character ${params.characterId}. All HP, spell slots, and long-rest abilities have been restored.`,
      },
    ],
  };
}

export async function shortRest(
  client: DdbClient,
  params: ShortRestParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Server-side short rest handles pact magic, short-rest abilities, hit dice
  await client.get<unknown>(
    ENDPOINTS.character.rest.short(params.characterId),
    `rest:short:${params.characterId}:${Date.now()}`,
    0
  );
  client.invalidateCache(`character:${params.characterId}`);

  return {
    content: [
      {
        type: "text",
        text: `Short rest completed for character ${params.characterId}. Pact magic and short-rest abilities have been restored.`,
      },
    ],
  };
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
    const pactSlot = Array.isArray(character.pactMagic)
      ? character.pactMagic.find((slot) => slot.available > 0 && spellLevel <= slot.level)
      : character.pactMagic;
    const hasPactMagic = Boolean(pactSlot && pactSlot.available > 0);

    if (isWarlock && hasPactMagic && pactSlot && spellLevel <= pactSlot.level) {
      // Use pact magic slot
      const newUsed = pactSlot.used + 1;
      if (newUsed > pactSlot.available) {
        return {
          content: [{ type: "text", text: `No pact magic slots remaining (${pactSlot.used}/${pactSlot.available} used).` }],
        };
      }
      await client.put(
        ENDPOINTS.character.updateSpellSlots(),
        {
          characterId: params.characterId,
          spellslots: { [`level${pactSlot.level}`]: newUsed },
          pact: true,
        },
        [`character:${params.characterId}`]
      );
      return {
        content: [{
          type: "text",
          text: `Cast ${spell.definition.name} using pact magic (level ${pactSlot.level}). Pact slots: ${newUsed}/${pactSlot.available} used.`,
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
        ENDPOINTS.character.updateSpellSlots(),
        {
          characterId: params.characterId,
          spellslots: { [`level${spellLevel}`]: newUsed },
          update: true,
        },
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
      ENDPOINTS.character.updateSpellSlots(),
      {
        characterId: params.characterId,
        spellslots: { [`level${spellLevel}`]: 1 },
        update: true,
      },
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
            text: `⚠️  Spell casting operations are temporarily unavailable.\n\nD&D Beyond rejected the spell slot update endpoint. Character ID: ${params.characterId}\nRead operations still work normally.`,
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

// ============================================================================
// CHARACTER CREATION / BUILDER
// ============================================================================

interface CreateCharacterParams {
  method: "standard" | "quick";
  classId?: number;
  entityRaceId?: number;
  entityRaceTypeId?: number;
}

export async function createCharacter(
  client: DdbClient,
  params: CreateCharacterParams
): Promise<ToolResult> {
  if (params.method === "quick") {
    if (!params.classId || !params.entityRaceId || !params.entityRaceTypeId) {
      return { content: [{ type: "text", text: "Quick build requires classId, entityRaceId, and entityRaceTypeId." }] };
    }
    const characterId = await client.post<number>(
      ENDPOINTS.character.builder.quickBuild(),
      { classId: params.classId, entityRaceId: params.entityRaceId, entityRaceTypeId: params.entityRaceTypeId }
    );
    return { content: [{ type: "text", text: `Created character via quick build. Character ID: ${characterId}` }] };
  }

  const characterId = await client.post<number>(
    ENDPOINTS.character.builder.standardBuild(),
    { showHelpText: false }
  );
  return { content: [{ type: "text", text: `Created character via standard build. Character ID: ${characterId}` }] };
}

interface DeleteCharacterParams {
  characterId: number;
}

export async function deleteCharacter(
  client: DdbClient,
  params: DeleteCharacterParams
): Promise<ToolResult> {
  await client.delete(
    ENDPOINTS.character.delete(),
    { characterId: params.characterId },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Deleted character ${params.characterId}.` }] };
}

interface AddClassParams {
  characterId: number;
  classId: number;
  level: number;
}

export async function addClass(
  client: DdbClient,
  params: AddClassParams
): Promise<ToolResult> {
  await client.post(
    ENDPOINTS.character.addClass(),
    { characterId: params.characterId, classId: params.classId, level: params.level },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Added class ${params.classId} at level ${params.level} to character ${params.characterId}.` }] };
}

interface SetBackgroundParams {
  characterId: number;
  backgroundId: number;
}

export async function setBackground(
  client: DdbClient,
  params: SetBackgroundParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setBackground(),
    { characterId: params.characterId, backgroundId: params.backgroundId },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set background ${params.backgroundId} on character ${params.characterId}.` }] };
}

interface SetBackgroundChoiceParams {
  characterId: number;
  type: number;
  choiceKey: string;
  choiceValue: number;
}

export async function setBackgroundChoice(
  client: DdbClient,
  params: SetBackgroundChoiceParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setBackgroundChoice(),
    { characterId: params.characterId, type: params.type, choiceKey: params.choiceKey, choiceValue: params.choiceValue },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set background choice on character ${params.characterId}.` }] };
}

interface SetSpeciesParams {
  characterId: number;
  entityRaceId: number;
  entityRaceTypeId: number;
}

export async function setSpecies(
  client: DdbClient,
  params: SetSpeciesParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setRace(),
    { characterId: params.characterId, entityRaceId: params.entityRaceId, entityRaceTypeId: params.entityRaceTypeId },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set species on character ${params.characterId}.` }] };
}

interface SetAbilityScoreParams {
  characterId: number;
  statId: number;
  type: number;
  value: number;
}

export async function setAbilityScore(
  client: DdbClient,
  params: SetAbilityScoreParams
): Promise<ToolResult> {
  if (params.statId < 1 || params.statId > 6) {
    return { content: [{ type: "text", text: "statId must be between 1 (STR) and 6 (CHA)." }] };
  }
  const abilityName = ["STR", "DEX", "CON", "INT", "WIS", "CHA"][params.statId - 1];
  await client.put(
    ENDPOINTS.character.setAbilityScore(),
    { characterId: params.characterId, statId: params.statId, type: params.type, value: params.value },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set ${abilityName} to ${params.value} on character ${params.characterId}.` }] };
}

interface UpdateCharacterNameParams {
  characterId: number;
  name: string;
}

export async function updateCharacterName(
  client: DdbClient,
  params: UpdateCharacterNameParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.updateName(),
    { characterId: params.characterId, name: params.name },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Updated character ${params.characterId} name to "${params.name}".` }] };
}

// ============================================================================
// CLASS LEVEL & ABILITY SCORE TYPE
// ============================================================================

interface SetClassLevelParams {
  characterId: number;
  classId: number;
  classMappingId: number;
  level: number;
}

export async function setClassLevel(
  client: DdbClient,
  params: SetClassLevelParams
): Promise<ToolResult> {
  if (params.level < 1 || params.level > 20) {
    return { content: [{ type: "text", text: "Level must be between 1 and 20." }] };
  }
  await client.put(
    ENDPOINTS.character.setClassLevel(),
    { characterId: params.characterId, classId: params.classId, classMappingId: params.classMappingId, level: params.level },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set class level to ${params.level} on character ${params.characterId}.` }] };
}

interface SetAbilityScoreTypeParams {
  characterId: number;
  abilityScoreType: number;
}

export async function setAbilityScoreType(
  client: DdbClient,
  params: SetAbilityScoreTypeParams
): Promise<ToolResult> {
  const typeNames: Record<number, string> = { 1: "Standard Array", 2: "Rolled", 3: "Point Buy" };
  const typeName = typeNames[params.abilityScoreType] ?? `type ${params.abilityScoreType}`;
  await client.put(
    ENDPOINTS.character.setAbilityScoreType(),
    { characterId: params.characterId, abilityScoreType: params.abilityScoreType },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set ability score method to ${typeName} on character ${params.characterId}.` }] };
}

// ============================================================================
// INVENTORY / STARTING EQUIPMENT
// ============================================================================

interface SetStartingEquipmentTypeParams {
  characterId: number;
  startingEquipmentType: number;
}

export async function setStartingEquipmentType(
  client: DdbClient,
  params: SetStartingEquipmentTypeParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.inventory.setStartingType(),
    { characterId: params.characterId, startingEquipmentType: params.startingEquipmentType },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set starting equipment type to ${params.startingEquipmentType} on character ${params.characterId}.` }] };
}

interface AddInventoryItemsParams {
  characterId: number;
  equipment: Array<{
    entityId: number;
    entityTypeId: number;
    quantity: number;
  }>;
}

export async function addInventoryItems(
  client: DdbClient,
  params: AddInventoryItemsParams
): Promise<ToolResult> {
  const items = params.equipment.map(item => ({
    containerEntityId: params.characterId,
    containerEntityTypeId: 1581111423, // Character container type
    entityId: item.entityId,
    entityTypeId: item.entityTypeId,
    quantity: item.quantity,
    originEntityId: null,
    originEntityTypeId: null,
  }));
  await client.post(
    ENDPOINTS.character.inventory.addItems(),
    { characterId: params.characterId, equipment: items },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Added ${params.equipment.length} item(s) to character ${params.characterId}.` }] };
}

interface SetGoldParams {
  characterId: number;
  amount: number;
}

export async function setGold(
  client: DdbClient,
  params: SetGoldParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.inventory.setGold(),
    { characterId: params.characterId, amount: params.amount },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set gold to ${params.amount} on character ${params.characterId}.` }] };
}

interface ListInventoryItemsParams {
  characterId: number;
  includeCustom?: boolean;
}

interface AddCatalogItemParams {
  characterId: number;
  itemName?: string;
  entityId?: number;
  entityTypeId?: number;
  quantity?: number;
}

interface InventoryItemMutationParams {
  characterId: number;
  inventoryItemId: number;
}

interface SetInventoryItemQuantityParams extends InventoryItemMutationParams {
  quantity: number;
}

interface SetInventoryItemBooleanParams extends InventoryItemMutationParams {
  value: boolean;
}

interface SetInventoryItemChargeParams extends InventoryItemMutationParams {
  charges: number;
}

interface MoveInventoryItemParams extends InventoryItemMutationParams {
  containerEntityId: number;
  containerEntityTypeId: number;
}

interface CreateCustomItemParams {
  characterId: number;
  name: string;
  description?: string;
  quantity?: number;
  weight?: number;
  cost?: number | null;
  containerEntityId?: number;
  containerEntityTypeId?: number;
}

interface UpdateCustomItemParams {
  characterId: number;
  inventoryItemId: number;
  name?: string;
  description?: string;
  quantity?: number;
  weight?: number;
  cost?: number | null;
}

interface DeleteCustomItemParams extends InventoryItemMutationParams {}

const CHARACTER_CONTAINER_ENTITY_TYPE_ID = 1581111423;
const CUSTOM_ITEM_DEFINITION_ENTITY_TYPE_ID = 988229960;

function isCustomInventoryItem(item: DdbInventoryItem): boolean {
  return Boolean(
    item.definition?.isCustomItem ||
    item.definition?.entityTypeId === CUSTOM_ITEM_DEFINITION_ENTITY_TYPE_ID ||
    item.definition?.definitionKey?.startsWith(`${CUSTOM_ITEM_DEFINITION_ENTITY_TYPE_ID}:`)
  );
}

function getInventoryItemName(item: DdbInventoryItem): string {
  return item.definition?.name || `Inventory item ${item.id}`;
}

async function getCharacterForInventory(client: DdbClient, characterId: number): Promise<DdbCharacter> {
  return client.get<DdbCharacter>(
    ENDPOINTS.character.get(characterId),
    `character:${characterId}:inventory`,
    5_000
  );
}

function findInventoryItem(char: DdbCharacter, inventoryItemId: number): DdbInventoryItem | undefined {
  return (char.inventory ?? []).find((item) => item.id === inventoryItemId);
}

function validateNonNegativeNumber(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value < 0) return `${label} must be a non-negative number.`;
  return null;
}

export async function listInventoryItems(
  client: DdbClient,
  params: ListInventoryItemsParams
): Promise<ToolResult> {
  const character = await getCharacterForInventory(client, params.characterId);
  const includeCustom = params.includeCustom ?? true;
  let items = character.inventory ?? [];
  if (!includeCustom) items = items.filter((item) => !isCustomInventoryItem(item));

  if (items.length === 0) {
    return { content: [{ type: "text", text: `${character.name} has no inventory items${includeCustom ? StringUtils.EMPTY : " matching the filter"}.` }] };
  }

  const lines = [`# Inventory for ${character.name} (${items.length} item${items.length === 1 ? StringUtils.EMPTY : "s"})\n`];
  for (const item of [...items].sort((a, b) => getInventoryItemName(a).localeCompare(getInventoryItemName(b)))) {
    const custom = isCustomInventoryItem(item) ? " custom" : StringUtils.EMPTY;
    const equipped = item.equipped ? ", equipped" : StringUtils.EMPTY;
    const attuned = item.isAttuned ? ", attuned" : StringUtils.EMPTY;
    const definitionId = item.definition?.id ? `, definition ${item.definition.id}` : StringUtils.EMPTY;
    lines.push(`- **${getInventoryItemName(item)}** x${item.quantity ?? 1} — inventory ${item.id}${definitionId}${custom}${equipped}${attuned}`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export async function addCatalogItem(
  client: DdbClient,
  params: AddCatalogItemParams
): Promise<ToolResult> {
  const quantity = params.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { content: [{ type: "text", text: "Quantity must be a positive integer." }] };
  }

  let entityId = params.entityId;
  let entityTypeId = params.entityTypeId;
  let itemName = params.itemName;

  if (!entityId || !entityTypeId) {
    if (!params.itemName?.trim()) {
      return { content: [{ type: "text", text: "Provide either entityId/entityTypeId or itemName." }] };
    }
    const items = await client.get<Array<{ id: number; entityTypeId: number; name: string; type?: string; rarity?: string }>>(
      ENDPOINTS.gameData.items(),
      "game-data:items",
      86_400_000,
    );
    const search = params.itemName.trim().toLowerCase();
    const match = (items ?? []).find((item) => item.name.toLowerCase() === search)
      ?? (items ?? []).find((item) => item.name.toLowerCase().includes(search));
    if (!match) {
      return { content: [{ type: "text", text: `No catalog item found matching "${params.itemName}".` }] };
    }
    entityId = match.id;
    entityTypeId = match.entityTypeId;
    itemName = match.name;
  }

  await addInventoryItems(client, {
    characterId: params.characterId,
    equipment: [{ entityId, entityTypeId, quantity }],
  });

  return { content: [{ type: "text", text: `Added ${quantity} × ${itemName ?? `item ${entityId}`} to character ${params.characterId}.` }] };
}

export async function setInventoryItemQuantity(
  client: DdbClient,
  params: SetInventoryItemQuantityParams
): Promise<ToolResult> {
  if (!Number.isInteger(params.quantity) || params.quantity < 0) {
    return { content: [{ type: "text", text: "Quantity must be a non-negative integer." }] };
  }

  await client.put(
    ENDPOINTS.character.inventory.setQuantity(),
    { characterId: params.characterId, id: params.inventoryItemId, quantity: params.quantity },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set inventory item ${params.inventoryItemId} quantity to ${params.quantity}.` }] };
}

export async function setInventoryItemEquipped(
  client: DdbClient,
  params: SetInventoryItemBooleanParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.inventory.setEquipped(),
    { characterId: params.characterId, id: params.inventoryItemId, value: params.value },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `${params.value ? "Equipped" : "Unequipped"} inventory item ${params.inventoryItemId}.` }] };
}

export async function setInventoryItemAttuned(
  client: DdbClient,
  params: SetInventoryItemBooleanParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.inventory.setAttuned(),
    { characterId: params.characterId, id: params.inventoryItemId, value: params.value },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `${params.value ? "Attuned" : "Unattuned"} inventory item ${params.inventoryItemId}.` }] };
}

export async function setInventoryItemCharge(
  client: DdbClient,
  params: SetInventoryItemChargeParams
): Promise<ToolResult> {
  if (!Number.isInteger(params.charges) || params.charges < 0) {
    return { content: [{ type: "text", text: "Charges must be a non-negative integer." }] };
  }
  await client.put(
    ENDPOINTS.character.inventory.setCharge(),
    { characterId: params.characterId, id: params.inventoryItemId, charges: params.charges },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set inventory item ${params.inventoryItemId} charges to ${params.charges}.` }] };
}

export async function moveInventoryItem(
  client: DdbClient,
  params: MoveInventoryItemParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.inventory.moveItem(),
    {
      characterId: params.characterId,
      id: params.inventoryItemId,
      containerEntityId: params.containerEntityId,
      containerEntityTypeId: params.containerEntityTypeId,
    },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Moved inventory item ${params.inventoryItemId}.` }] };
}

export async function removeInventoryItem(
  client: DdbClient,
  params: InventoryItemMutationParams
): Promise<ToolResult> {
  const character = await getCharacterForInventory(client, params.characterId);
  const item = findInventoryItem(character, params.inventoryItemId);
  if (!item) {
    return { content: [{ type: "text", text: `Inventory item ${params.inventoryItemId} was not found on ${character.name}.` }] };
  }
  if (isCustomInventoryItem(item)) {
    const definitionId = item.definition?.id;
    if (!definitionId) return { content: [{ type: "text", text: `${getInventoryItemName(item)} is missing a custom definition ID.` }] };
    await client.delete(
      ENDPOINTS.character.inventory.customItem(),
      { characterId: params.characterId, id: definitionId, mappingId: params.inventoryItemId, partyId: null },
      [`character:${params.characterId}`]
    );
    return { content: [{ type: "text", text: `Deleted custom item "${getInventoryItemName(item)}" from ${character.name}.` }] };
  }

  await client.delete(
    ENDPOINTS.character.inventory.removeItem(),
    { characterId: params.characterId, id: params.inventoryItemId },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Removed ${getInventoryItemName(item)} from ${character.name}.` }] };
}

export async function createCustomItem(
  client: DdbClient,
  params: CreateCustomItemParams
): Promise<ToolResult> {
  const name = params.name.trim();
  if (!name) return { content: [{ type: "text", text: "Custom item name cannot be empty." }] };
  const quantity = params.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { content: [{ type: "text", text: "Quantity must be a positive integer." }] };
  }
  const weightError = validateNonNegativeNumber(params.weight ?? 0, "Weight");
  if (weightError) return { content: [{ type: "text", text: weightError }] };
  if (params.cost !== undefined && params.cost !== null) {
    const costError = validateNonNegativeNumber(params.cost, "Cost");
    if (costError) return { content: [{ type: "text", text: costError }] };
  }

  const result = await client.post<{ addItems?: DdbInventoryItem[] }>(
    ENDPOINTS.character.inventory.customItem(),
    {
      characterId: params.characterId,
      containerEntityId: params.containerEntityId ?? params.characterId,
      containerEntityTypeId: params.containerEntityTypeId ?? CHARACTER_CONTAINER_ENTITY_TYPE_ID,
      name,
      description: params.description ?? StringUtils.EMPTY,
      quantity,
      weight: params.weight ?? 0,
      cost: params.cost ?? null,
    },
    [`character:${params.characterId}`]
  );

  const added = result.addItems?.[0];
  const detail = added ? ` Inventory item ID: ${added.id}; definition ID: ${added.definition?.id ?? "unknown"}.` : StringUtils.EMPTY;
  return { content: [{ type: "text", text: `Created custom item "${name}" on character ${params.characterId}.${detail}` }] };
}

export async function updateCustomItem(
  client: DdbClient,
  params: UpdateCustomItemParams
): Promise<ToolResult> {
  const character = await getCharacterForInventory(client, params.characterId);
  const item = findInventoryItem(character, params.inventoryItemId);
  if (!item) return { content: [{ type: "text", text: `Inventory item ${params.inventoryItemId} was not found on ${character.name}.` }] };
  if (!isCustomInventoryItem(item)) return { content: [{ type: "text", text: `${getInventoryItemName(item)} is not a custom item.` }] };
  const definitionId = item.definition?.id;
  if (!definitionId) return { content: [{ type: "text", text: `${getInventoryItemName(item)} is missing a custom definition ID.` }] };

  const quantity = params.quantity ?? item.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { content: [{ type: "text", text: "Quantity must be a positive integer." }] };
  }
  const weight = params.weight ?? item.definition?.weight ?? 0;
  const weightError = validateNonNegativeNumber(weight, "Weight");
  if (weightError) return { content: [{ type: "text", text: weightError }] };
  const cost = params.cost !== undefined ? params.cost : item.definition?.cost ?? null;
  if (cost !== null) {
    const costError = validateNonNegativeNumber(cost, "Cost");
    if (costError) return { content: [{ type: "text", text: costError }] };
  }
  const name = params.name?.trim() || getInventoryItemName(item);

  await client.put(
    ENDPOINTS.character.inventory.customItem(),
    {
      characterId: params.characterId,
      id: definitionId,
      mappingId: params.inventoryItemId,
      name,
      description: params.description ?? item.definition?.description ?? StringUtils.EMPTY,
      quantity,
      weight,
      cost,
    },
    [`character:${params.characterId}`]
  );

  return { content: [{ type: "text", text: `Updated custom item "${name}" on ${character.name}.` }] };
}

export async function deleteCustomItem(
  client: DdbClient,
  params: DeleteCustomItemParams
): Promise<ToolResult> {
  const character = await getCharacterForInventory(client, params.characterId);
  const item = findInventoryItem(character, params.inventoryItemId);
  if (!item) return { content: [{ type: "text", text: `Inventory item ${params.inventoryItemId} was not found on ${character.name}.` }] };
  if (!isCustomInventoryItem(item)) return { content: [{ type: "text", text: `${getInventoryItemName(item)} is not a custom item.` }] };
  const definitionId = item.definition?.id;
  if (!definitionId) return { content: [{ type: "text", text: `${getInventoryItemName(item)} is missing a custom definition ID.` }] };

  await client.delete(
    ENDPOINTS.character.inventory.customItem(),
    { characterId: params.characterId, id: definitionId, mappingId: params.inventoryItemId, partyId: null },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Deleted custom item "${getInventoryItemName(item)}" from ${character.name}.` }] };
}

// ============================================================================
// DESCRIPTION FIELDS
// ============================================================================

interface UpdateDescriptionParams {
  characterId: number;
  field: string;
  value: string | number;
}

export async function updateDescription(
  client: DdbClient,
  params: UpdateDescriptionParams
): Promise<ToolResult> {
  const FIELD_ENDPOINTS: Record<string, { endpoint: () => string; bodyKey: string }> = {
    alignment: { endpoint: ENDPOINTS.character.updateAlignment, bodyKey: "alignmentId" },
    lifestyle: { endpoint: ENDPOINTS.character.updateLifestyle, bodyKey: "lifestyleId" },
    faith: { endpoint: ENDPOINTS.character.updateFaith, bodyKey: "faith" },
    hair: { endpoint: () => ENDPOINTS.character.updateAppearance("hair"), bodyKey: "hair" },
    skin: { endpoint: () => ENDPOINTS.character.updateAppearance("skin"), bodyKey: "skin" },
    eyes: { endpoint: () => ENDPOINTS.character.updateAppearance("eyes"), bodyKey: "eyes" },
    height: { endpoint: () => ENDPOINTS.character.updateAppearance("height"), bodyKey: "height" },
    weight: { endpoint: () => ENDPOINTS.character.updateAppearance("weight"), bodyKey: "weight" },
    age: { endpoint: () => ENDPOINTS.character.updateAppearance("age"), bodyKey: "age" },
    gender: { endpoint: () => ENDPOINTS.character.updateAppearance("gender"), bodyKey: "gender" },
    personalityTraits: { endpoint: ENDPOINTS.character.updateTraits, bodyKey: "personalityTraits" },
    ideals: { endpoint: ENDPOINTS.character.updateTraits, bodyKey: "ideals" },
    bonds: { endpoint: ENDPOINTS.character.updateTraits, bodyKey: "bonds" },
    flaws: { endpoint: ENDPOINTS.character.updateTraits, bodyKey: "flaws" },
    backstory: { endpoint: ENDPOINTS.character.updateNotes, bodyKey: "backstory" },
    otherNotes: { endpoint: ENDPOINTS.character.updateNotes, bodyKey: "otherNotes" },
    allies: { endpoint: ENDPOINTS.character.updateNotes, bodyKey: "allies" },
    organizations: { endpoint: ENDPOINTS.character.updateNotes, bodyKey: "organizations" },
    enemies: { endpoint: ENDPOINTS.character.updateNotes, bodyKey: "enemies" },
  };

  const config = FIELD_ENDPOINTS[params.field];
  if (!config) {
    const validFields = Object.keys(FIELD_ENDPOINTS).join(", ");
    return { content: [{ type: "text", text: `Invalid field "${params.field}". Valid fields: ${validFields}` }] };
  }

  await client.put(
    config.endpoint(),
    { characterId: params.characterId, [config.bodyKey]: params.value },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Updated ${params.field} on character ${params.characterId}.` }] };
}

// ============================================================================
// CHOICE RESOLUTION
// ============================================================================

interface SetClassFeatureChoiceParams {
  characterId: number;
  classId: number;
  classFeatureId: number;
  classMappingId: number;
  type: number;
  choiceKey: string;
  choiceValue: number;
  parentChoiceId?: number | null;
}

export async function setClassFeatureChoice(
  client: DdbClient,
  params: SetClassFeatureChoiceParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setClassFeatureChoice(),
    {
      characterId: params.characterId,
      classId: params.classId,
      classFeatureId: params.classFeatureId,
      classMappingId: params.classMappingId,
      type: params.type,
      choiceKey: params.choiceKey,
      choiceValue: params.choiceValue,
      parentChoiceId: params.parentChoiceId ?? null,
    },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set class feature choice on character ${params.characterId}.` }] };
}

interface SetRaceTraitChoiceParams {
  characterId: number;
  racialTraitId: number;
  type: number;
  choiceKey: string;
  choiceValue: number;
}

export async function setRaceTraitChoice(
  client: DdbClient,
  params: SetRaceTraitChoiceParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setRaceTraitChoice(),
    {
      characterId: params.characterId,
      racialTraitId: params.racialTraitId,
      type: params.type,
      choiceKey: params.choiceKey,
      choiceValue: params.choiceValue,
    },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set race trait choice on character ${params.characterId}.` }] };
}

interface SetFeatChoiceParams {
  characterId: number;
  featId: number;
  type: number;
  choiceKey: string;
  choiceValue: number;
}

export async function setFeatChoice(
  client: DdbClient,
  params: SetFeatChoiceParams
): Promise<ToolResult> {
  await client.put(
    ENDPOINTS.character.setFeatChoice(),
    {
      characterId: params.characterId,
      id: params.featId,
      type: params.type,
      choiceKey: params.choiceKey,
      choiceValue: params.choiceValue,
    },
    [`character:${params.characterId}`]
  );
  return { content: [{ type: "text", text: `Set feat choice on character ${params.characterId}.` }] };
}

interface ResolveChoicesParams {
  characterId: number;
}

export async function resolveChoices(
  client: DdbClient,
  params: ResolveChoicesParams
): Promise<ToolResult> {
  const MAX_ITERATIONS = 8;
  const resolved: string[] = [];
  const skipped: string[] = [];
  const configFixed: string[] = [];

  // First, fix missing configuration fields
  const initialChar = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `resolve-init:${params.characterId}:${Date.now()}`,
    1
  );
  const config = (initialChar as any).configuration ?? {};

  if (!config.abilityScoreType) {
    try {
      await client.put(
        ENDPOINTS.character.setAbilityScoreType(),
        { characterId: params.characterId, abilityScoreType: 1 },
        [`character:${params.characterId}`]
      );
      configFixed.push("abilityScoreType → Standard Array");
    } catch { /* ignore */ }
  }

  if (!config.startingEquipmentType) {
    try {
      await client.put(
        ENDPOINTS.character.inventory.setStartingType(),
        { characterId: params.characterId, startingEquipmentType: 1 },
        [`character:${params.characterId}`]
      );
      configFixed.push("startingEquipmentType → Normal");
    } catch { /* ignore */ }
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const char = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(params.characterId),
      `resolve:${params.characterId}:${Date.now()}`,
      1 // no cache
    );

    // Build choiceDefinitions lookup
    const choiceDefs = (char as any).choices?.choiceDefinitions ?? [];
    const defMap = new Map<string, any[]>();
    for (const cd of choiceDefs) {
      if (cd.options?.length) defMap.set(cd.id, cd.options);
    }

    // Gather unresolved choices
    const choices = (char as any).choices ?? {};
    const unresolved: Array<{ category: string; choice: any }> = [];
    for (const [key, val] of Object.entries(choices)) {
      if (key === "choiceDefinitions") continue;
      const arr = val as any[];
      if (!Array.isArray(arr)) continue;
      for (const c of arr) {
        if (!c.optionValue) unresolved.push({ category: key, choice: c });
      }
    }

    if (unresolved.length === 0) break;

    let progressMade = false;
    const charClass = char.classes?.[0];
    const classId = charClass?.definition?.id;
    const classMappingId = charClass?.id;

    for (const { category, choice } of unresolved) {
      // Find option ID from optionIds or choiceDefinitions
      let optionId: number | null = null;
      if (choice.optionIds?.length > 0) {
        optionId = choice.optionIds[0];
      } else {
        const defKey = `${choice.componentTypeId}-${choice.type}`;
        const options = defMap.get(defKey);
        if (options?.length) {
          // Prefer default if specified
          if (choice.defaultSubtypes?.length > 0) {
            const match = options.find((o: any) => o.label === choice.defaultSubtypes[0]);
            optionId = match?.id ?? options[0].id;
          } else {
            optionId = options[0].id;
          }
        }
      }

      if (!optionId) {
        skipped.push(`${category}:${choice.id}`);
        continue;
      }

      try {
        switch (category) {
          case "background":
            await client.put(ENDPOINTS.character.setBackgroundChoice(), {
              characterId: params.characterId, type: choice.type,
              choiceKey: choice.id, choiceValue: optionId,
            }, [`character:${params.characterId}`]);
            break;
          case "class":
            await client.put(ENDPOINTS.character.setClassFeatureChoice(), {
              characterId: params.characterId, classId, type: choice.type,
              choiceKey: choice.id, choiceValue: optionId,
              classFeatureId: choice.componentId, classMappingId,
            }, [`character:${params.characterId}`]);
            break;
          case "race":
            await client.put(ENDPOINTS.character.setRaceTraitChoice(), {
              characterId: params.characterId, type: choice.type,
              choiceKey: choice.id, choiceValue: optionId,
              racialTraitId: choice.componentId,
            }, [`character:${params.characterId}`]);
            break;
          case "feat":
            await client.put(ENDPOINTS.character.setFeatChoice(), {
              characterId: params.characterId, id: choice.componentId,
              type: choice.type, choiceKey: choice.id, choiceValue: optionId,
            }, [`character:${params.characterId}`]);
            break;
          default:
            skipped.push(`${category}:${choice.id}`);
            continue;
        }
        resolved.push(`${category}: ${choice.label || choice.id}`);
        progressMade = true;
      } catch {
        skipped.push(`${category}:${choice.id}`);
      }
    }

    if (!progressMade) break;
  }

  // Final count
  const finalChar = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(params.characterId),
    `resolve-final:${params.characterId}:${Date.now()}`,
    1
  );
  const finalChoices = (finalChar as any).choices ?? {};
  let remaining = 0;
  for (const [key, val] of Object.entries(finalChoices)) {
    if (key === "choiceDefinitions") continue;
    const arr = val as any[];
    if (!Array.isArray(arr)) continue;
    remaining += arr.filter((c: any) => !c.optionValue).length;
  }

  const lines = [
    `Auto-resolved ${resolved.length} choices on ${finalChar.name}.`,
    ...(configFixed.length > 0 ? [`Configuration set: ${configFixed.join(", ")}`] : []),
    ...(resolved.length > 0 ? [`Resolved: ${resolved.join(", ")}`] : []),
    ...(skipped.length > 0 ? [`Skipped (no options): ${skipped.length}`] : []),
    ...(remaining > 0 ? [`Remaining unresolved: ${remaining}`] : ["All choices resolved."]),
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
