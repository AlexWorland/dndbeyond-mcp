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
  getDefinition,
  listCharacters,
  callExperimentalDdbEndpoint,
  listExperimentalDdbEndpoints,
  setCharacterSourceCategories,
  setCharacterCampaignSetting,
  setCustomBackground,
  setHasCustomBackground,
  setCustomValue,
  deleteCustomValue,
  deleteCustomEntityValues,
  manageCustomProficiency,
  manageCustomMovement,
  manageCustomSense,
  manageCustomDefenseAdjustment,
  manageCustomAction,
  setCharacterDecoration,
  manageRollResult,
  manageCharacterFeat,
  manageCharacterInfusion,
  manageOptionalFeature,
  managePremadeInfo,
  manageVehicle,
  getPartyInventory,
  getCharacterRuleData,
  getCharacterShareUrl,
  generateCharacterPdf,
  setCharacterFeatureFlag,
  addKnownSpell,
  removeKnownSpell,
  restoreHp,
  setCharacterPreference,
  setHelpText,
  setHpBase,
  setHpBonus,
  setHpOverride,
  setProgression,
  setSpellPrepared,
  updateHp,
  updateSpellSlots,
  updateDeathSaves,
  updateCurrency,
  updatePactMagic,
  longRest,
  shortRest,
  castSpell,
  useAbility,
  createCharacter,
  deleteCharacter,
  addClass,
  setBackground,
  setBackgroundChoice,
  setClassFeatureChoice,
  setRaceTraitChoice,
  setFeatChoice,
  resolveChoices,
  setInspiration,
  addCondition,
  removeCondition,
  setSpecies,
  setAbilityScore,
  updateCharacterName,
  setClassLevel,
  setAbilityScoreType,
  setStartingEquipmentType,
  addInventoryItems,
  addCatalogItem,
  createCustomItem,
  deleteCustomItem,
  listInventoryItems,
  removeInventoryItem,
  setGold,
  moveInventoryItem,
  setInventoryItemAttuned,
  setInventoryItemCharge,
  setInventoryItemEquipped,
  setInventoryItemQuantity,
  updateCustomItem,
  updateDescription,
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
  searchRaces,
  searchBackgrounds,
  searchClassFeatures,
  searchRacialTraits,
} from "./tools/reference.js";

export async function startServer(): Promise<void> {
  // Initialize cache instance
  const cache = new TtlCache<unknown>(60_000); // 60s TTL

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
    "Get character details by ID or name. Use 'detail' to control output: 'summary' (basic stats), 'sheet' (comprehensive with saves/skills/features, default), or 'full' (sheet + all definitions expanded, ~15-30KB).",
    {
      characterId: z.coerce.number().optional().describe("The character ID"),
      characterName: z
        .string()
        .optional()
        .describe("The character name (case-insensitive search)"),
      detail: z
        .enum(["summary", "sheet", "full"])
        .optional()
        .describe("Detail level: 'summary', 'sheet' (default), or 'full'"),
    },
    async (params) =>
      getCharacter(client, {
        characterId: params.characterId,
        characterName: params.characterName,
        detail: params.detail,
      })
  );

  server.tool(
    "list_characters",
    "List all characters across all campaigns",
    {},
    async () => listCharacters(client)
  );

  server.tool(
    "get_definition",
    "Look up a specific feat, spell, class feature, racial trait, or item by name (partial match). Returns the full description.",
    {
      characterId: z.coerce.number().optional().describe("The character ID"),
      characterName: z
        .string()
        .optional()
        .describe("The character name (case-insensitive search)"),
      name: z
        .string()
        .describe(
          "Name to search for (case-insensitive partial match, e.g. 'hunter' finds Hunter's Mark)"
        ),
    },
    async (params) =>
      getDefinition(client, {
        characterId: params.characterId,
        characterName: params.characterName,
        name: params.name,
      })
  );

  // Register character write tools
  server.tool(
    "update_hp",
    "Update a character's hit points (positive = heal, negative = damage). Optionally set temporary HP.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      hpChange: z
        .coerce.number()
        .describe("HP change (positive for healing, negative for damage)"),
      tempHp: z
        .coerce.number()
        .optional()
        .describe("Set temporary hit points to this value"),
    },
    async (params) =>
      updateHp(client, {
        characterId: params.characterId,
        hpChange: params.hpChange,
        tempHp: params.tempHp,
      })
  );

  server.tool(
    "set_inspiration",
    "Grant or remove inspiration on a character",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inspiration: z.boolean().describe("true to grant inspiration, false to remove it"),
    },
    async (params) =>
      setInspiration(client, {
        characterId: params.characterId,
        inspiration: params.inspiration,
      })
  );

  server.tool(
    "add_condition",
    "Apply a condition to a character. Condition IDs: 1=Blinded, 2=Charmed, 3=Deafened, 4=Frightened, 5=Grappled, 6=Incapacitated, 7=Invisible, 8=Paralyzed, 9=Petrified, 10=Poisoned, 11=Prone, 12=Restrained, 13=Stunned, 14=Unconscious, 15=Exhaustion (use level 1-6)",
    {
      characterId: z.coerce.number().describe("The character ID"),
      conditionId: z.coerce.number().describe("Condition ID (1-15)"),
      level: z.coerce.number().optional().describe("Exhaustion level (1-6). Only used for Exhaustion (conditionId=15)."),
    },
    async (params) =>
      addCondition(client, {
        characterId: params.characterId,
        conditionId: params.conditionId,
        level: params.level,
      })
  );

  server.tool(
    "remove_condition",
    "Remove a condition from a character. Condition IDs: 1=Blinded, 2=Charmed, 3=Deafened, 4=Frightened, 5=Grappled, 6=Incapacitated, 7=Invisible, 8=Paralyzed, 9=Petrified, 10=Poisoned, 11=Prone, 12=Restrained, 13=Stunned, 14=Unconscious, 15=Exhaustion",
    {
      characterId: z.coerce.number().describe("The character ID"),
      conditionId: z.coerce.number().describe("Condition ID (1-15)"),
    },
    async (params) =>
      removeCondition(client, {
        characterId: params.characterId,
        conditionId: params.conditionId,
      })
  );

  server.tool(
    "update_spell_slots",
    "Update used spell slots for a specific spell level",
    {
      characterId: z.coerce.number().describe("The character ID"),
      level: z.coerce.number().describe("Spell slot level (1-9)"),
      used: z.coerce.number().describe("Number of slots used at this level"),
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
      characterId: z.coerce.number().describe("The character ID"),
      type: z
        .enum(["success", "failure"])
        .describe("Type of death save: 'success' or 'failure'"),
      count: z.coerce.number().describe("Number of successes or failures (0-3)"),
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
    "Update a character's currency. Use 'delta' to add/spend (e.g., delta: 50 to add, delta: -10 to spend) or 'amount' to set an absolute value.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      currency: z
        .enum(["cp", "sp", "ep", "gp", "pp"])
        .describe("Currency type: cp, sp, ep, gp, or pp"),
      amount: z.coerce.number().optional().describe("Set currency to this exact amount"),
      delta: z.coerce.number().optional().describe("Add (positive) or spend (negative) this many coins"),
    },
    async (params) =>
      updateCurrency(client, {
        characterId: params.characterId,
        currency: params.currency,
        amount: params.amount,
        delta: params.delta,
      })
  );

  server.tool(
    "set_progression",
    "Set a character's current XP/progression value.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      currentXp: z.coerce.number().describe("Current XP value"),
    },
    async (params) => setProgression(client, params)
  );

  server.tool(
    "set_hp_base",
    "Set a character's base hit points.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      baseHitPoints: z.coerce.number().describe("Base hit points"),
    },
    async (params) => setHpBase(client, params)
  );

  server.tool(
    "set_hp_bonus",
    "Set a character's miscellaneous/bonus hit points.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      bonusHitPoints: z.coerce.number().describe("Bonus hit points"),
    },
    async (params) => setHpBonus(client, params)
  );

  server.tool(
    "set_hp_override",
    "Set or clear a character's override/max hit points.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      overrideHitPoints: z.coerce.number().nullable().describe("Override HP, or null to clear"),
    },
    async (params) => setHpOverride(client, params)
  );

  server.tool(
    "restore_hp",
    "Call D&D Beyond's HP restore endpoint. restoreType is DDB's numeric restore mode; totalHp is the target total HP value.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      totalHp: z.coerce.number().describe("Target total HP"),
      restoreType: z.coerce.number().describe("DDB restore type"),
    },
    async (params) => restoreHp(client, params)
  );

  server.tool(
    "set_character_preference",
    "Set one character preference flag/value by key, e.g. enableOptionalClassFeatures, enableContainerCurrency, ignoreCoinWeight.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      key: z.string().describe("Preference key"),
      value: z.union([z.boolean(), z.string(), z.coerce.number(), z.null()]).describe("Preference value"),
    },
    async (params) => setCharacterPreference(client, params)
  );

  server.tool(
    "set_help_text",
    "Show or hide D&D Beyond sheet help text.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      showHelpText: z.boolean().describe("true to show help text, false to hide"),
    },
    async (params) => setHelpText(client, params)
  );

  server.tool(
    "add_known_spell",
    "Add a known class spell. Use classId = class definition ID, spellId = spell definition ID, spellMappingId/entityTypeId from classSpells or spell search data.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      classId: z.coerce.number().describe("Class definition ID, e.g. Wizard 2190886"),
      spellId: z.coerce.number().describe("Spell definition ID"),
      spellMappingId: z.coerce.number().describe("DDB spell mapping ID"),
      spellEntityTypeId: z.coerce.number().describe("DDB spell mapping entity type ID"),
    },
    async (params) => addKnownSpell(client, params)
  );

  server.tool(
    "remove_known_spell",
    "Remove a known class spell using the same IDs as add_known_spell.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      classId: z.coerce.number().describe("Class definition ID"),
      spellId: z.coerce.number().describe("Spell definition ID"),
      spellMappingId: z.coerce.number().describe("DDB spell mapping ID"),
      spellEntityTypeId: z.coerce.number().describe("DDB spell mapping entity type ID"),
    },
    async (params) => removeKnownSpell(client, params)
  );

  server.tool(
    "set_spell_prepared",
    "Prepare or unprepare a spell. Use classMappingId from character.classes[].id and spellMappingId/entityTypeId from the character/class spell entry.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      classMappingId: z.coerce.number().describe("Character class mapping ID from classes[].id"),
      spellMappingId: z.coerce.number().describe("DDB spell mapping ID"),
      spellEntityTypeId: z.coerce.number().describe("DDB spell mapping entity type ID"),
      prepared: z.boolean().describe("true to prepare, false to unprepare"),
    },
    async (params) => setSpellPrepared(client, params)
  );

  server.tool(
    "list_experimental_ddb_endpoints",
    "List additional D&D Beyond character-service endpoints exposed by the web app but not yet modeled as first-class typed tools.",
    {},
    async () => listExperimentalDdbEndpoints()
  );

  server.tool(
    "call_experimental_ddb_endpoint",
    "Call an allowlisted additional D&D Beyond character-service endpoint. Use list_experimental_ddb_endpoints first. Prefer typed tools when available; this is for long-tail endpoints whose payloads vary by DDB feature.",
    {
      endpoint: z.string().describe("Allowlisted endpoint key from list_experimental_ddb_endpoints"),
      body: z.record(z.string(), z.unknown()).optional().describe("Request body or GET query/path params"),
    },
    async (params) =>
      callExperimentalDdbEndpoint(client, {
        endpoint: params.endpoint,
        body: params.body as Record<string, unknown> | undefined,
      })
  );


  server.tool(
    "set_character_source_categories",
    "Set active D&D Beyond source categories. Payload shape is reverse-engineered from the web app; common IDs include 26=core rules and 1=expanded rules.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      activeSourceCategories: z.array(z.coerce.number()).describe("Source category IDs to enable"),
    },
    async (params) => setCharacterSourceCategories(client, params)
  );

  server.tool(
    "set_character_campaign_setting",
    "Set character campaign content-source settings using DDB's campaign-setting payload.",
    z.object({
      characterId: z.coerce.number().describe("The character ID"),
      campaignSettingId: z.coerce.number().nullable().optional(),
      enabledSourceIds: z.array(z.coerce.number()).optional(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => setCharacterCampaignSetting(client, params)
  );

  server.tool(
    "set_custom_background",
    "Create/update the character custom background fields. Use set_has_custom_background to toggle whether it is active.",
    z.object({
      characterId: z.coerce.number(),
      name: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      backgroundFeatureId: z.coerce.number().nullable().optional(),
      backgroundCharacteristicsId: z.coerce.number().nullable().optional(),
      backgroundType: z.coerce.number().nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => setCustomBackground(client, params)
  );

  server.tool(
    "set_has_custom_background",
    "Toggle whether the character uses its custom background.",
    {
      characterId: z.coerce.number(),
      hasCustomBackground: z.boolean(),
    },
    async (params) => setHasCustomBackground(client, params)
  );

  server.tool(
    "set_custom_value",
    "Set a DDB custom value. Entity-scoped values may include valueId/valueTypeId/contextId/contextTypeId/partyId.",
    z.object({
      characterId: z.coerce.number(),
      typeId: z.coerce.number(),
      value: z.unknown(),
      notes: z.string().nullable().optional(),
      valueId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      valueTypeId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      contextId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      contextTypeId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      partyId: z.coerce.number().nullable().optional(),
    }).shape,
    async (params) => setCustomValue(client, params)
  );

  server.tool(
    "delete_custom_value",
    "Delete a DDB custom value by typeId plus optional entity scope fields.",
    z.object({
      characterId: z.coerce.number(),
      typeId: z.coerce.number(),
      valueId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      valueTypeId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      contextId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      contextTypeId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      partyId: z.coerce.number().nullable().optional(),
    }).shape,
    async (params) => deleteCustomValue(client, params)
  );

  server.tool(
    "delete_custom_entity_values",
    "Delete all custom values associated with a DDB entity scope.",
    z.object({
      characterId: z.coerce.number(),
      valueId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      valueTypeId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      contextId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      contextTypeId: z.union([z.coerce.number(), z.string()]).nullable().optional(),
      partyId: z.coerce.number().nullable().optional(),
    }).shape,
    async (params) => deleteCustomEntityValues(client, params)
  );

  server.tool(
    "manage_custom_proficiency",
    "Create, update, or delete a custom proficiency. Types: 1 skill, 2 tool, 3 language, 4 armor, 5 weapon. Include type on update to avoid DDB resetting it.",
    z.object({
      operation: z.enum(["create", "update", "delete"]),
      characterId: z.coerce.number(),
      id: z.coerce.number().optional(),
      name: z.string().optional(),
      type: z.coerce.number().optional(),
      notes: z.string().nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageCustomProficiency(client, params)
  );

  server.tool(
    "manage_custom_movement",
    "Create/update/delete a custom movement speed. Movement IDs: 1 walk, 2 burrow, 3 climb, 4 fly, 5 swim.",
    {
      operation: z.enum(["create", "update", "delete"]),
      characterId: z.coerce.number(),
      movementId: z.coerce.number(),
      distance: z.coerce.number().nullable().optional(),
      source: z.string().nullable().optional(),
    },
    async (params) => manageCustomMovement(client, params)
  );

  server.tool(
    "manage_custom_sense",
    "Create/update/delete a custom sense. Sense IDs: 1 blindsight, 2 darkvision, 3 tremorsense, 4 truesight.",
    {
      operation: z.enum(["create", "update", "delete"]),
      characterId: z.coerce.number(),
      senseId: z.coerce.number(),
      distance: z.coerce.number().nullable().optional(),
      source: z.string().nullable().optional(),
    },
    async (params) => manageCustomSense(client, params)
  );

  server.tool(
    "manage_custom_defense_adjustment",
    "Create/update/delete a custom defense adjustment. Type 1=condition, 2=damage; adjustmentId comes from config damageAdjustments/conditions.",
    z.object({
      operation: z.enum(["create", "update", "delete"]),
      characterId: z.coerce.number(),
      type: z.coerce.number(),
      adjustmentId: z.coerce.number(),
      source: z.string().nullable().optional(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageCustomDefenseAdjustment(client, params)
  );

  server.tool(
    "manage_custom_action",
    "Create/update/delete a custom action. actionType: 1 weapon, 2 spell, 3 general. Include actionType on update to avoid DDB nulling it.",
    z.object({
      operation: z.enum(["create", "update", "delete"]),
      characterId: z.coerce.number(),
      id: z.union([z.coerce.number(), z.string()]).optional(),
      name: z.string().optional(),
      actionType: z.coerce.number().optional(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageCustomAction(client, params)
  );

  server.tool(
    "set_character_decoration",
    "Set decoration fields: backdrop, frame, portrait, customPortrait, themeColor, or socialImage. Custom portrait uploads accept JPEG/PNG/GIF up to 3MB.",
    z.object({
      characterId: z.coerce.number(),
      kind: z.enum(["backdrop", "frame", "portrait", "customPortrait", "themeColor", "socialImage"]),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => setCharacterDecoration(client, params)
  );

  server.tool(
    "manage_roll_result",
    "Manage DDB roll result groups/results. Operations: listGroups, createGroup, updateGroup, updateGroupOrder, deleteGroup, deleteGroups, updateResult.",
    z.object({
      operation: z.enum(["listGroups", "createGroup", "updateGroup", "updateGroupOrder", "deleteGroup", "deleteGroups", "updateResult"]),
      characterId: z.coerce.number(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageRollResult(client, params)
  );

  server.tool(
    "manage_character_feat",
    "Manage DDB feat endpoints: createAdHoc, deleteAdHoc, addFromEntity. Payloads must match the DDB web app fields for that feat flow.",
    z.object({
      operation: z.enum(["createAdHoc", "deleteAdHoc", "addFromEntity"]),
      characterId: z.coerce.number(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageCharacterFeat(client, params)
  );

  server.tool(
    "manage_character_infusion",
    "Manage DDB infusion endpoints: listItems, addItem, deleteItem, listKnown, createKnown, updateKnown, deleteKnown.",
    z.object({
      operation: z.enum(["listItems", "addItem", "deleteItem", "listKnown", "createKnown", "updateKnown", "deleteKnown"]),
      characterId: z.coerce.number(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageCharacterInfusion(client, params)
  );

  server.tool(
    "manage_optional_feature",
    "Manage DDB optional class feature/origin endpoints.",
    z.object({
      operation: z.enum(["addClassFeature", "updateClassFeature", "deleteClassFeature", "deleteClassFeatureCollection", "addRacialTrait", "updateRacialTrait", "deleteRacialTrait", "deleteRacialTraitCollection"]),
      characterId: z.coerce.number(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageOptionalFeature(client, params)
  );

  server.tool(
    "manage_premade_info",
    "Get/create/update/delete DDB premade-info payloads.",
    z.object({
      operation: z.enum(["get", "create", "update", "delete"]),
      characterId: z.coerce.number(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => managePremadeInfo(client, params)
  );

  server.tool(
    "manage_vehicle",
    "Manage DDB vehicle endpoints: list/create/update/delete, fuel, conditions, and components. Component operations require characterId plus vehicleMappingId/componentIds or component mapping id.",
    z.object({
      operation: z.enum(["list", "create", "update", "delete", "setFuel", "createCondition", "updateCondition", "deleteCondition", "listComponents", "createComponent", "updateComponent", "updateComponentHp"]),
      characterId: z.coerce.number().optional(),
      vehicleMappingId: z.coerce.number().optional(),
      id: z.coerce.number().optional(),
      payload: z.record(z.string(), z.unknown()).optional().describe("Additional endpoint payload fields merged before top-level fields."),
    }).catchall(z.unknown()).shape,
    async (params) => manageVehicle(client, params)
  );

  server.tool(
    "get_party_inventory",
    "Get party inventory for a campaign ID.",
    { campaignId: z.coerce.number() },
    async (params) => getPartyInventory(client, params)
  );

  server.tool(
    "get_character_rule_data",
    "Get character-scoped rule data from DDB.",
    { characterId: z.coerce.number() },
    async (params) => getCharacterRuleData(client, params)
  );

  server.tool(
    "get_character_share_url",
    "Get DDB share URL data for a character.",
    { characterId: z.coerce.number() },
    async (params) => getCharacterShareUrl(client, params)
  );

  server.tool(
    "generate_character_pdf",
    "Generate/fetch DDB PDF export data. DDB requires the web-app exportData JSON string plus top-level characterId; characterId alone is not sufficient.",
    z.object({
      characterId: z.coerce.number(),
      exportData: z.string().describe("JSON string from DDB's PDF export-data generator."),
    }).catchall(z.unknown()).shape,
    async (params) => generateCharacterPdf(client, params)
  );

  server.tool(
    "set_character_feature_flag",
    "Call DDB's featureflag endpoint with a flags array, e.g. release-gate-character-sheet-campaign-settings.",
    z.object({ flags: z.array(z.string()) }).catchall(z.unknown()).shape,
    async (params) => setCharacterFeatureFlag(client, params)
  );

  server.tool(
    "use_ability",
    "Update uses of a limited-use ability (e.g., Favored Enemy, Dreadful Strike, Ki Points). Increments by 1 if 'uses' is not specified, or set exact count with 'uses'. Set uses to 0 to reset.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      abilityName: z
        .string()
        .describe(
          "Name of the ability (e.g., 'Hunter's Mark', 'Dreadful Strike')"
        ),
      uses: z
        .coerce.number()
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

  server.tool(
    "update_pact_magic",
    "Update used pact magic slots for a Warlock",
    {
      characterId: z.coerce.number().describe("The character ID"),
      used: z.coerce.number().describe("Number of pact magic slots used"),
    },
    async (params) =>
      updatePactMagic(client, {
        characterId: params.characterId,
        used: params.used,
      })
  );

  server.tool(
    "long_rest",
    "Perform a long rest: restores HP, spell slots, pact magic, limited-use abilities, hit dice, and death saves (server-side)",
    {
      characterId: z.coerce.number().describe("The character ID"),
    },
    async (params) =>
      longRest(client, {
        characterId: params.characterId,
      })
  );

  server.tool(
    "short_rest",
    "Perform a short rest: resets pact magic, short-rest abilities, and handles hit dice (server-side)",
    {
      characterId: z.coerce.number().describe("The character ID"),
    },
    async (params) =>
      shortRest(client, {
        characterId: params.characterId,
      })
  );

  server.tool(
    "cast_spell",
    "Cast a spell and automatically decrement the appropriate spell slot or pact magic slot. Supports upcasting.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      spellName: z.string().describe("Name of the spell to cast"),
      level: z
        .coerce.number()
        .optional()
        .describe("Cast at this level (for upcasting). Defaults to spell's base level."),
    },
    async (params) =>
      castSpell(client, {
        characterId: params.characterId,
        spellName: params.spellName,
        level: params.level,
      })
  );

  // Register character creation/builder tools
  server.tool(
    "create_character",
    "Create a new D&D Beyond character. Standard build creates a blank character. Quick build creates one with a class and species pre-selected.",
    {
      method: z.enum(["standard", "quick"]).describe("Build method: 'standard' (blank) or 'quick' (pre-configured)"),
      classId: z.coerce.number().optional().describe("Class ID for quick build. Use search_classes to find IDs. 2024 PHB: 2190875=Barbarian, 2190876=Bard, 2190877=Cleric, 2190878=Druid, 2190879=Fighter, 2190880=Monk, 2190881=Paladin, 2190882=Ranger, 2190883=Rogue, 2190884=Sorcerer, 2190885=Warlock, 2190886=Wizard"),
      entityRaceId: z.coerce.number().optional().describe("Race entity ID for quick build"),
      entityRaceTypeId: z.coerce.number().optional().describe("Race entity type ID for quick build"),
    },
    async (params) =>
      createCharacter(client, {
        method: params.method,
        classId: params.classId,
        entityRaceId: params.entityRaceId,
        entityRaceTypeId: params.entityRaceTypeId,
      })
  );

  server.tool(
    "delete_character",
    "Permanently delete a character from D&D Beyond",
    {
      characterId: z.coerce.number().describe("The character ID to delete"),
    },
    async (params) =>
      deleteCharacter(client, {
        characterId: params.characterId,
      })
  );

  server.tool(
    "add_class",
    "Add a class to a character at a specified level",
    {
      characterId: z.coerce.number().describe("The character ID"),
      classId: z.coerce.number().describe("Class ID. Use search_classes to find IDs. 2024 PHB: 2190875=Barbarian, 2190876=Bard, 2190877=Cleric, 2190878=Druid, 2190879=Fighter, 2190880=Monk, 2190881=Paladin, 2190882=Ranger, 2190883=Rogue, 2190884=Sorcerer, 2190885=Warlock, 2190886=Wizard"),
      level: z.coerce.number().describe("Class level to set"),
    },
    async (params) =>
      addClass(client, {
        characterId: params.characterId,
        classId: params.classId,
        level: params.level,
      })
  );

  server.tool(
    "set_background",
    "Set a character's background",
    {
      characterId: z.coerce.number().describe("The character ID"),
      backgroundId: z.coerce.number().describe("Background ID"),
    },
    async (params) =>
      setBackground(client, {
        characterId: params.characterId,
        backgroundId: params.backgroundId,
      })
  );

  server.tool(
    "set_background_choice",
    "Configure a background proficiency or equipment choice",
    {
      characterId: z.coerce.number().describe("The character ID"),
      type: z.coerce.number().describe("Choice type"),
      choiceKey: z.string().describe("Choice key identifier"),
      choiceValue: z.coerce.number().describe("Selected choice value"),
    },
    async (params) =>
      setBackgroundChoice(client, {
        characterId: params.characterId,
        type: params.type,
        choiceKey: params.choiceKey,
        choiceValue: params.choiceValue,
      })
  );

  server.tool(
    "set_class_feature_choice",
    "Resolve a class feature choice (e.g., warlock invocation, fighting style). Get choice data from the character's choices.class array.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      classId: z.coerce.number().describe("The class definition ID"),
      classFeatureId: z.coerce.number().describe("The class feature component ID"),
      classMappingId: z.coerce.number().describe("The character's class mapping ID"),
      type: z.coerce.number().describe("Choice type from the choice object"),
      choiceKey: z.string().describe("Choice key identifier from the choice object"),
      choiceValue: z.coerce.number().describe("Selected option ID"),
      parentChoiceId: z.coerce.number().optional().describe("Parent choice ID (for nested choices)"),
    },
    async (params) =>
      setClassFeatureChoice(client, {
        characterId: params.characterId,
        classId: params.classId,
        classFeatureId: params.classFeatureId,
        classMappingId: params.classMappingId,
        type: params.type,
        choiceKey: params.choiceKey,
        choiceValue: params.choiceValue,
        parentChoiceId: params.parentChoiceId,
      })
  );

  server.tool(
    "set_race_trait_choice",
    "Resolve a race/species trait choice (e.g., giant ancestry, ability score increase, language). Get choice data from the character's choices.race array.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      racialTraitId: z.coerce.number().describe("The racial trait component ID"),
      type: z.coerce.number().describe("Choice type from the choice object"),
      choiceKey: z.string().describe("Choice key identifier from the choice object"),
      choiceValue: z.coerce.number().describe("Selected option ID"),
    },
    async (params) =>
      setRaceTraitChoice(client, {
        characterId: params.characterId,
        racialTraitId: params.racialTraitId,
        type: params.type,
        choiceKey: params.choiceKey,
        choiceValue: params.choiceValue,
      })
  );

  server.tool(
    "set_feat_choice",
    "Resolve a feat choice (e.g., ability score increase option on an origin feat). Get choice data from the character's choices.feat array.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      featId: z.coerce.number().describe("The feat component ID"),
      type: z.coerce.number().describe("Choice type from the choice object"),
      choiceKey: z.string().describe("Choice key identifier from the choice object"),
      choiceValue: z.coerce.number().describe("Selected option ID"),
    },
    async (params) =>
      setFeatChoice(client, {
        characterId: params.characterId,
        featId: params.featId,
        type: params.type,
        choiceKey: params.choiceKey,
        choiceValue: params.choiceValue,
      })
  );

  server.tool(
    "resolve_choices",
    "Auto-resolve all unresolved builder choices on a character by picking the first available option for each. Handles cascading choices (resolving one may unlock more). Use after create_character to make the character builder-complete.",
    {
      characterId: z.coerce.number().describe("The character ID"),
    },
    async (params) =>
      resolveChoices(client, {
        characterId: params.characterId,
      })
  );

  server.tool(
    "set_species",
    "Set a character's species (race)",
    {
      characterId: z.coerce.number().describe("The character ID"),
      entityRaceId: z.coerce.number().describe("Race entity ID"),
      entityRaceTypeId: z.coerce.number().describe("Race entity type ID"),
    },
    async (params) =>
      setSpecies(client, {
        characterId: params.characterId,
        entityRaceId: params.entityRaceId,
        entityRaceTypeId: params.entityRaceTypeId,
      })
  );

  server.tool(
    "set_ability_score",
    "Set an ability score value for a character. statId: 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA. type: 1=standard array, 2=rolled, 3=point buy.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      statId: z.coerce.number().describe("Ability stat ID (1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA)"),
      type: z.coerce.number().describe("Score type (1=standard array, 2=rolled, 3=point buy)"),
      value: z.coerce.number().describe("The ability score value"),
    },
    async (params) =>
      setAbilityScore(client, {
        characterId: params.characterId,
        statId: params.statId,
        type: params.type,
        value: params.value,
      })
  );

  server.tool(
    "update_character_name",
    "Set or change a character's name",
    {
      characterId: z.coerce.number().describe("The character ID"),
      name: z.string().describe("The new character name"),
    },
    async (params) =>
      updateCharacterName(client, {
        characterId: params.characterId,
        name: params.name,
      })
  );

  server.tool(
    "set_class_level",
    "Set a character's class level. Requires the classMappingId (from the character's classes array, the 'id' field on each class entry).",
    {
      characterId: z.coerce.number().describe("The character ID"),
      classId: z.coerce.number().describe("The class definition ID"),
      classMappingId: z.coerce.number().describe("The character's class mapping ID (classes[].id)"),
      level: z.coerce.number().describe("The level to set (1-20)"),
    },
    async (params) =>
      setClassLevel(client, {
        characterId: params.characterId,
        classId: params.classId,
        classMappingId: params.classMappingId,
        level: params.level,
      })
  );

  server.tool(
    "set_ability_score_type",
    "Set the ability score generation method for a character. Must be set before assigning ability scores on standard-build characters.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      abilityScoreType: z.coerce.number().describe("1 = Standard Array, 2 = Rolled, 3 = Point Buy"),
    },
    async (params) =>
      setAbilityScoreType(client, {
        characterId: params.characterId,
        abilityScoreType: params.abilityScoreType,
      })
  );

  server.tool(
    "set_starting_equipment_type",
    "Set the starting equipment type for a character during creation",
    {
      characterId: z.coerce.number().describe("The character ID"),
      startingEquipmentType: z.coerce.number().describe("Starting equipment type (1 = Normal, 3 = Equipment)"),
    },
    async (params) =>
      setStartingEquipmentType(client, {
        characterId: params.characterId,
        startingEquipmentType: params.startingEquipmentType,
      })
  );

  server.tool(
    "add_inventory_items",
    "Add items to a character's inventory. Item entity types: 1782728300 = weapon, 2103445194 = gear/equipment.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      equipment: z.array(z.object({
        entityId: z.coerce.number().describe("Item entity ID"),
        entityTypeId: z.coerce.number().describe("Item entity type ID (1782728300=weapon, 2103445194=gear)"),
        quantity: z.coerce.number().describe("Quantity to add"),
      })).describe("Array of items to add"),
    },
    async (params) =>
      addInventoryItems(client, {
        characterId: params.characterId,
        equipment: params.equipment,
      })
  );

  server.tool(
    "set_gold",
    "Set the gold amount on a character (used during character creation for starting gold)",
    {
      characterId: z.coerce.number().describe("The character ID"),
      amount: z.coerce.number().describe("Gold amount to set"),
    },
    async (params) =>
      setGold(client, {
        characterId: params.characterId,
        amount: params.amount,
      })
  );

  server.tool(
    "list_inventory_items",
    "List character inventory items, including inventory item IDs needed by inventory write tools. Includes custom items by default.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      includeCustom: z.boolean().optional().describe("Include custom items (default: true)"),
    },
    async (params) =>
      listInventoryItems(client, {
        characterId: params.characterId,
        includeCustom: params.includeCustom,
      })
  );

  server.tool(
    "add_catalog_item",
    "Add an official/catalog item to character inventory by itemName, or by entityId/entityTypeId from search_items/get_item.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      itemName: z.string().optional().describe("Catalog item name to search for, e.g. 'Dagger'"),
      entityId: z.coerce.number().optional().describe("Catalog item entity ID"),
      entityTypeId: z.coerce.number().optional().describe("Catalog item entity type ID"),
      quantity: z.coerce.number().optional().describe("Quantity to add (default: 1)"),
    },
    async (params) =>
      addCatalogItem(client, {
        characterId: params.characterId,
        itemName: params.itemName,
        entityId: params.entityId,
        entityTypeId: params.entityTypeId,
        quantity: params.quantity,
      })
  );

  server.tool(
    "set_inventory_item_quantity",
    "Set the quantity of an inventory item using its inventory item ID from list_inventory_items.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
      quantity: z.coerce.number().describe("New quantity (0 or greater)"),
    },
    async (params) =>
      setInventoryItemQuantity(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
        quantity: params.quantity,
      })
  );

  server.tool(
    "set_inventory_item_equipped",
    "Equip or unequip an inventory item using its inventory item ID from list_inventory_items.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
      value: z.boolean().describe("true to equip, false to unequip"),
    },
    async (params) =>
      setInventoryItemEquipped(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
        value: params.value,
      })
  );

  server.tool(
    "set_inventory_item_attuned",
    "Attune or unattune an inventory item using its inventory item ID from list_inventory_items.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
      value: z.boolean().describe("true to attune, false to unattune"),
    },
    async (params) =>
      setInventoryItemAttuned(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
        value: params.value,
      })
  );

  server.tool(
    "set_inventory_item_charge",
    "Set used charges for an inventory item using its inventory item ID from list_inventory_items.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
      charges: z.coerce.number().describe("Used charges count"),
    },
    async (params) =>
      setInventoryItemCharge(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
        charges: params.charges,
      })
  );

  server.tool(
    "move_inventory_item",
    "Move an inventory item to a container. Use the target container inventory ID and entity type; character container type is 1581111423, inventory item/container type is usually 1439493548.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
      containerEntityId: z.coerce.number().describe("Target container entity ID"),
      containerEntityTypeId: z.coerce.number().describe("Target container entity type ID"),
    },
    async (params) =>
      moveInventoryItem(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
        containerEntityId: params.containerEntityId,
        containerEntityTypeId: params.containerEntityTypeId,
      })
  );

  server.tool(
    "remove_inventory_item",
    "Remove an inventory item using its inventory item ID from list_inventory_items. Custom items are deleted through the custom-item endpoint automatically.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
    },
    async (params) =>
      removeInventoryItem(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
      })
  );

  server.tool(
    "create_custom_item",
    "Create a custom item directly on a character. Use list_inventory_items afterward to get its inventory item ID for updates/deletion.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      name: z.string().describe("Custom item name"),
      description: z.string().optional().describe("Custom item description"),
      quantity: z.coerce.number().optional().describe("Quantity (default: 1)"),
      weight: z.coerce.number().optional().describe("Weight in pounds (default: 0)"),
      cost: z.coerce.number().nullable().optional().describe("Cost in gp, or null"),
      containerEntityId: z.coerce.number().optional().describe("Optional container entity ID; defaults to the character ID"),
      containerEntityTypeId: z.coerce.number().optional().describe("Optional container entity type ID; defaults to character container type"),
    },
    async (params) =>
      createCustomItem(client, {
        characterId: params.characterId,
        name: params.name,
        description: params.description,
        quantity: params.quantity,
        weight: params.weight,
        cost: params.cost,
        containerEntityId: params.containerEntityId,
        containerEntityTypeId: params.containerEntityTypeId,
      })
  );

  server.tool(
    "update_custom_item",
    "Update a custom item's name, description, quantity, weight, or cost using its inventory item ID from list_inventory_items.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
      name: z.string().optional().describe("New custom item name"),
      description: z.string().optional().describe("New custom item description"),
      quantity: z.coerce.number().optional().describe("New quantity"),
      weight: z.coerce.number().optional().describe("New weight in pounds"),
      cost: z.coerce.number().nullable().optional().describe("New cost in gp, or null"),
    },
    async (params) =>
      updateCustomItem(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
        name: params.name,
        description: params.description,
        quantity: params.quantity,
        weight: params.weight,
        cost: params.cost,
      })
  );

  server.tool(
    "delete_custom_item",
    "Delete a custom item using its inventory item ID from list_inventory_items.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      inventoryItemId: z.coerce.number().describe("Inventory item mapping ID from list_inventory_items"),
    },
    async (params) =>
      deleteCustomItem(client, {
        characterId: params.characterId,
        inventoryItemId: params.inventoryItemId,
      })
  );

  server.tool(
    "update_description",
    "Update a character description field. Fields: alignment (alignmentId number), lifestyle (lifestyleId number), faith, hair, skin, eyes, height, weight, age, gender, personalityTraits, ideals, bonds, flaws, backstory, otherNotes, allies, organizations, enemies.",
    {
      characterId: z.coerce.number().describe("The character ID"),
      field: z.string().describe("Description field name (e.g., 'alignment', 'backstory', 'hair')"),
      value: z.union([z.string(), z.coerce.number()]).describe("Value to set (string for text fields, number for alignment/lifestyle IDs)"),
    },
    async (params) =>
      updateDescription(client, {
        characterId: params.characterId,
        field: params.field,
        value: params.value,
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
      campaignId: z.coerce.number().describe("The campaign ID"),
    },
    async (params) =>
      getCampaignCharacters(client, {
        campaignId: params.campaignId,
      })
  );

  // Register reference tools - spells
  server.tool(
    "search_spells",
    "Search the full spell compendium by name, level, school, concentration, or ritual",
    {
      name: z.string().optional().describe("Spell name (partial match)"),
      level: z.coerce.number().optional().describe("Spell level (0-9, 0=cantrip)"),
      school: z
        .string()
        .optional()
        .describe("School of magic (e.g., evocation, abjuration)"),
      concentration: z.boolean().optional().describe("Requires concentration"),
      ritual: z.boolean().optional().describe("Can be cast as ritual"),
    },
    async (params) =>
      searchSpells(client, {
        name: params.name,
        level: params.level,
        school: params.school,
        concentration: params.concentration,
        ritual: params.ritual,
      })
  );

  server.tool(
    "get_spell",
    "Get full details for a specific spell by name from the compendium",
    {
      spellName: z.string().describe("The spell name"),
    },
    async (params) =>
      getSpell(client, { spellName: params.spellName })
  );

  // Register reference tools - monsters
  server.tool(
    "search_monsters",
    "Search for monsters by name, CR, type, or size. Supports pagination and homebrew. Note: CR/type/size filters search the first 200 alphabetical monsters. For best results, combine filters with a name search term.",
    {
      name: z.string().optional().describe("Monster name (partial match)"),
      cr: z.coerce.number().optional().describe("Challenge Rating"),
      type: z
        .string()
        .optional()
        .describe("Monster type (e.g., dragon, undead, humanoid)"),
      size: z
        .string()
        .optional()
        .describe("Size (tiny, small, medium, large, huge, gargantuan)"),
      page: z.coerce.number().optional().describe("Page number (default: 1, 20 results per page)"),
      showHomebrew: z.boolean().optional().describe("Include homebrew monsters"),
      source: z
        .string()
        .optional()
        .describe("Source book name (e.g., 'Monster Manual', 'Volo's Guide')"),
    },
    async (params) =>
      searchMonsters(client, {
        name: params.name,
        cr: params.cr,
        type: params.type,
        size: params.size,
        page: params.page,
        showHomebrew: params.showHomebrew,
        source: params.source,
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

  // Register reference tools - races
  server.tool(
    "search_races",
    "Search for character races by name",
    {
      name: z.string().optional().describe("Race name (partial match)"),
    },
    async (params) =>
      searchRaces(client, {
        name: params.name,
      })
  );

  // Register reference tools - backgrounds
  server.tool(
    "search_backgrounds",
    "Search for character backgrounds by name",
    {
      name: z.string().optional().describe("Background name (partial match)"),
    },
    async (params) =>
      searchBackgrounds(client, {
        name: params.name,
      })
  );

  // Register reference tools - class features
  server.tool(
    "search_class_features",
    "Search for class features by name, class, or level",
    {
      name: z.string().optional().describe("Feature name (partial match)"),
      className: z.string().optional().describe("Class name to filter by (e.g., 'Fighter', 'Wizard')"),
      level: z.coerce.number().optional().describe("Class level requirement"),
    },
    async (params) =>
      searchClassFeatures(client, {
        name: params.name,
        className: params.className,
        level: params.level,
      })
  );

  // Register reference tools - racial traits
  server.tool(
    "search_racial_traits",
    "Search for racial traits by name or race",
    {
      name: z.string().optional().describe("Trait name (partial match)"),
      raceName: z.string().optional().describe("Race name to filter by (e.g., 'Elf', 'Dwarf')"),
    },
    async (params) =>
      searchRacialTraits(client, {
        name: params.name,
        raceName: params.raceName,
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
