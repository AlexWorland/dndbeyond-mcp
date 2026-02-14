import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCharacter, DdbAbilityScore } from "../types/character.js";
import type { DdbCampaignResponse } from "../types/api.js";

const ABILITY_NAMES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

function calculateAbilityModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function computeFinalAbilityScore(
  base: DdbAbilityScore[],
  bonus: DdbAbilityScore[],
  override: DdbAbilityScore[],
  id: number
): number {
  const overrideValue = override.find((s) => s.id === id)?.value;
  if (overrideValue !== null && overrideValue !== undefined) return overrideValue;

  const baseValue = base.find((s) => s.id === id)?.value ?? 10;
  const bonusValue = bonus.find((s) => s.id === id)?.value ?? 0;
  return baseValue + bonusValue;
}

function formatAbilityScores(char: DdbCharacter): string {
  return ABILITY_NAMES.map((name, idx) => {
    const id = idx + 1;
    const score = computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, id);
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

function calculateMaxHp(char: DdbCharacter): number {
  const base = char.baseHitPoints;
  const bonus = char.bonusHitPoints ?? 0;
  const override = char.overrideHitPoints;
  return override ?? (base + bonus);
}

function calculateCurrentHp(char: DdbCharacter): number {
  const max = calculateMaxHp(char);
  return max - char.removedHitPoints;
}

function formatHp(char: DdbCharacter): string {
  const current = calculateCurrentHp(char);
  const max = calculateMaxHp(char);
  const temp = char.temporaryHitPoints;
  return temp > 0 ? `${current}/${max} (+${temp} temp)` : `${current}/${max}`;
}

function calculateAc(char: DdbCharacter): number {
  const dexMod = Math.floor((computeFinalAbilityScore(char.stats, char.bonusStats, char.overrideStats, 2) - 10) / 2);
  return 10 + dexMod;
}

function formatCharacter(char: DdbCharacter): string {
  const sections = [
    `Name: ${char.name}`,
    `Race: ${char.race.fullName}`,
    `Class: ${formatClasses(char)}`,
    `Level: ${char.level}`,
    `HP: ${formatHp(char)}`,
    `AC: ${calculateAc(char)}`,
    `\nAbility Scores:\n${formatAbilityScores(char)}`,
  ];

  if (char.campaign) {
    sections.push(`\nCampaign: ${char.campaign.name}`);
  }

  return sections.join("\n");
}

function formatSpellList(char: DdbCharacter): string {
  const allSpells = [
    ...char.spells.class,
    ...char.spells.race,
    ...char.spells.background,
    ...char.spells.item,
    ...char.spells.feat,
  ];

  if (allSpells.length === 0) return "No spells available.";

  const prepared = allSpells.filter((s) => s.prepared || s.alwaysPrepared);
  const preparedByLevel = prepared.reduce((acc, spell) => {
    const level = spell.definition.level;
    if (!acc[level]) acc[level] = [];
    acc[level].push(spell.definition.name);
    return acc;
  }, {} as Record<number, string[]>);

  const lines = [
    `Prepared Spells for ${char.name}:`,
    "",
    ...Object.entries(preparedByLevel)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([level, spells]) => {
        const levelLabel = level === "0" ? "Cantrips" : `Level ${level}`;
        return `${levelLabel}:\n  ${spells.join(", ")}`;
      }),
  ];

  return lines.join("\n");
}

function formatInventory(char: DdbCharacter): string {
  const equipped = char.inventory.filter((item) => item.equipped);
  const allItems = char.inventory;

  if (allItems.length === 0) return `Inventory for ${char.name}: Empty`;

  const lines = [
    `Inventory for ${char.name}:`,
    "",
    "Equipped Items:",
  ];

  if (equipped.length === 0) {
    lines.push("  None");
  } else {
    lines.push(...equipped.map((item) => {
      const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
      return `  - ${item.definition.name}${qty}`;
    }));
  }

  const unequipped = allItems.filter((item) => !item.equipped);
  if (unequipped.length > 0) {
    lines.push("", "Other Items:");
    lines.push(...unequipped.map((item) => {
      const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
      return `  - ${item.definition.name}${qty}`;
    }));
  }

  return lines.join("\n");
}

export function registerCharacterResources(server: McpServer, client: DdbClient): void {
  server.resource(
    "D&D Beyond Characters",
    "dndbeyond://characters",
    {
      description: "List of all your D&D Beyond characters",
      mimeType: "text/plain",
    },
    async () => {
      const campaignsResponse = await client.get<DdbCampaignResponse>(
        ENDPOINTS.campaign.list(),
        "campaigns",
        300_000
      );

      const allCharacters = campaignsResponse.data.flatMap((campaign) =>
        campaign.characters.map((char) => ({
          id: char.characterId,
          name: char.characterName,
          campaignName: campaign.name,
        }))
      );

      if (allCharacters.length === 0) {
        return {
          contents: [
            {
              uri: "dndbeyond://characters",
              text: "No characters found.",
              mimeType: "text/plain",
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
            id: char.id,
            name: details.name,
            race: details.race.fullName,
            classes: formatClasses(details),
            level: details.level,
            campaign: char.campaignName,
          };
        })
      );

      const lines = characterDetails.map(
        (char) =>
          `ID: ${char.id} | ${char.name} - ${char.race} ${char.classes} (Level ${char.level}) - ${char.campaign}`
      );

      return {
        contents: [
          {
            uri: "dndbeyond://characters",
            text: `Characters:\n${lines.join("\n")}`,
            mimeType: "text/plain",
          },
        ],
      };
    }
  );

  server.resource(
    "D&D Beyond Character Sheet",
    new ResourceTemplate("dndbeyond://character/{id}", { list: undefined }),
    {
      description: "Full character sheet for a specific character by ID",
      mimeType: "text/plain",
    },
    async (uri) => {
      const uriString = uri.toString();
      const match = uriString.match(/^dndbeyond:\/\/character\/(\d+)$/);
      if (!match) {
        return {
          contents: [
            {
              uri: uriString,
              text: "Invalid character URI format. Expected: dndbeyond://character/{id}",
              mimeType: "text/plain",
            },
          ],
        };
      }

      const characterId = parseInt(match[1], 10);
      const character = await client.get<DdbCharacter>(
        ENDPOINTS.character.get(characterId),
        `character:${characterId}`,
        60_000
      );

      return {
        contents: [
          {
            uri: uriString,
            text: formatCharacter(character),
            mimeType: "text/plain",
          },
        ],
      };
    }
  );

  server.resource(
    "D&D Beyond Character Spells",
    new ResourceTemplate("dndbeyond://character/{id}/spells", { list: undefined }),
    {
      description: "Spell list for a specific character by ID",
      mimeType: "text/plain",
    },
    async (uri) => {
      const uriString = uri.toString();
      const match = uriString.match(/^dndbeyond:\/\/character\/(\d+)\/spells$/);
      if (!match) {
        return {
          contents: [
            {
              uri: uriString,
              text: "Invalid spells URI format. Expected: dndbeyond://character/{id}/spells",
              mimeType: "text/plain",
            },
          ],
        };
      }

      const characterId = parseInt(match[1], 10);
      const character = await client.get<DdbCharacter>(
        ENDPOINTS.character.get(characterId),
        `character:${characterId}`,
        60_000
      );

      return {
        contents: [
          {
            uri: uriString,
            text: formatSpellList(character),
            mimeType: "text/plain",
          },
        ],
      };
    }
  );

  server.resource(
    "D&D Beyond Character Inventory",
    new ResourceTemplate("dndbeyond://character/{id}/inventory", { list: undefined }),
    {
      description: "Inventory items for a specific character by ID",
      mimeType: "text/plain",
    },
    async (uri) => {
      const uriString = uri.toString();
      const match = uriString.match(/^dndbeyond:\/\/character\/(\d+)\/inventory$/);
      if (!match) {
        return {
          contents: [
            {
              uri: uriString,
              text: "Invalid inventory URI format. Expected: dndbeyond://character/{id}/inventory",
              mimeType: "text/plain",
            },
          ],
        };
      }

      const characterId = parseInt(match[1], 10);
      const character = await client.get<DdbCharacter>(
        ENDPOINTS.character.get(characterId),
        `character:${characterId}`,
        60_000
      );

      return {
        contents: [
          {
            uri: uriString,
            text: formatInventory(character),
            mimeType: "text/plain",
          },
        ],
      };
    }
  );
}
