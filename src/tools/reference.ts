import { DdbClient } from "../api/client.js";
import { SpellSearchParams } from "../types/reference.js";
import { DdbCharacter, DdbSpell } from "../types/character.js";
import { ENDPOINTS } from "../api/endpoints.js";

interface ToolResult {
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
