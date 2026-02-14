import { DdbClient } from "../api/client.js";
import { MonsterSearchParams, ItemSearchParams, FeatSearchParams } from "../types/reference.js";

const REFERENCE_TTL = 86400; // 24 hours in seconds

interface CallToolResult {
  content: Array<{ type: "text"; text: string }>;
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

/**
 * Search for monsters by name, CR, type, size, or environment.
 */
export async function searchMonsters(
  client: DdbClient,
  params: MonsterSearchParams
): Promise<CallToolResult> {
  const cacheKey = `monsters:search:${JSON.stringify(params)}`;

  // For now, return a placeholder since we don't have actual D&D Beyond endpoints
  // In production, this would call the actual API endpoint
  const monsters: Monster[] = [];

  const formattedResults = monsters.length > 0
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
        text: `Monster Search Results:\n\n${formattedResults}`,
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
): Promise<CallToolResult> {
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
  lines.push(StringUtils.EMPTY);
  lines.push(`${monster.size} ${monster.type}, ${monster.alignment}`);
  lines.push(StringUtils.EMPTY);

  lines.push(`Armor Class: ${monster.armorClass}`);
  lines.push(`Hit Points: ${monster.hitPoints}`);

  const speeds = Object.entries(monster.speed)
    .map(([type, value]) => `${type} ${value} ft.`)
    .join(", ");
  lines.push(`Speed: ${speeds}`);
  lines.push(StringUtils.EMPTY);

  lines.push("STR  DEX  CON  INT  WIS  CHA");
  lines.push(
    `${monster.abilityScores.strength.toString().padStart(2)}   ` +
    `${monster.abilityScores.dexterity.toString().padStart(2)}   ` +
    `${monster.abilityScores.constitution.toString().padStart(2)}   ` +
    `${monster.abilityScores.intelligence.toString().padStart(2)}   ` +
    `${monster.abilityScores.wisdom.toString().padStart(2)}   ` +
    `${monster.abilityScores.charisma.toString().padStart(2)}`
  );
  lines.push(StringUtils.EMPTY);

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
  lines.push(StringUtils.EMPTY);

  if (monster.traits && monster.traits.length > 0) {
    lines.push("--- TRAITS ---");
    for (const trait of monster.traits) {
      lines.push(`${trait.name}: ${trait.description}`);
      lines.push(StringUtils.EMPTY);
    }
  }

  if (monster.actions && monster.actions.length > 0) {
    lines.push("--- ACTIONS ---");
    for (const action of monster.actions) {
      lines.push(`${action.name}: ${action.description}`);
      lines.push(StringUtils.EMPTY);
    }
  }

  if (monster.reactions && monster.reactions.length > 0) {
    lines.push("--- REACTIONS ---");
    for (const reaction of monster.reactions) {
      lines.push(`${reaction.name}: ${reaction.description}`);
      lines.push(StringUtils.EMPTY);
    }
  }

  if (monster.legendaryActions && monster.legendaryActions.length > 0) {
    lines.push("--- LEGENDARY ACTIONS ---");
    for (const legendary of monster.legendaryActions) {
      lines.push(`${legendary.name}: ${legendary.description}`);
      lines.push(StringUtils.EMPTY);
    }
  }

  return lines.join("\n");
}

/**
 * Search for magic items by name, rarity, type, or attunement requirement.
 */
export async function searchItems(
  client: DdbClient,
  params: ItemSearchParams
): Promise<CallToolResult> {
  const cacheKey = `items:search:${JSON.stringify(params)}`;

  // Placeholder for actual API call
  const items: Item[] = [];

  const formattedResults = items.length > 0
    ? items
        .map(
          (i) =>
            `${i.name} - ${i.rarity} ${i.type}${
              i.requiresAttunement ? " (requires attunement)" : StringUtils.EMPTY
            }`
        )
        .join("\n")
    : "No items found matching the search criteria.";

  return {
    content: [
      {
        type: "text",
        text: `Magic Item Search Results:\n\n${formattedResults}`,
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
): Promise<CallToolResult> {
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
  lines.push(StringUtils.EMPTY);
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

  lines.push(StringUtils.EMPTY);
  lines.push(item.description);

  return lines.join("\n");
}

/**
 * Search for feats by name or prerequisite.
 */
export async function searchFeats(
  client: DdbClient,
  params: FeatSearchParams
): Promise<CallToolResult> {
  const cacheKey = `feats:search:${JSON.stringify(params)}`;

  // Placeholder for actual API call
  const feats: Feat[] = [];

  const formattedResults = feats.length > 0
    ? feats
        .map(
          (f) =>
            `${f.name}${
              f.prerequisite ? ` (Prerequisite: ${f.prerequisite})` : StringUtils.EMPTY
            }`
        )
        .join("\n")
    : "No feats found matching the search criteria.";

  return {
    content: [
      {
        type: "text",
        text: `Feat Search Results:\n\n${formattedResults}`,
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
): Promise<CallToolResult> {
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
  lines.push(StringUtils.EMPTY);
  lines.push(condition.description);

  if (condition.effects && condition.effects.length > 0) {
    lines.push(StringUtils.EMPTY);
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
): Promise<CallToolResult> {
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
      lines.push(StringUtils.EMPTY);
      lines.push(c.description);
      lines.push(StringUtils.EMPTY);
      lines.push(`Hit Die: d${c.hitDie}`);
      lines.push(`Primary Ability: ${c.primaryAbility.join(" or ")}`);
      lines.push(`Saving Throw Proficiencies: ${c.savingThrows.join(", ")}`);

      if (c.subclasses && c.subclasses.length > 0) {
        lines.push(StringUtils.EMPTY);
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

// StringUtils placeholder (would normally be imported)
const StringUtils = {
  EMPTY: "",
};
