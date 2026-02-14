import type { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCharacter, DdbAbilityScore } from "../types/character.js";
import type { DdbCampaignResponse } from "../types/api.js";

interface GetCharacterParams {
  characterId?: number;
  characterName?: string;
}

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

function formatSpells(char: DdbCharacter): string {
  const allSpells = [
    ...char.spells.class,
    ...char.spells.race,
    ...char.spells.background,
    ...char.spells.item,
    ...char.spells.feat,
  ];

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

  const spells = formatSpells(char);
  if (spells) sections.push(spells);

  const inventory = formatInventory(char);
  if (inventory) sections.push(inventory);

  return sections.join("\n");
}

async function findCharacterByName(client: DdbClient, name: string): Promise<number | null> {
  const campaignsResponse = await client.get<DdbCampaignResponse>(
    ENDPOINTS.campaign.list(),
    "campaigns",
    300_000
  );

  const allCharacters = campaignsResponse.data.flatMap((campaign) =>
    campaign.characters.map((char) => ({
      id: char.characterId,
      name: char.characterName,
    }))
  );

  const match = allCharacters.find(
    (char) => char.name.toLowerCase() === name.toLowerCase()
  );

  return match?.id ?? null;
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
        level: details.level,
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

class StringUtils {
  static readonly EMPTY = "";
}
