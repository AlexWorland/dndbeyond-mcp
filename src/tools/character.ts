import type { DdbClient } from "../api/client.js";
import { ENDPOINTS } from "../api/endpoints.js";
import type { DdbCharacter, DdbAbilityScore, DdbAction } from "../types/character.js";
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

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

interface UpdateHpParams {
  characterId: number;
  hpChange: number;
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

  await client.put(
    ENDPOINTS.character.updateHp(params.characterId),
    { removedHitPoints: newRemovedHp },
    [`character:${params.characterId}`]
  );

  const action = params.hpChange > 0 ? "Healed" : "Damaged";
  const amount = Math.abs(params.hpChange);
  const newCurrent = calculateMaxHp(character) - newRemovedHp;

  return {
    content: [
      {
        type: "text",
        text: `${action} ${character.name} for ${amount} HP. Current HP: ${newCurrent}/${calculateMaxHp(character)}`,
      },
    ],
  };
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
}

interface UpdateCurrencyParams {
  characterId: number;
  currency: "cp" | "sp" | "ep" | "gp" | "pp";
  amount: number;
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

  await client.put(
    ENDPOINTS.character.updateCurrency(params.characterId),
    { [params.currency]: params.amount },
    [`character:${params.characterId}`]
  );

  return {
    content: [
      {
        type: "text",
        text: `Updated ${params.currency.toUpperCase()} to ${params.amount}.`,
      },
    ],
  };
}

interface UseAbilityParams {
  characterId: number;
  abilityName: string;
  uses?: number;
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

  // Search all action categories for matching ability (case-insensitive)
  const actions = character.actions ?? {};
  let foundAction: DdbAction | null = null;

  for (const list of Object.values(actions)) {
    if (!Array.isArray(list)) continue;
    const match = list.find(
      (a) => a.name?.toLowerCase() === params.abilityName.toLowerCase()
    );
    if (match) {
      foundAction = match;
      break;
    }
  }

  if (!foundAction) {
    return {
      content: [
        {
          type: "text",
          text: `Ability "${params.abilityName}" not found in character actions.`,
        },
      ],
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
