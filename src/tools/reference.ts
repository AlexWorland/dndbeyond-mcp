import { DdbClient } from "../api/client.js";
import { SpellSearchParams, MonsterSearchParams, ItemSearchParams, FeatSearchParams, RaceSearchParams, BackgroundSearchParams, ClassFeatureSearchParams, RacialTraitSearchParams } from "../types/reference.js";
import { DdbCharacter, DdbSpell } from "../types/character.js";
import { ENDPOINTS } from "../api/endpoints.js";

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

// --- Game config / enum lookup tables ---

interface GameConfig {
  challengeRatings: Array<{ id: number; value: number; xp: number; proficiencyBonus: number }>;
  monsterTypes: Array<{ id: number; name: string }>;
  environments: Array<{ id: number; name: string }>;
  alignments: Array<{ id: number; name: string }>;
  damageTypes: Array<{ id: number; name: string }>;
  senses: Array<{ id: number; name: string }>;
  sources?: Array<{ id: number; name: string }>;
}

const SIZE_MAP: Record<number, string> = {
  2: "Tiny", 3: "Small", 4: "Medium", 5: "Large", 6: "Huge", 7: "Gargantuan",
};

const STAT_NAMES: Record<number, string> = {
  1: "STR", 2: "DEX", 3: "CON", 4: "INT", 5: "WIS", 6: "CHA",
};

const MOVEMENT_NAMES: Record<number, string> = {
  1: "walk", 2: "burrow", 3: "climb", 4: "fly", 5: "swim",
};

// Hardcoded source book map as fallback if config doesn't have sources
const SOURCE_MAP: Record<string, number> = {
  "monster manual": 1,
  "volos guide": 2,
  "volos guide to monsters": 2,
  "mordenkainens tome": 3,
  "mordenkainens tome of foes": 3,
  "fizbans treasury": 4,
  "fizbans treasury of dragons": 4,
  "tomb of annihilation": 9,
  "curse of strahd": 1,
  "hoard of the dragon queen": 1,
  "princes of the apocalypse": 2,
  "out of the abyss": 2,
  "storm kings thunder": 3,
  "tales from the yawning portal": 7,
  "tomb of horrors": 9,
};

let cachedConfig: GameConfig | null = null;

async function getGameConfig(client: DdbClient): Promise<GameConfig> {
  if (cachedConfig) return cachedConfig;
  cachedConfig = await client.getRaw<GameConfig>(
    ENDPOINTS.config.json(),
    "game-config",
    86_400_000, // 24h
  );
  return cachedConfig;
}

// --- Monster service types ---

interface MonsterServiceResponse {
  accessType: Record<string, number>;
  pagination: { take: number; skip: number; currentPage: number; pages: number; total: number };
  data: DdbMonster[];
}

interface MonsterServiceSingleResponse {
  accessType: number;
  data: DdbMonster;
}

interface DdbMonster {
  id: number;
  name: string;
  alignmentId: number;
  sizeId: number;
  typeId: number;
  armorClass: number;
  armorClassDescription: string;
  averageHitPoints: number;
  hitPointDice: { diceCount: number; diceValue: number; fixedValue: number; diceString: string };
  passivePerception: number;
  challengeRatingId: number;
  isHomebrew: boolean;
  isLegendary: boolean;
  isMythic: boolean;
  isLegacy: boolean;
  url: string;
  avatarUrl: string;
  stats: Array<{ statId: number; value: number }>;
  skills: Array<{ skillId: number; value: number }>;
  senses: Array<{ senseId: number; notes: string }>;
  savingThrows: Array<{ statId: number; bonusModifier: number }>;
  movements: Array<{ movementId: number; speed: number; notes: string | null }>;
  languages: Array<{ languageId: number; notes: string }>;
  damageAdjustments: number[];
  conditionImmunities: number[];
  environments: number[];
  specialTraitsDescription: string;
  actionsDescription: string;
  reactionsDescription: string;
  legendaryActionsDescription: string;
  mythicActionsDescription: string;
  bonusActionsDescription: string;
  lairDescription: string;
  languageDescription: string;
  languageNote: string;
  sensesHtml: string;
  skillsHtml: string;
  conditionImmunitiesHtml: string;
}

// --- Spell compendium ---

// Class IDs for building the full spell compendium
const SPELLCASTING_CLASS_IDS = [1, 2, 3, 4, 5, 6, 7, 8]; // Bard through Wizard

/**
 * Loads the full spell compendium by querying always-known-spells and always-prepared-spells for all classes.
 * Queries both classLevel=1 (for cantrips/level 0 spells) and classLevel=20 (for levels 1-9).
 * Deduplicates by spell definition name.
 */
async function loadSpellCompendium(client: DdbClient): Promise<DdbSpell[]> {
  const allSpells = new Map<string, DdbSpell>();
  let failureCount = 0;
  const totalRequests = SPELLCASTING_CLASS_IDS.length * 4; // 2 for known, 2 for prepared

  for (const classId of SPELLCASTING_CLASS_IDS) {
    // Fetch cantrips (level 0) by querying at classLevel=1
    try {
      const cantrips = await client.get<DdbSpell[]>(
        ENDPOINTS.gameData.alwaysKnownSpells(classId, 1),
        `spell-compendium:class:${classId}:cantrips`,
        86_400_000, // 24h
      );

      for (const spell of cantrips ?? []) {
        if (spell.definition?.name && !allSpells.has(spell.definition.name)) {
          allSpells.set(spell.definition.name, spell);
        }
      }
    } catch {
      failureCount++;
    }

    // Fetch higher-level spells (levels 1-9) by querying at classLevel=20
    try {
      const spells = await client.get<DdbSpell[]>(
        ENDPOINTS.gameData.alwaysKnownSpells(classId, 20),
        `spell-compendium:class:${classId}`,
        86_400_000, // 24h
      );

      for (const spell of spells ?? []) {
        if (spell.definition?.name && !allSpells.has(spell.definition.name)) {
          allSpells.set(spell.definition.name, spell);
        }
      }
    } catch {
      failureCount++;
    }

    // Fetch always-prepared cantrips (level 0) by querying at classLevel=1
    try {
      const preparedCantrips = await client.get<DdbSpell[]>(
        ENDPOINTS.gameData.alwaysPreparedSpells(classId, 1),
        `spell-compendium:class:${classId}:prepared-cantrips`,
        86_400_000, // 24h
      );

      for (const spell of preparedCantrips ?? []) {
        if (spell.definition?.name && !allSpells.has(spell.definition.name)) {
          allSpells.set(spell.definition.name, spell);
        }
      }
    } catch {
      failureCount++;
    }

    // Fetch always-prepared spells (levels 1-9) by querying at classLevel=20
    try {
      const preparedSpells = await client.get<DdbSpell[]>(
        ENDPOINTS.gameData.alwaysPreparedSpells(classId, 20),
        `spell-compendium:class:${classId}:prepared`,
        86_400_000, // 24h
      );

      for (const spell of preparedSpells ?? []) {
        if (spell.definition?.name && !allSpells.has(spell.definition.name)) {
          allSpells.set(spell.definition.name, spell);
        }
      }
    } catch {
      failureCount++;
    }
  }

  if (failureCount === totalRequests) {
    throw new Error("Failed to load spell compendium: all API requests failed. Check your authentication or try again later.");
  }

  return Array.from(allSpells.values());
}

/**
 * Searches for spells matching the given parameters.
 * Uses the full spell compendium from always-known-spells endpoints.
 */
export async function searchSpells(
  client: DdbClient,
  params: SpellSearchParams,
  _characterIds?: number[]
): Promise<ToolResult> {
  let allSpells: DdbSpell[];
  try {
    allSpells = await loadSpellCompendium(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load spell compendium";
    return { content: [{ type: "text", text: message }] };
  }

  let matchedSpells = allSpells;

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matchedSpells = matchedSpells.filter((spell) =>
      spell.definition.name.toLowerCase().includes(searchName)
    );
  }

  if (params.level !== undefined) {
    matchedSpells = matchedSpells.filter(
      (spell) => spell.definition.level === params.level
    );
  }

  if (params.school) {
    const searchSchool = params.school.toLowerCase();
    matchedSpells = matchedSpells.filter((spell) =>
      spell.definition.school.toLowerCase().includes(searchSchool)
    );
  }

  if (params.concentration !== undefined) {
    matchedSpells = matchedSpells.filter(
      (spell) => spell.definition.concentration === params.concentration
    );
  }

  if (params.ritual !== undefined) {
    matchedSpells = matchedSpells.filter(
      (spell) => spell.definition.ritual === params.ritual
    );
  }

  // Sort by level then name
  matchedSpells.sort((a, b) => {
    if (a.definition.level !== b.definition.level) return a.definition.level - b.definition.level;
    return a.definition.name.localeCompare(b.definition.name);
  });

  if (matchedSpells.length === 0) {
    return {
      content: [{ type: "text", text: "No spells found matching the criteria." }],
    };
  }

  const lines = [`# Spell Search Results (${matchedSpells.length} found)\n`];
  for (const spell of matchedSpells) {
    const level = spell.definition.level === 0 ? "Cantrip" : `Level ${spell.definition.level}`;
    const tags = [];
    if (spell.definition.concentration) tags.push("Concentration");
    if (spell.definition.ritual) tags.push("Ritual");
    const tagStr = tags.length > 0 ? ` (${tags.join(", ")})` : "";

    lines.push(
      `- **${spell.definition.name}** — ${level}, ${spell.definition.school}${tagStr}`
    );
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

/**
 * Gets full details for a specific spell by name.
 */
export async function getSpell(
  client: DdbClient,
  params: { spellName: string },
  _characterIds?: number[]
): Promise<ToolResult> {
  const searchName = params.spellName.toLowerCase();
  let allSpells: DdbSpell[];
  try {
    allSpells = await loadSpellCompendium(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load spell compendium";
    return { content: [{ type: "text", text: message }] };
  }

  // Exact match first, then partial
  let spell = allSpells.find(
    (s) => s.definition.name.toLowerCase() === searchName
  );
  if (!spell) {
    spell = allSpells.find(
      (s) => s.definition.name.toLowerCase().includes(searchName)
    );
  }

  if (!spell) {
    return {
      content: [
        { type: "text", text: `Spell "${params.spellName}" not found in the compendium.` },
      ],
    };
  }

  return formatSpellDetails(spell);
}

function formatSpellDetails(spell: DdbSpell): ToolResult {
  const def = spell.definition;

  const level = def.level === 0 ? "Cantrip" : `${def.level}${getOrdinalSuffix(def.level)}-level`;

  const componentMap = { 1: "V", 2: "S", 3: "M" };
  const components = (def.components ?? [])
    .map((c) => componentMap[c as keyof typeof componentMap])
    .filter(Boolean)
    .join(", ");

  const ACTIVATION_TYPES: Record<number, string> = {
    0: "No Action",
    1: "Action",
    2: "No Action",
    3: "Bonus Action",
    4: "Reaction",
    5: "Special",
    6: "Minute",
    7: "Hour",
    8: "Special",
  };
  const castingTime = def.activation
    ? `${def.activation.activationTime} ${ACTIVATION_TYPES[def.activation.activationType] ?? "Action"}`
    : "1 Action";

  let range = "Self";
  if (def.range) {
    range = def.range.rangeValue && def.range.origin !== "Self"
      ? `${def.range.rangeValue} ft`
      : def.range.origin;
    if (def.range.aoeType && def.range.aoeValue) {
      range += ` (${def.range.aoeValue}-ft ${def.range.aoeType})`;
    }
  }

  let duration = "Instantaneous";
  if (def.duration) {
    const interval = def.duration.durationInterval;
    const unit = def.duration.durationUnit;
    if (interval && unit) {
      duration = `${def.concentration ? "Concentration, up to " : ""}${interval} ${unit}${interval > 1 ? "s" : ""}`;
    } else if (def.duration.durationType === "Concentration") {
      duration = "Concentration";
    }
  }

  const tags = [];
  if (def.concentration) tags.push("Concentration");
  if (def.ritual) tags.push("Ritual");
  const tagStr = tags.length > 0 ? ` (${tags.join(", ")})` : "";

  const lines = [
    `# ${def.name}`,
    `*${level} ${def.school}${tagStr}*\n`,
    `**Casting Time:** ${castingTime}`,
    `**Range:** ${range}`,
    `**Components:** ${components}`,
    `**Duration:** ${duration}\n`,
    stripHtml(def.description),
  ];

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// --- Monster tools ---

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Search for monsters by name.
 * When CR/type/size filters are provided without a name search, fetches multiple pages
 * to improve match reliability (up to 200 monsters across 10 pages).
 */
export async function searchMonsters(
  client: DdbClient,
  params: MonsterSearchParams
): Promise<ToolResult> {
  const searchTerm = params.name || "";
  const hasFilters = params.cr !== undefined || params.type !== undefined || params.size !== undefined;
  const shouldPaginate = hasFilters && !searchTerm;

  const config = await getGameConfig(client);
  const crMap = new Map(config.challengeRatings.map((cr) => [cr.id, cr]));
  const typeMap = new Map(config.monsterTypes.map((t) => [t.id, t.name]));

  // Resolve source name to ID if provided
  let sourceId: string | undefined;
  if (params.source) {
    const sourceLower = params.source.toLowerCase().trim();

    // Try config sources first
    if (config.sources) {
      const configSource = config.sources.find((s) =>
        s.name.toLowerCase().includes(sourceLower) || sourceLower.includes(s.name.toLowerCase())
      );
      if (configSource) {
        sourceId = configSource.id.toString();
      }
    }

    // Fallback to hardcoded map
    if (!sourceId) {
      const mappedId = SOURCE_MAP[sourceLower];
      if (mappedId) {
        sourceId = mappedId.toString();
      }
    }
  }

  let allMonsters: DdbMonster[] = [];
  let totalInDataset = 0;
  let pagesSearched = 0;
  const maxPages = shouldPaginate ? 10 : 1; // Fetch up to 10 pages (200 results) when filtering

  // Fetch multiple pages if we're filtering without a name search
  for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
    const skip = pageIdx * 20;
    const url = ENDPOINTS.monster.search(searchTerm, skip, 20, params.showHomebrew, sourceId);
    const cacheKey = `monsters:search:${searchTerm}:${skip}:${params.showHomebrew ?? false}:${sourceId ?? ""}`;

    try {
      const response = await client.getRaw<MonsterServiceResponse>(url, cacheKey, 86_400_000);
      totalInDataset = response.pagination.total;

      if (!response.data || response.data.length === 0) {
        break; // No more results
      }

      allMonsters.push(...response.data);
      pagesSearched++;

      // Stop if we've reached the end of available data
      if (allMonsters.length >= totalInDataset) {
        break;
      }
    } catch {
      break; // Stop on error
    }
  }

  let monsters = allMonsters;

  // Client-side filter by CR if requested
  if (params.cr !== undefined) {
    const targetCr = config.challengeRatings.find((cr) => cr.value === params.cr);
    if (targetCr) {
      monsters = monsters.filter((m) => m.challengeRatingId === targetCr.id);
    }
  }

  // Client-side filter by type if requested
  if (params.type) {
    const searchType = params.type.toLowerCase();
    monsters = monsters.filter((m) => {
      const typeName = typeMap.get(m.typeId)?.toLowerCase() ?? "";
      return typeName.includes(searchType);
    });
  }

  // Client-side filter by size if requested
  if (params.size) {
    const searchSize = params.size.toLowerCase();
    monsters = monsters.filter((m) => {
      const sizeName = SIZE_MAP[m.sizeId]?.toLowerCase() ?? "";
      return sizeName.includes(searchSize);
    });
  }

  if (monsters.length === 0) {
    const hint = shouldPaginate
      ? "\n\nNote: CR/type/size filters were applied to a limited dataset. For best results, combine filters with a name search term."
      : "";
    return {
      content: [{ type: "text", text: `No monsters found matching the search criteria.${hint}` }],
    };
  }

  const searchInfo = shouldPaginate
    ? `searched ${allMonsters.length} of ${totalInDataset} total monsters across ${pagesSearched} pages`
    : `showing results from page 1`;

  const lines = [`# Monster Search Results (${monsters.length} matches, ${searchInfo})\n`];

  if (shouldPaginate && allMonsters.length < totalInDataset) {
    lines.push(`*Note: Filters applied to the first ${allMonsters.length} monsters. For comprehensive results, add a name search term.*\n`);
  }

  for (const m of monsters) {
    const cr = crMap.get(m.challengeRatingId);
    const crStr = cr ? (cr.value < 1 ? `${cr.value}` : `${cr.value}`) : "?";
    const typeName = typeMap.get(m.typeId) ?? "Unknown";
    const sizeName = SIZE_MAP[m.sizeId] ?? "Unknown";
    const homebrewTag = m.isHomebrew ? " [Homebrew]" : "";

    lines.push(
      `- **${m.name}**${homebrewTag} — CR ${crStr}, ${sizeName} ${typeName}, AC ${m.armorClass}, ${m.averageHitPoints} HP${m.isLegendary ? " ★" : ""}`
    );
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

/**
 * Get full stat block for a specific monster by name.
 */
export async function getMonster(
  client: DdbClient,
  params: { monsterName: string }
): Promise<ToolResult> {
  // Search for the monster by name
  const searchUrl = ENDPOINTS.monster.search(params.monsterName, 0, 5);
  const searchCacheKey = `monsters:search:${params.monsterName.toLowerCase()}`;
  const searchResponse = await client.getRaw<MonsterServiceResponse>(searchUrl, searchCacheKey, 86_400_000);

  if (!searchResponse.data || searchResponse.data.length === 0) {
    return {
      content: [{ type: "text", text: `Monster "${params.monsterName}" not found.` }],
    };
  }

  // Find best match (exact first, then partial)
  const searchName = params.monsterName.toLowerCase();
  let monster = searchResponse.data.find(
    (m) => m.name.toLowerCase() === searchName
  );
  if (!monster) {
    monster = searchResponse.data[0];
  }

  // Fetch full details by ID
  const detailUrl = ENDPOINTS.monster.get(monster.id);
  const detailCacheKey = `monster:${monster.id}`;
  const detailResponse = await client.getRaw<MonsterServiceSingleResponse>(detailUrl, detailCacheKey, 86_400_000);

  const m = detailResponse.data;
  if (!m) {
    return {
      content: [{ type: "text", text: `Monster "${params.monsterName}" not found.` }],
    };
  }

  const config = await getGameConfig(client);
  const crMap = new Map(config.challengeRatings.map((cr) => [cr.id, cr]));
  const typeMap = new Map(config.monsterTypes.map((t) => [t.id, t.name]));
  const alignMap = new Map(config.alignments.map((a) => [a.id, a.name]));
  const senseMap = new Map(config.senses.map((s) => [s.id, s.name]));

  const cr = crMap.get(m.challengeRatingId);
  const crStr = cr ? `${cr.value}` : "?";
  const xp = cr?.xp ?? 0;
  const typeName = typeMap.get(m.typeId) ?? "Unknown";
  const sizeName = SIZE_MAP[m.sizeId] ?? "Unknown";
  const alignment = alignMap.get(m.alignmentId) ?? "Unaligned";

  const lines: string[] = [];
  lines.push(`# ${m.name}`);
  lines.push(`*${sizeName} ${typeName}, ${alignment}*\n`);

  lines.push(`**Armor Class** ${m.armorClass}${m.armorClassDescription ? " " + m.armorClassDescription.trim() : ""}`);
  lines.push(`**Hit Points** ${m.averageHitPoints}${m.hitPointDice?.diceString ? " (" + m.hitPointDice.diceString + ")" : ""}`);

  // Speed
  if (m.movements && m.movements.length > 0) {
    const speeds = m.movements.map((mv) => {
      const name = MOVEMENT_NAMES[mv.movementId] ?? "walk";
      return name === "walk" ? `${mv.speed} ft.` : `${name} ${mv.speed} ft.`;
    });
    lines.push(`**Speed** ${speeds.join(", ")}`);
  }

  // Ability scores
  if (m.stats && m.stats.length > 0) {
    lines.push("");
    const statLine = m.stats
      .sort((a, b) => a.statId - b.statId)
      .map((s) => `**${STAT_NAMES[s.statId]}** ${s.value} (${abilityMod(s.value)})`)
      .join(" | ");
    lines.push(statLine);
  }

  lines.push("");

  // Saving throws
  if (m.savingThrows && m.savingThrows.length > 0) {
    const saves = m.savingThrows
      .map((s) => `${STAT_NAMES[s.statId]} +${s.bonusModifier}`)
      .join(", ");
    lines.push(`**Saving Throws** ${saves}`);
  }

  // Skills
  if (m.skillsHtml) {
    lines.push(`**Skills** ${stripHtml(m.skillsHtml)}`);
  }

  // Senses
  if (m.senses && m.senses.length > 0) {
    const senseStrs = m.senses.map((s) => {
      const name = senseMap.get(s.senseId) ?? "Unknown";
      return `${name} ${s.notes}`;
    });
    senseStrs.push(`passive Perception ${m.passivePerception}`);
    lines.push(`**Senses** ${senseStrs.join(", ")}`);
  } else {
    lines.push(`**Senses** passive Perception ${m.passivePerception}`);
  }

  // Languages
  if (m.languageDescription) {
    lines.push(`**Languages** ${m.languageDescription}${m.languageNote ? " " + m.languageNote : ""}`);
  }

  // CR
  lines.push(`**Challenge** ${crStr} (${xp.toLocaleString()} XP)`);

  // Traits
  if (m.specialTraitsDescription) {
    lines.push("\n---\n");
    lines.push(stripHtml(m.specialTraitsDescription));
  }

  // Actions
  if (m.actionsDescription) {
    lines.push("\n## Actions\n");
    lines.push(stripHtml(m.actionsDescription));
  }

  // Bonus Actions
  if (m.bonusActionsDescription) {
    lines.push("\n## Bonus Actions\n");
    lines.push(stripHtml(m.bonusActionsDescription));
  }

  // Reactions
  if (m.reactionsDescription) {
    lines.push("\n## Reactions\n");
    lines.push(stripHtml(m.reactionsDescription));
  }

  // Legendary Actions
  if (m.legendaryActionsDescription) {
    lines.push("\n## Legendary Actions\n");
    lines.push(stripHtml(m.legendaryActionsDescription));
  }

  // Mythic Actions
  if (m.mythicActionsDescription) {
    lines.push("\n## Mythic Actions\n");
    lines.push(stripHtml(m.mythicActionsDescription));
  }

  // Restricted content notice
  if (detailResponse.accessType === 4 && (!m.stats || m.stats.length === 0)) {
    lines.push("\n---\n*This monster's full stat block requires content ownership on D&D Beyond.*");
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Item types ---

interface DdbItem {
  id: number;
  name: string;
  type: string;
  filterType: string;
  rarity: string;
  requiresAttunement: boolean;
  attunementDescription: string;
  description: string;
  snippet: string;
  weight: number;
  cost: number | null;
  armorClass: number | null;
  damage: { diceString: string } | null;
  properties: Array<{ name: string }> | null;
  isHomebrew: boolean;
  sources: Array<{ sourceId: number }>;
  canAttune: boolean;
  magic: boolean;
}

/**
 * Search for items by name, rarity, or type.
 */
export async function searchItems(
  client: DdbClient,
  params: ItemSearchParams
): Promise<ToolResult> {
  const cacheKey = "game-data:items";
  const items = await client.get<DdbItem[]>(
    ENDPOINTS.gameData.items(),
    cacheKey,
    86_400_000,
  );

  let matched = items ?? [];

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matched = matched.filter((i) => i.name.toLowerCase().includes(searchName));
  }

  if (params.rarity) {
    const searchRarity = params.rarity.toLowerCase();
    matched = matched.filter((i) => i.rarity?.toLowerCase().includes(searchRarity));
  }

  if (params.type) {
    const searchType = params.type.toLowerCase();
    matched = matched.filter(
      (i) =>
        i.type?.toLowerCase().includes(searchType) ||
        i.filterType?.toLowerCase().includes(searchType)
    );
  }

  // Sort by name
  matched.sort((a, b) => a.name.localeCompare(b.name));

  // Limit results
  const total = matched.length;
  matched = matched.slice(0, 30);

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No items found matching the search criteria." }],
    };
  }

  const lines = [`# Item Search Results (${total > 30 ? `showing 30 of ${total}` : `${total} found`})\n`];
  for (const item of matched) {
    const attune = item.requiresAttunement ? " (attunement)" : "";
    lines.push(`- **${item.name}** — ${item.rarity || "Common"} ${item.filterType || item.type || ""}${attune}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

/**
 * Get full details for a specific item by name.
 */
export async function getItem(
  client: DdbClient,
  params: { itemName: string }
): Promise<ToolResult> {
  const cacheKey = "game-data:items";
  const items = await client.get<DdbItem[]>(
    ENDPOINTS.gameData.items(),
    cacheKey,
    86_400_000,
  );

  const searchName = params.itemName.toLowerCase();
  let item = (items ?? []).find((i) => i.name.toLowerCase() === searchName);
  if (!item) {
    item = (items ?? []).find((i) => i.name.toLowerCase().includes(searchName));
  }

  if (!item) {
    return {
      content: [{ type: "text", text: `Item "${params.itemName}" not found.` }],
    };
  }

  const lines: string[] = [];
  lines.push(`# ${item.name}`);
  lines.push(`*${item.filterType || item.type || "Item"}, ${item.rarity || "common"}*\n`);

  if (item.requiresAttunement) {
    lines.push(`**Requires Attunement**${item.attunementDescription ? " " + item.attunementDescription : ""}`);
  }

  if (item.weight) lines.push(`**Weight:** ${item.weight} lb.`);
  if (item.armorClass) lines.push(`**AC:** ${item.armorClass}`);
  if (item.damage?.diceString) lines.push(`**Damage:** ${item.damage.diceString}`);

  if (item.properties && item.properties.length > 0) {
    lines.push(`**Properties:** ${item.properties.map((p) => p.name).join(", ")}`);
  }

  lines.push("");
  lines.push(stripHtml(item.description || item.snippet || "No description available."));

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Feat types ---

interface DdbFeat {
  id: number;
  name: string;
  description: string;
  snippet: string;
  prerequisite: string | null;
  isHomebrew: boolean;
  sources: Array<{ sourceId: number }>;
}

/**
 * Search for feats by name.
 */
export async function searchFeats(
  client: DdbClient,
  params: FeatSearchParams
): Promise<ToolResult> {
  const cacheKey = "game-data:feats";
  const feats = await client.get<DdbFeat[]>(
    ENDPOINTS.gameData.feats(),
    cacheKey,
    86_400_000,
  );

  let matched = feats ?? [];

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matched = matched.filter((f) => f.name.toLowerCase().includes(searchName));
  }

  if (params.prerequisite) {
    const searchPrereq = params.prerequisite.toLowerCase();
    matched = matched.filter(
      (f) => f.prerequisite?.toLowerCase().includes(searchPrereq)
    );
  }

  matched.sort((a, b) => a.name.localeCompare(b.name));

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No feats found matching the search criteria." }],
    };
  }

  const lines = [`# Feat Search Results (${matched.length} found)\n`];
  for (const feat of matched) {
    const prereq = feat.prerequisite ? ` (Prerequisite: ${feat.prerequisite})` : "";
    const desc = feat.snippet || feat.description || "";
    const shortDesc = stripHtml(desc).substring(0, 80);
    lines.push(`- **${feat.name}**${prereq} — ${shortDesc}${shortDesc.length >= 80 ? "..." : ""}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Condition lookup ---

// Standard D&D 5e conditions with rules text
const CONDITIONS: Record<string, { name: string; description: string; effects: string[] }> = {
  blinded: {
    name: "Blinded",
    description: "A blinded creature can't see and automatically fails any ability check that requires sight.",
    effects: [
      "Attack rolls against the creature have advantage.",
      "The creature's attack rolls have disadvantage.",
    ],
  },
  charmed: {
    name: "Charmed",
    description: "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.",
    effects: [
      "The charmer has advantage on any ability check to interact socially with the creature.",
    ],
  },
  deafened: {
    name: "Deafened",
    description: "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    effects: [],
  },
  exhaustion: {
    name: "Exhaustion",
    description: "Exhaustion is measured in six levels. An effect can give a creature one or more levels of exhaustion.",
    effects: [
      "Level 1: Disadvantage on ability checks",
      "Level 2: Speed halved",
      "Level 3: Disadvantage on attack rolls and saving throws",
      "Level 4: Hit point maximum halved",
      "Level 5: Speed reduced to 0",
      "Level 6: Death",
    ],
  },
  frightened: {
    name: "Frightened",
    description: "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.",
    effects: [
      "The creature can't willingly move closer to the source of its fear.",
    ],
  },
  grappled: {
    name: "Grappled",
    description: "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
    effects: [
      "The condition ends if the grappler is incapacitated.",
      "The condition also ends if an effect removes the grappled creature from the reach of the grappler.",
    ],
  },
  incapacitated: {
    name: "Incapacitated",
    description: "An incapacitated creature can't take actions or reactions.",
    effects: [],
  },
  invisible: {
    name: "Invisible",
    description: "An invisible creature is impossible to see without the aid of magic or a special sense.",
    effects: [
      "The creature is heavily obscured for the purpose of hiding (can always try to hide).",
      "Attack rolls against the creature have disadvantage.",
      "The creature's attack rolls have advantage.",
    ],
  },
  paralyzed: {
    name: "Paralyzed",
    description: "A paralyzed creature is incapacitated and can't move or speak.",
    effects: [
      "The creature automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
      "Any attack that hits the creature is a critical hit if the attacker is within 5 feet.",
    ],
  },
  petrified: {
    name: "Petrified",
    description: "A petrified creature is transformed, along with any nonmagical objects it is wearing or carrying, into a solid inanimate substance (usually stone).",
    effects: [
      "Its weight increases by a factor of ten, and it ceases aging.",
      "The creature is incapacitated, can't move or speak, and is unaware of its surroundings.",
      "Attack rolls against the creature have advantage.",
      "The creature automatically fails Strength and Dexterity saving throws.",
      "The creature has resistance to all damage.",
      "The creature is immune to poison and disease.",
    ],
  },
  poisoned: {
    name: "Poisoned",
    description: "A poisoned creature has disadvantage on attack rolls and ability checks.",
    effects: [],
  },
  prone: {
    name: "Prone",
    description: "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.",
    effects: [
      "The creature has disadvantage on attack rolls.",
      "An attack roll against the creature has advantage if the attacker is within 5 feet; otherwise, the attack roll has disadvantage.",
    ],
  },
  restrained: {
    name: "Restrained",
    description: "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
    effects: [
      "Attack rolls against the creature have advantage.",
      "The creature's attack rolls have disadvantage.",
      "The creature has disadvantage on Dexterity saving throws.",
    ],
  },
  stunned: {
    name: "Stunned",
    description: "A stunned creature is incapacitated, can't move, and can speak only falteringly.",
    effects: [
      "The creature automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
    ],
  },
  unconscious: {
    name: "Unconscious",
    description: "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings.",
    effects: [
      "The creature drops whatever it's holding and falls prone.",
      "The creature automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
      "Any attack that hits the creature is a critical hit if the attacker is within 5 feet.",
    ],
  },
};

/**
 * Get the rules text for a specific condition.
 */
export async function getCondition(
  _client: DdbClient,
  params: { conditionName: string }
): Promise<ToolResult> {
  const searchName = params.conditionName.toLowerCase().trim();
  const condition = CONDITIONS[searchName];

  if (!condition) {
    // Try partial match
    const match = Object.values(CONDITIONS).find(
      (c) => c.name.toLowerCase().includes(searchName)
    );
    if (match) {
      return formatConditionDetails(match);
    }

    const available = Object.values(CONDITIONS).map((c) => c.name).join(", ");
    return {
      content: [
        { type: "text", text: `Condition "${params.conditionName}" not found.\n\nAvailable conditions: ${available}` },
      ],
    };
  }

  return formatConditionDetails(condition);
}

function formatConditionDetails(condition: { name: string; description: string; effects: string[] }): ToolResult {
  const lines: string[] = [];
  lines.push(`# ${condition.name}`);
  lines.push("");
  lines.push(condition.description);

  if (condition.effects.length > 0) {
    lines.push("");
    for (const effect of condition.effects) {
      lines.push(`- ${effect}`);
    }
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Class search ---

interface DdbClass {
  id: number;
  name: string;
  description: string;
  hitDice: number;
  isHomebrew: boolean;
  spellCastingAbilityId: number | null;
  subclasses?: Array<{ id: number; name: string; description: string }>;
  sources: Array<{ sourceId: number }>;
  classFeatures?: Array<{ id: number; name: string; description: string; level: number }>;
}

/**
 * Search for character classes.
 */
export async function searchClasses(
  client: DdbClient,
  params: { className?: string }
): Promise<ToolResult> {
  const cacheKey = "game-data:classes";
  const classes = await client.get<DdbClass[]>(
    ENDPOINTS.gameData.classes(),
    cacheKey,
    86_400_000,
  );

  let matched = classes ?? [];

  if (params.className) {
    const searchName = params.className.toLowerCase();
    matched = matched.filter((c) => c.name.toLowerCase().includes(searchName));
  }

  matched.sort((a, b) => a.name.localeCompare(b.name));

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No classes found matching the search criteria." }],
    };
  }

  const lines = [`# Class Search Results (${matched.length} found)\n`];
  for (const cls of matched) {
    const hitDie = cls.hitDice ? `d${cls.hitDice}` : "?";
    const spellcasting = cls.spellCastingAbilityId
      ? ` | Spellcasting: ${STAT_NAMES[cls.spellCastingAbilityId] || "Yes"}`
      : "";
    lines.push(`- **${cls.name}** — Hit Die: ${hitDie}${spellcasting}`);

    const desc = stripHtml(cls.description || "").substring(0, 100);
    if (desc) lines.push(`  ${desc}${desc.length >= 100 ? "..." : ""}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Race types ---

interface DdbRace {
  id: number;
  name: string;
  description: string;
  isHomebrew: boolean;
  sources: Array<{ sourceId: number }>;
}

/**
 * Search for character races.
 */
export async function searchRaces(
  client: DdbClient,
  params: RaceSearchParams
): Promise<ToolResult> {
  const cacheKey = "game-data:races";
  const races = await client.get<DdbRace[]>(
    ENDPOINTS.gameData.races(),
    cacheKey,
    86_400_000,
  );

  let matched = (races ?? []).filter((r) => r.name);

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matched = matched.filter((r) => r.name.toLowerCase().includes(searchName));
  }

  matched.sort((a, b) => a.name.localeCompare(b.name));

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No races found matching the search criteria." }],
    };
  }

  const lines = [`# Race Search Results (${matched.length} found)\n`];
  for (const race of matched) {
    const desc = stripHtml(race.description || "").substring(0, 100);
    lines.push(`- **${race.name}** — ${desc}${desc.length >= 100 ? "..." : ""}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Background types ---

interface DdbBackground {
  id: number;
  name: string;
  description: string;
  isHomebrew: boolean;
  sources: Array<{ sourceId: number }>;
}

/**
 * Search for character backgrounds.
 */
export async function searchBackgrounds(
  client: DdbClient,
  params: BackgroundSearchParams
): Promise<ToolResult> {
  const cacheKey = "game-data:backgrounds";
  const backgrounds = await client.get<DdbBackground[]>(
    ENDPOINTS.gameData.backgrounds(),
    cacheKey,
    86_400_000,
  );

  let matched = backgrounds ?? [];

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matched = matched.filter((b) => b.name.toLowerCase().includes(searchName));
  }

  matched.sort((a, b) => a.name.localeCompare(b.name));

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No backgrounds found matching the search criteria." }],
    };
  }

  const lines = [`# Background Search Results (${matched.length} found)\n`];
  for (const bg of matched) {
    const desc = stripHtml(bg.description || "").substring(0, 100);
    lines.push(`- **${bg.name}** — ${desc}${desc.length >= 100 ? "..." : ""}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Class feature types ---

interface DdbClassFeature {
  id: number;
  name: string;
  description: string;
  snippet: string;
  requiredLevel: number;
  classId: number;
  className?: string;
  isHomebrew: boolean;
  sources: Array<{ sourceId: number }>;
}

/**
 * Search for class features by name, class, or level.
 */
export async function searchClassFeatures(
  client: DdbClient,
  params: ClassFeatureSearchParams
): Promise<ToolResult> {
  const cacheKey = "game-data:class-features";
  const features = await client.get<DdbClassFeature[]>(
    ENDPOINTS.gameData.classFeatureCollection(),
    cacheKey,
    86_400_000,
  );

  let matched = features ?? [];

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matched = matched.filter((f) => f.name.toLowerCase().includes(searchName));
  }

  if (params.className) {
    const searchClass = params.className.toLowerCase();
    matched = matched.filter(
      (f) => f.className?.toLowerCase().includes(searchClass)
    );
  }

  if (params.level !== undefined) {
    matched = matched.filter((f) => f.requiredLevel === params.level);
  }

  matched.sort((a, b) => {
    // Sort by class name, then by level, then by feature name
    const classComp = (a.className || "").localeCompare(b.className || "");
    if (classComp !== 0) return classComp;
    if (a.requiredLevel !== b.requiredLevel) return a.requiredLevel - b.requiredLevel;
    return a.name.localeCompare(b.name);
  });

  const total = matched.length;
  matched = matched.slice(0, 30);

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No class features found matching the search criteria." }],
    };
  }

  const lines = [`# Class Feature Search Results (${total > 30 ? `showing 30 of ${total}` : `${total} found`})\n`];
  for (const feature of matched) {
    const className = feature.className || "Unknown";
    const level = feature.requiredLevel || "?";
    lines.push(`- **${feature.name}** — ${className} level ${level}`);

    const desc = stripHtml(feature.snippet || feature.description || "").substring(0, 100);
    if (desc) lines.push(`  ${desc}${desc.length >= 100 ? "..." : ""}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

// --- Racial trait types ---

interface DdbRacialTrait {
  id: number;
  name: string;
  description: string;
  snippet: string;
  raceId: number;
  raceName?: string;
  isHomebrew: boolean;
  sources: Array<{ sourceId: number }>;
}

/**
 * Search for racial traits by name or race.
 */
export async function searchRacialTraits(
  client: DdbClient,
  params: RacialTraitSearchParams
): Promise<ToolResult> {
  const cacheKey = "game-data:racial-traits";
  const traits = await client.get<DdbRacialTrait[]>(
    ENDPOINTS.gameData.racialTraitCollection(),
    cacheKey,
    86_400_000,
  );

  let matched = traits ?? [];

  if (params.name) {
    const searchName = params.name.toLowerCase();
    matched = matched.filter((t) => t.name.toLowerCase().includes(searchName));
  }

  if (params.raceName) {
    const searchRace = params.raceName.toLowerCase();
    matched = matched.filter(
      (t) => t.raceName?.toLowerCase().includes(searchRace)
    );
  }

  matched.sort((a, b) => {
    // Sort by race name, then by trait name
    const raceComp = (a.raceName || "").localeCompare(b.raceName || "");
    if (raceComp !== 0) return raceComp;
    return a.name.localeCompare(b.name);
  });

  const total = matched.length;
  matched = matched.slice(0, 30);

  if (matched.length === 0) {
    return {
      content: [{ type: "text", text: "No racial traits found matching the search criteria." }],
    };
  }

  const lines = [`# Racial Trait Search Results (${total > 30 ? `showing 30 of ${total}` : `${total} found`})\n`];
  for (const trait of matched) {
    const raceName = trait.raceName || "Unknown";
    lines.push(`- **${trait.name}** — ${raceName}`);

    const desc = stripHtml(trait.snippet || trait.description || "").substring(0, 100);
    if (desc) lines.push(`  ${desc}${desc.length >= 100 ? "..." : ""}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
