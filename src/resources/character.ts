import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCharacter } from "../types/character.js";
import type { DdbCampaign, DdbCampaignCharacter2 } from "../types/api.js";
import { HttpError } from "../resilience/index.js";
import { ABILITY_NAMES, calculateAbilityModifier, computeFinalAbilityScore, computeLevel, calculateMaxHp, calculateCurrentHp, calculateAc } from "../utils/character-calculations.js";

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

  return sections.join("\n");
}

function formatSpellList(char: DdbCharacter): string {
  const allSpells = [
    ...(char.spells.class ?? []),
    ...(char.spells.race ?? []),
    ...(char.spells.background ?? []),
    ...(char.spells.item ?? []),
    ...(char.spells.feat ?? []),
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
      try {
        const campaignsResponse = await client.get<DdbCampaign[]>(
          ENDPOINTS.campaign.list(),
          "campaigns",
          300_000
        );

        // Fetch characters from each campaign using the new endpoint
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
            contents: [
              {
                uri: "dndbeyond://characters",
                text: "No characters found.",
                mimeType: "text/plain",
              },
            ],
          };
        }

        // N+1 query: fetches full character data for each character individually.
        // Acceptable for typical usage (5-10 characters) since results are cached.
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
              level: computeLevel(details),
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
      } catch (error) {
        if (error instanceof HttpError) {
          return { contents: [{ uri: "dndbeyond://characters", text: `Error: ${error.message}`, mimeType: "text/plain" }] };
        }
        throw error;
      }
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

      try {
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
      } catch (error) {
        if (error instanceof HttpError) {
          return { contents: [{ uri: uriString, text: `Error: ${error.message}`, mimeType: "text/plain" }] };
        }
        throw error;
      }
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

      try {
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
      } catch (error) {
        if (error instanceof HttpError) {
          return { contents: [{ uri: uriString, text: `Error: ${error.message}`, mimeType: "text/plain" }] };
        }
        throw error;
      }
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

      try {
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
      } catch (error) {
        if (error instanceof HttpError) {
          return { contents: [{ uri: uriString, text: `Error: ${error.message}`, mimeType: "text/plain" }] };
        }
        throw error;
      }
    }
  );
}
