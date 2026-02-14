import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TtlCache } from "./cache/lru.js";
import { CircuitBreaker, RateLimiter } from "./resilience/index.js";
import { DdbClient } from "./api/client.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerCharacterResources } from "./resources/character.js";
import { registerCampaignResources } from "./resources/campaign.js";
import { setupAuth, checkAuth } from "./tools/auth.js";
import {
  getCharacter,
  listCharacters,
  updateHp,
  updateSpellSlots,
  updateDeathSaves,
  updateCurrency,
  useAbility,
} from "./tools/character.js";
import { listCampaigns, getCampaignCharacters } from "./tools/campaign.js";
import {
  searchSpells,
  getSpell,
  searchMonsters,
  getMonster,
  searchItems,
  getItem,
  searchFeats,
  getCondition,
  searchClasses,
} from "./tools/reference.js";
import { ENDPOINTS } from "./api/endpoints.js";
import type { DdbCampaignResponse } from "./types/api.js";

export async function startServer(): Promise<void> {
  // Initialize cache instances
  const characterCache = new TtlCache<unknown>(60_000); // 60s TTL
  const campaignCache = new TtlCache<unknown>(300_000); // 5min TTL
  const referenceCache = new TtlCache<unknown>(86_400_000); // 24h TTL

  // Note: All caches share the same underlying cache for simplicity in this implementation
  // In production, you might want separate cache instances for better isolation
  const cache = characterCache;

  // Initialize resilience components
  const circuitBreaker = new CircuitBreaker(5, 30_000); // 5 failures, 30s cooldown
  const rateLimiter = new RateLimiter(2, 1000); // 2 req/sec

  // Initialize D&D Beyond API client
  const client = new DdbClient(cache, circuitBreaker, rateLimiter);

  // Create MCP server
  const server = new McpServer({
    name: "dndbeyond-mcp",
    version: "0.1.0",
  });

  // Register all prompts
  registerAllPrompts(server);

  // Register all resources
  registerCharacterResources(server, client);
  registerCampaignResources(server, client);

  // Register auth tools
  server.tool(
    "setup_auth",
    "Opens a browser to authenticate with D&D Beyond and save your CobaltSession cookie",
    {},
    async () => setupAuth()
  );

  server.tool(
    "check_auth",
    "Check authentication status and verify if your D&D Beyond session is valid",
    {},
    async () => checkAuth(client)
  );

  // Register character read tools
  server.tool(
    "get_character",
    "Get full character sheet details for a specific character by ID or name",
    {
      characterId: z.number().optional().describe("The character ID"),
      characterName: z
        .string()
        .optional()
        .describe("The character name (case-insensitive search)"),
    },
    async (params) =>
      getCharacter(client, {
        characterId: params.characterId,
        characterName: params.characterName,
      })
  );

  server.tool(
    "list_characters",
    "List all characters across all campaigns",
    {},
    async () => listCharacters(client)
  );

  // Register character write tools
  server.tool(
    "update_hp",
    "Update a character's hit points (positive = heal, negative = damage)",
    {
      characterId: z.number().describe("The character ID"),
      hpChange: z
        .number()
        .describe("HP change (positive for healing, negative for damage)"),
    },
    async (params) =>
      updateHp(client, {
        characterId: params.characterId,
        hpChange: params.hpChange,
      })
  );

  server.tool(
    "update_spell_slots",
    "Update used spell slots for a specific spell level",
    {
      characterId: z.number().describe("The character ID"),
      level: z.number().describe("Spell slot level (1-9)"),
      used: z.number().describe("Number of slots used at this level"),
    },
    async (params) =>
      updateSpellSlots(client, {
        characterId: params.characterId,
        level: params.level,
        used: params.used,
      })
  );

  server.tool(
    "update_death_saves",
    "Update death saving throw successes or failures",
    {
      characterId: z.number().describe("The character ID"),
      type: z
        .enum(["success", "failure"])
        .describe("Type of death save: 'success' or 'failure'"),
      count: z.number().describe("Number of successes or failures (0-3)"),
    },
    async (params) =>
      updateDeathSaves(client, {
        characterId: params.characterId,
        type: params.type,
        count: params.count,
      })
  );

  server.tool(
    "update_currency",
    "Update a character's currency (cp, sp, ep, gp, pp)",
    {
      characterId: z.number().describe("The character ID"),
      currency: z
        .enum(["cp", "sp", "ep", "gp", "pp"])
        .describe("Currency type: cp, sp, ep, gp, or pp"),
      amount: z.number().describe("New currency amount"),
    },
    async (params) =>
      updateCurrency(client, {
        characterId: params.characterId,
        currency: params.currency,
        amount: params.amount,
      })
  );

  server.tool(
    "use_ability",
    "Update uses of a limited-use ability (e.g., Favored Enemy, Dreadful Strike, Ki Points). Increments by 1 if 'uses' is not specified, or set exact count with 'uses'. Set uses to 0 to reset.",
    {
      characterId: z.number().describe("The character ID"),
      abilityName: z
        .string()
        .describe(
          "Name of the ability (e.g., 'Hunter's Mark', 'Dreadful Strike')"
        ),
      uses: z
        .number()
        .optional()
        .describe(
          "Set exact number of uses expended. If omitted, increments current uses by 1."
        ),
    },
    async (params) =>
      useAbility(client, {
        characterId: params.characterId,
        abilityName: params.abilityName,
        uses: params.uses,
      })
  );

  // Register campaign tools
  server.tool(
    "list_campaigns",
    "List all active campaigns with DM and player count",
    {},
    async () => listCampaigns(client)
  );

  server.tool(
    "get_campaign_characters",
    "Get the party roster for a specific campaign",
    {
      campaignId: z.number().describe("The campaign ID"),
    },
    async (params) =>
      getCampaignCharacters(client, {
        campaignId: params.campaignId,
      })
  );

  // Register reference tools - spells
  server.tool(
    "search_spells",
    "Search for spells by name, level, school, concentration, or ritual",
    {
      name: z.string().optional().describe("Spell name (partial match)"),
      level: z.number().optional().describe("Spell level (0-9, 0=cantrip)"),
      school: z
        .string()
        .optional()
        .describe("School of magic (e.g., evocation, abjuration)"),
      concentration: z.boolean().optional().describe("Requires concentration"),
      ritual: z.boolean().optional().describe("Can be cast as ritual"),
    },
    async (params) => {
      // Get character IDs for searching spells
      const campaignsResponse = await client.get<DdbCampaignResponse>(
        ENDPOINTS.campaign.list(),
        "campaigns",
        300_000
      );
      const characterIds = campaignsResponse.data.flatMap((campaign) =>
        campaign.characters.map((char) => char.characterId)
      );

      return searchSpells(
        client,
        {
          name: params.name,
          level: params.level,
          school: params.school,
          concentration: params.concentration,
          ritual: params.ritual,
        },
        characterIds
      );
    }
  );

  server.tool(
    "get_spell",
    "Get full details for a specific spell by name",
    {
      spellName: z.string().describe("The spell name"),
    },
    async (params) => {
      // Get character IDs for searching spells
      const campaignsResponse = await client.get<DdbCampaignResponse>(
        ENDPOINTS.campaign.list(),
        "campaigns",
        300_000
      );
      const characterIds = campaignsResponse.data.flatMap((campaign) =>
        campaign.characters.map((char) => char.characterId)
      );

      return getSpell(
        client,
        {
          spellName: params.spellName,
        },
        characterIds
      );
    }
  );

  // Register reference tools - monsters
  server.tool(
    "search_monsters",
    "Search for monsters by name, CR, type, or size",
    {
      name: z.string().optional().describe("Monster name (partial match)"),
      cr: z.number().optional().describe("Challenge Rating"),
      type: z
        .string()
        .optional()
        .describe("Monster type (e.g., dragon, undead, humanoid)"),
      size: z
        .string()
        .optional()
        .describe("Size (tiny, small, medium, large, huge, gargantuan)"),
    },
    async (params) =>
      searchMonsters(client, {
        name: params.name,
        cr: params.cr,
        type: params.type,
        size: params.size,
      })
  );

  server.tool(
    "get_monster",
    "Get full stat block for a specific monster by name",
    {
      monsterName: z.string().describe("The monster name"),
    },
    async (params) =>
      getMonster(client, {
        monsterName: params.monsterName,
      })
  );

  // Register reference tools - items
  server.tool(
    "search_items",
    "Search for magic items by name, rarity, or type",
    {
      name: z.string().optional().describe("Item name (partial match)"),
      rarity: z
        .string()
        .optional()
        .describe(
          "Rarity (common, uncommon, rare, very rare, legendary, artifact)"
        ),
      type: z
        .string()
        .optional()
        .describe("Item type (weapon, armor, potion, ring, etc.)"),
    },
    async (params) =>
      searchItems(client, {
        name: params.name,
        rarity: params.rarity,
        type: params.type,
      })
  );

  server.tool(
    "get_item",
    "Get full details for a specific magic item by name",
    {
      itemName: z.string().describe("The item name"),
    },
    async (params) =>
      getItem(client, {
        itemName: params.itemName,
      })
  );

  // Register reference tools - feats
  server.tool(
    "search_feats",
    "Search for feats by name",
    {
      name: z.string().optional().describe("Feat name (partial match)"),
    },
    async (params) =>
      searchFeats(client, {
        name: params.name,
      })
  );

  // Register reference tools - conditions
  server.tool(
    "get_condition",
    "Get rules text for a specific condition",
    {
      conditionName: z
        .string()
        .describe("The condition name (e.g., blinded, charmed, frightened)"),
    },
    async (params) =>
      getCondition(client, {
        conditionName: params.conditionName,
      })
  );

  // Register reference tools - classes
  server.tool(
    "search_classes",
    "Search for character classes and subclasses",
    {
      className: z.string().optional().describe("Class name (partial match)"),
    },
    async (params) =>
      searchClasses(client, {
        className: params.className,
      })
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error("dndbeyond-mcp: shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error("dndbeyond-mcp: server running");
}
