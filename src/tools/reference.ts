import { DdbClient } from "../api/client.js";
import { SpellSearchParams, MonsterSearchParams, ItemSearchParams, FeatSearchParams } from "../types/reference.js";
import { DdbCharacter, DdbSpell } from "../types/character.js";
import { ENDPOINTS } from "../api/endpoints.js";

interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Searches for spells matching the given parameters.
 * Since D&D Beyond doesn't have a dedicated spell search endpoint,
 * this implementation searches through all characters' spells.
 */
export async function searchSpells(
  client: DdbClient,
  params: SpellSearchParams,
  characterIds: number[]
): Promise<ToolResult> {
  const allSpells = new Map<number, DdbSpell>();

  // Collect spells from all characters
  for (const characterId of characterIds) {
    try {
      const character = await client.get<DdbCharacter>(
        ENDPOINTS.character.get(characterId),
        `character:${characterId}`,
        300000 // 5 minutes
      );

      // Aggregate spells from all sources
      const spellSources = [
        character.spells.race,
        character.spells.class,
        character.spells.background,
        character.spells.item,
        character.spells.feat,
      ];

      for (const spells of spellSources) {
        for (const spell of spells) {
          allSpells.set(spell.id, spell);
        }
      }
    } catch (error) {
      // Continue collecting from other characters
      continue;
    }
  }

  // Filter spells based on search params
  let matchedSpells = Array.from(allSpells.values());

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

  // Format results
  if (matchedSpells.length === 0) {
    return {
      content: [{ type: "text", text: "No spells found matching the criteria." }],
    };
  }

  const lines = ["# Spell Search Results\n"];
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
  characterIds: number[]
): Promise<ToolResult> {
  const searchName = params.spellName.toLowerCase();

  // Search through all characters' spells
  for (const characterId of characterIds) {
    try {
      const character = await client.get<DdbCharacter>(
        ENDPOINTS.character.get(characterId),
        `character:${characterId}`,
        300000 // 5 minutes
      );

      const spellSources = [
        character.spells.race,
        character.spells.class,
        character.spells.background,
        character.spells.item,
        character.spells.feat,
      ];

      for (const spells of spellSources) {
        const spell = spells.find(
          (s) => s.definition.name.toLowerCase() === searchName
        );
        if (spell) {
          return formatSpellDetails(spell);
        }
      }
    } catch (error) {
      // Continue searching in other characters
      continue;
    }
  }

  return {
    content: [
      {
        type: "text",
        text: `Spell "${params.spellName}" not found in any character's spell list.`,
      },
    ],
  };
}

function formatSpellDetails(spell: DdbSpell): ToolResult {
  const def = spell.definition;

  // Format level
  const level = def.level === 0 ? "Cantrip" : `${def.level}${getOrdinalSuffix(def.level)}-level`;

  // Format components
  const componentMap = { 1: "V", 2: "S", 3: "M" };
  const components = def.components
    .map((c) => componentMap[c as keyof typeof componentMap])
    .filter(Boolean)
    .join(", ");

  // Format casting time
  const castingTime = `${def.castingTime.castingTimeInterval} action${def.castingTime.castingTimeInterval !== 1 ? "s" : ""}`;

  // Format range
  const range = def.range.value
    ? `${def.range.value} ${def.range.origin}`
    : def.range.origin;

  // Format duration
  const duration = def.duration.durationInterval
    ? `${def.duration.durationInterval} ${def.duration.durationType}`
    : def.duration.durationType;

  // Build tags
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
    def.description,
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

// Monster types
interface Monster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number;
  hitPoints: number;
  speed: Record<string, number>;
  abilityScores: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  skills?: Record<string, number>;
  senses?: Record<string, string>;
  languages?: string[];
  challengeRating: number;
  traits?: Array<{ name: string; description: string }>;
  actions?: Array<{ name: string; description: string }>;
  reactions?: Array<{ name: string; description: string }>;
  legendaryActions?: Array<{ name: string; description: string }>;
  environment?: string[];
}

// Item types
interface Item {
  name: string;
  type: string;
  rarity: string;
  requiresAttunement: boolean;
  description: string;
  properties?: string[];
  weight?: number;
}

// Feat types
interface Feat {
  name: string;
  prerequisite?: string;
  description: string;
  effects?: string[];
}

// Condition types
interface Condition {
  name: string;
  description: string;
  effects?: string[];
}

// Class types
interface CharacterClass {
  name: string;
  description: string;
  hitDie: number;
  primaryAbility: string[];
  savingThrows: string[];
  subclasses?: Array<{ name: string; description: string }>;
}

const REFERENCE_TTL = 86400000; // 24 hours in milliseconds

/**
 * Search for monsters by name, CR, type, size.
 */
export async function searchMonsters(
  client: DdbClient,
  params: MonsterSearchParams
): Promise<ToolResult> {
  const cacheKey = `monsters:search:${JSON.stringify(params)}`;

  // For now, return a placeholder since we don't have actual D&D Beyond endpoints
  // In production, this would call the actual API endpoint
  const monsters: Monster[] = [];

  const formattedResults =
    monsters.length > 0
      ? monsters
          .map(
            (m) =>
              `${m.name} - CR ${m.challengeRating}, ${m.size} ${m.type}, AC ${m.armorClass}`
          )
          .join("\n")
      : "No monsters found matching the search criteria.";

  return {
    content: [
      {
        type: "text",
        text: `# Monster Search Results\n\n${formattedResults}`,
      },
    ],
  };
}

/**
 * Get full stat block for a specific monster.
 */
export async function getMonster(
  client: DdbClient,
  params: { monsterName: string }
): Promise<ToolResult> {
  const cacheKey = `monster:${params.monsterName.toLowerCase()}`;

  // Placeholder for actual API call
  const monster: Monster | null = null;

  if (!monster) {
    return {
      content: [
        {
          type: "text",
          text: `Monster "${params.monsterName}" not found.`,
        },
      ],
    };
  }

  const statBlock = formatMonsterStatBlock(monster);

  return {
    content: [
      {
        type: "text",
        text: statBlock,
      },
    ],
  };
}

/**
 * Format a monster's stat block as readable text.
 */
function formatMonsterStatBlock(monster: Monster): string {
  const lines: string[] = [];

  lines.push(`=== ${monster.name.toUpperCase()} ===`);
  lines.push("");
  lines.push(`${monster.size} ${monster.type}, ${monster.alignment}`);
  lines.push("");

  lines.push(`Armor Class: ${monster.armorClass}`);
  lines.push(`Hit Points: ${monster.hitPoints}`);

  const speeds = Object.entries(monster.speed)
    .map(([type, value]) => `${type} ${value} ft.`)
    .join(", ");
  lines.push(`Speed: ${speeds}`);
  lines.push("");

  lines.push("STR  DEX  CON  INT  WIS  CHA");
  lines.push(
    `${monster.abilityScores.strength.toString().padStart(2)}   ` +
      `${monster.abilityScores.dexterity.toString().padStart(2)}   ` +
      `${monster.abilityScores.constitution.toString().padStart(2)}   ` +
      `${monster.abilityScores.intelligence.toString().padStart(2)}   ` +
      `${monster.abilityScores.wisdom.toString().padStart(2)}   ` +
      `${monster.abilityScores.charisma.toString().padStart(2)}`
  );
  lines.push("");

  if (monster.skills && Object.keys(monster.skills).length > 0) {
    const skills = Object.entries(monster.skills)
      .map(([skill, bonus]) => `${skill} +${bonus}`)
      .join(", ");
    lines.push(`Skills: ${skills}`);
  }

  if (monster.senses && Object.keys(monster.senses).length > 0) {
    const senses = Object.entries(monster.senses)
      .map(([sense, range]) => `${sense} ${range}`)
      .join(", ");
    lines.push(`Senses: ${senses}`);
  }

  if (monster.languages && monster.languages.length > 0) {
    lines.push(`Languages: ${monster.languages.join(", ")}`);
  }

  lines.push(`Challenge: ${monster.challengeRating}`);
  lines.push("");

  if (monster.traits && monster.traits.length > 0) {
    lines.push("--- TRAITS ---");
    for (const trait of monster.traits) {
      lines.push(`${trait.name}: ${trait.description}`);
      lines.push("");
    }
  }

  if (monster.actions && monster.actions.length > 0) {
    lines.push("--- ACTIONS ---");
    for (const action of monster.actions) {
      lines.push(`${action.name}: ${action.description}`);
      lines.push("");
    }
  }

  if (monster.reactions && monster.reactions.length > 0) {
    lines.push("--- REACTIONS ---");
    for (const reaction of monster.reactions) {
      lines.push(`${reaction.name}: ${reaction.description}`);
      lines.push("");
    }
  }

  if (monster.legendaryActions && monster.legendaryActions.length > 0) {
    lines.push("--- LEGENDARY ACTIONS ---");
    for (const legendary of monster.legendaryActions) {
      lines.push(`${legendary.name}: ${legendary.description}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Search for magic items by name, rarity, type.
 */
export async function searchItems(
  client: DdbClient,
  params: ItemSearchParams
): Promise<ToolResult> {
  const cacheKey = `items:search:${JSON.stringify(params)}`;

  // Placeholder for actual API call
  const items: Item[] = [];

  const formattedResults =
    items.length > 0
      ? items
          .map(
            (i) =>
              `${i.name} - ${i.rarity} ${i.type}${
                i.requiresAttunement ? " (requires attunement)" : ""
              }`
          )
          .join("\n")
      : "No items found matching the search criteria.";

  return {
    content: [
      {
        type: "text",
        text: `# Magic Item Search Results\n\n${formattedResults}`,
      },
    ],
  };
}

/**
 * Get full details for a specific magic item.
 */
export async function getItem(
  client: DdbClient,
  params: { itemName: string }
): Promise<ToolResult> {
  const cacheKey = `item:${params.itemName.toLowerCase()}`;

  // Placeholder for actual API call
  const item: Item | null = null;

  if (!item) {
    return {
      content: [
        {
          type: "text",
          text: `Item "${params.itemName}" not found.`,
        },
      ],
    };
  }

  const details = formatItemDetails(item);

  return {
    content: [
      {
        type: "text",
        text: details,
      },
    ],
  };
}

/**
 * Format an item's details as readable text.
 */
function formatItemDetails(item: Item): string {
  const lines: string[] = [];

  lines.push(`=== ${item.name.toUpperCase()} ===`);
  lines.push("");
  lines.push(`Type: ${item.type}`);
  lines.push(`Rarity: ${item.rarity}`);

  if (item.requiresAttunement) {
    lines.push("Requires Attunement: Yes");
  }

  if (item.weight) {
    lines.push(`Weight: ${item.weight} lb.`);
  }

  if (item.properties && item.properties.length > 0) {
    lines.push(`Properties: ${item.properties.join(", ")}`);
  }

  lines.push("");
  lines.push(item.description);

  return lines.join("\n");
}

/**
 * Search for feats by name or prerequisite.
 */
export async function searchFeats(
  client: DdbClient,
  params: FeatSearchParams
): Promise<ToolResult> {
  const cacheKey = `feats:search:${JSON.stringify(params)}`;

  // Placeholder for actual API call
  const feats: Feat[] = [];

  const formattedResults =
    feats.length > 0
      ? feats
          .map(
            (f) =>
              `${f.name}${
                f.prerequisite ? ` (Prerequisite: ${f.prerequisite})` : ""
              }`
          )
          .join("\n")
      : "No feats found matching the search criteria.";

  return {
    content: [
      {
        type: "text",
        text: `# Feat Search Results\n\n${formattedResults}`,
      },
    ],
  };
}

/**
 * Get the rules text for a specific condition.
 */
export async function getCondition(
  client: DdbClient,
  params: { conditionName: string }
): Promise<ToolResult> {
  const cacheKey = `condition:${params.conditionName.toLowerCase()}`;

  // Placeholder for actual API call
  const condition: Condition | null = null;

  if (!condition) {
    return {
      content: [
        {
          type: "text",
          text: `Condition "${params.conditionName}" not found.`,
        },
      ],
    };
  }

  const details = formatConditionDetails(condition);

  return {
    content: [
      {
        type: "text",
        text: details,
      },
    ],
  };
}

/**
 * Format a condition's details as readable text.
 */
function formatConditionDetails(condition: Condition): string {
  const lines: string[] = [];

  lines.push(`=== ${condition.name.toUpperCase()} ===`);
  lines.push("");
  lines.push(condition.description);

  if (condition.effects && condition.effects.length > 0) {
    lines.push("");
    lines.push("Effects:");
    for (const effect of condition.effects) {
      lines.push(`• ${effect}`);
    }
  }

  return lines.join("\n");
}

/**
 * Search for character classes and subclasses.
 */
export async function searchClasses(
  client: DdbClient,
  params: { className?: string }
): Promise<ToolResult> {
  const cacheKey = `classes:search:${JSON.stringify(params)}`;

  // Placeholder for actual API call
  const classes: CharacterClass[] = [];

  if (classes.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No classes found matching the search criteria.",
        },
      ],
    };
  }

  const details = classes
    .map((c) => {
      const lines: string[] = [];
      lines.push(`=== ${c.name.toUpperCase()} ===`);
      lines.push("");
      lines.push(c.description);
      lines.push("");
      lines.push(`Hit Die: d${c.hitDie}`);
      lines.push(`Primary Ability: ${c.primaryAbility.join(" or ")}`);
      lines.push(`Saving Throw Proficiencies: ${c.savingThrows.join(", ")}`);

      if (c.subclasses && c.subclasses.length > 0) {
        lines.push("");
        lines.push("Subclasses:");
        for (const subclass of c.subclasses) {
          lines.push(`  • ${subclass.name}: ${subclass.description}`);
        }
      }

      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  return {
    content: [
      {
        type: "text",
        text: details,
      },
    ],
  };
}
