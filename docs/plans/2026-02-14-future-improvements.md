# Future Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 6 gap analysis future improvements: proficiency display, endpoint testing/integration, tool consolidation, and source book filter.

**Architecture:** Each item is largely independent. Proficiencies and tool consolidation both touch `src/tools/character.ts` and `src/server.ts`. Endpoint testing items (2, 4, 5) require live API exploration followed by integration. Monster source filter touches `src/tools/reference.ts`, `src/types/reference.ts`, and `src/api/endpoints.ts`.

**Tech Stack:** TypeScript, MCP SDK, Vitest, Zod schemas

---

### Agent Team

| Teammate | Model | Tasks |
|----------|-------|-------|
| piper-the-proficiency-parser | sonnet | Task 1 (proficiency display) |
| elena-the-endpoint-explorer | sonnet | Tasks 2, 4, 5 (endpoint research + integration) |
| clara-the-consolidator | sonnet | Task 3 (tool consolidation) — blocked by Task 1 |
| maria-the-monster-modifier | sonnet | Task 6 (source book filter) |
| Lead (self) | — | Coordination, final testing, review |

Parallel groups: [Task 1] ∥ [Tasks 2, 4, 5] ∥ [Task 6]. Task 3 starts after Task 1 completes (needs proficiency format function).

---

## Task 1: Display Proficiencies

**Files:**
- Modify: `src/tools/character.ts` (add `formatProficiencies()`, insert into `formatCharacterSheet()`)
- Create: `tests/tools/character-proficiencies.test.ts`

**Context:** Proficiency data lives in `DdbCharacter.modifiers` — a `Record<string, DdbModifier[]>` where keys are sources like `"race"`, `"class"`, `"background"`, `"item"`, `"feat"`. Each modifier has `type` (e.g. `"proficiency"`) and `subType` (e.g. `"light-armor"`, `"longswords"`, `"thieves-tools"`, `"common"`). The existing `hasModifierBySubType()` function at line 203 iterates all modifier lists to check for a match — we need a similar function that collects all proficiency modifiers and groups them by category.

**Step 1: Write the failing test**

Create `tests/tools/character-proficiencies.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getCharacterSheet } from "../../src/tools/character.js";
import type { DdbClient } from "../../src/api/client.js";
import type { DdbCharacter } from "../../src/types/character.js";
import type { DdbCampaign } from "../../src/types/api.js";

function createMockClient(): DdbClient {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
  } as unknown as DdbClient;
}

const mockCampaigns: DdbCampaign[] = [
  {
    id: 999,
    name: "Test Campaign",
    dmId: 1,
    dmUsername: "dm",
    playerCount: 1,
    dateCreated: "1/1/2026",
  },
];

const mockCampaignCharacters = [
  { id: 12345, name: "Thorin", userId: 1, userName: "player1", avatarUrl: "", characterStatus: 0, isAssigned: true },
];

function createCharacterWithProficiencies(): DdbCharacter {
  return {
    id: 12345,
    readonlyUrl: "",
    name: "Thorin Ironforge",
    race: {
      fullName: "Mountain Dwarf",
      baseRaceName: "Dwarf",
      isHomebrew: false,
      racialTraits: [],
    },
    classes: [
      {
        id: 1,
        definition: { name: "Fighter" },
        subclassDefinition: null,
        level: 5,
        isStartingClass: true,
        classFeatures: [],
      },
    ],
    background: { definition: null },
    stats: [
      { id: 1, value: 16 },
      { id: 2, value: 14 },
      { id: 3, value: 15 },
      { id: 4, value: 10 },
      { id: 5, value: 12 },
      { id: 6, value: 8 },
    ],
    bonusStats: [],
    overrideStats: [],
    modifiers: {
      race: [
        { id: "r1", type: "proficiency", subType: "battleaxes", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Battleaxes", componentId: 1, componentTypeId: 1 },
        { id: "r2", type: "proficiency", subType: "common", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Common", componentId: 1, componentTypeId: 1 },
        { id: "r3", type: "proficiency", subType: "dwarvish", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Dwarvish", componentId: 1, componentTypeId: 1 },
      ],
      class: [
        { id: "c1", type: "proficiency", subType: "light-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Light Armor", componentId: 2, componentTypeId: 2 },
        { id: "c2", type: "proficiency", subType: "medium-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Medium Armor", componentId: 2, componentTypeId: 2 },
        { id: "c3", type: "proficiency", subType: "heavy-armor", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Heavy Armor", componentId: 2, componentTypeId: 2 },
        { id: "c4", type: "proficiency", subType: "shields", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Shields", componentId: 2, componentTypeId: 2 },
        { id: "c5", type: "proficiency", subType: "simple-weapons", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Simple Weapons", componentId: 2, componentTypeId: 2 },
        { id: "c6", type: "proficiency", subType: "martial-weapons", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Martial Weapons", componentId: 2, componentTypeId: 2 },
        { id: "c7", type: "proficiency", subType: "strength-saving-throws", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Strength Saving Throws", componentId: 2, componentTypeId: 2 },
      ],
      background: [
        { id: "b1", type: "proficiency", subType: "smiths-tools", value: null, friendlyTypeName: "Proficiency", friendlySubtypeName: "Smith's Tools", componentId: 3, componentTypeId: 3 },
      ],
      item: [],
      feat: [],
      condition: [],
    },
    baseHitPoints: 42,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    currentXp: 0,
    alignmentId: 1,
    lifestyleId: 1,
    currencies: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: { race: [], class: [], background: [], item: [], feat: [] },
    inventory: [],
    deathSaves: { failCount: null, successCount: null, isStabilized: false },
    traits: { personalityTraits: null, ideals: null, bonds: null, flaws: null, appearance: null },
    preferences: {},
    configuration: {},
    actions: { race: [], class: [], feat: [] },
    feats: [],
    notes: { personalPossessions: null, backstory: null, otherNotes: null, allies: null, organizations: null },
    campaign: { id: 999, name: "Test Campaign" },
  };
}

describe("formatProficiencies in character sheet", () => {
  it("should display armor, weapon, tool, and language proficiencies", async () => {
    const client = createMockClient();
    const char = createCharacterWithProficiencies();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(char);

    const result = await getCharacterSheet(client, { characterName: "Thorin" });
    const text = result.content[0].text;

    expect(text).toContain("--- Proficiencies ---");
    expect(text).toContain("Armor:");
    expect(text).toContain("Light Armor");
    expect(text).toContain("Heavy Armor");
    expect(text).toContain("Weapons:");
    expect(text).toContain("Simple Weapons");
    expect(text).toContain("Tools:");
    expect(text).toContain("Smith's Tools");
    expect(text).toContain("Languages:");
    expect(text).toContain("Common");
    expect(text).toContain("Dwarvish");
  });

  it("should exclude saving throw and skill proficiencies from the proficiencies section", async () => {
    const client = createMockClient();
    const char = createCharacterWithProficiencies();
    vi.mocked(client.get)
      .mockResolvedValueOnce(mockCampaigns)
      .mockResolvedValueOnce(mockCampaignCharacters)
      .mockResolvedValueOnce(char);

    const result = await getCharacterSheet(client, { characterName: "Thorin" });
    const profSection = result.content[0].text.split("--- Proficiencies ---")[1]?.split("---")[0] ?? "";

    // Saving throws should NOT appear in proficiencies section (they have their own section)
    expect(profSection).not.toContain("Saving Throws");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/character-proficiencies.test.ts`
Expected: FAIL — "--- Proficiencies ---" not found in output

**Step 3: Implement `formatProficiencies()` in `src/tools/character.ts`**

Add this function after `formatSkills()` (around line 270):

```typescript
// Proficiency subTypes that belong to other sections (saving throws, skills)
const EXCLUDED_PROFICIENCY_SUBTYPES = new Set([
  "strength-saving-throws", "dexterity-saving-throws", "constitution-saving-throws",
  "intelligence-saving-throws", "wisdom-saving-throws", "charisma-saving-throws",
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival",
]);

const ARMOR_SUBTYPES = new Set(["light-armor", "medium-armor", "heavy-armor", "shields"]);
const WEAPON_GROUPS = new Set(["simple-weapons", "martial-weapons"]);

// Known language subTypes (lowercase, hyphenated)
const LANGUAGE_SUBTYPES = new Set([
  "common", "dwarvish", "elvish", "giant", "gnomish", "goblin", "halfling", "orc",
  "abyssal", "celestial", "draconic", "deep-speech", "infernal", "primordial",
  "sylvan", "undercommon", "thieves-cant", "druidic", "aarakocra", "auran",
  "aquan", "ignan", "terran",
]);

function formatProficiencies(char: DdbCharacter): string {
  const armor: Set<string> = new Set();
  const weapons: Set<string> = new Set();
  const tools: Set<string> = new Set();
  const languages: Set<string> = new Set();

  for (const list of Object.values(char.modifiers)) {
    if (!Array.isArray(list)) continue;
    for (const mod of list) {
      if (mod.type !== "proficiency") continue;
      if (EXCLUDED_PROFICIENCY_SUBTYPES.has(mod.subType)) continue;

      const displayName = mod.friendlySubtypeName || mod.subType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

      if (ARMOR_SUBTYPES.has(mod.subType)) {
        armor.add(displayName);
      } else if (WEAPON_GROUPS.has(mod.subType)) {
        weapons.add(displayName);
      } else if (LANGUAGE_SUBTYPES.has(mod.subType)) {
        languages.add(displayName);
      } else if (mod.subType.endsWith("-tools") || mod.subType.includes("tools") ||
                 mod.subType.includes("kit") || mod.subType.includes("supplies") ||
                 mod.subType.includes("instrument") || mod.subType.includes("set")) {
        tools.add(displayName);
      } else if (mod.friendlySubtypeName && /^[A-Z]/.test(mod.friendlySubtypeName) &&
                 !mod.subType.includes("weapon") && !mod.subType.includes("armor")) {
        // Individual weapon proficiencies (e.g., "battleaxes", "handaxes") go to weapons
        weapons.add(displayName);
      } else {
        weapons.add(displayName); // Default: treat unknown proficiencies as weapon-like
      }
    }
  }

  const lines: string[] = [];
  if (armor.size > 0) lines.push(`Armor: ${[...armor].sort().join(", ")}`);
  if (weapons.size > 0) lines.push(`Weapons: ${[...weapons].sort().join(", ")}`);
  if (tools.size > 0) lines.push(`Tools: ${[...tools].sort().join(", ")}`);
  if (languages.size > 0) lines.push(`Languages: ${[...languages].sort().join(", ")}`);

  if (lines.length === 0) return "";

  return `\n--- Proficiencies ---\n${lines.join("\n")}`;
}
```

Then insert the proficiency section into `formatCharacterSheet()` (around line 488, after Skills section):

```typescript
  // Add proficiencies display (after skills, before spellcasting)
  const proficiencies = formatProficiencies(char);
  if (proficiencies) sections.push(proficiencies.trim());
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/character-proficiencies.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/tools/character.ts tests/tools/character-proficiencies.test.ts
git commit -m "feat: display armor, weapon, tool, and language proficiencies in character sheet"
```

---

## Task 2: Test & Integrate `user-campaigns` Endpoint

**Files:**
- Modify: `src/api/endpoints.ts` (add `userCampaigns` endpoint)
- Modify: `src/tools/campaign.ts` (switch or add endpoint)
- Modify: `tests/tools/campaign.test.ts` (update tests)

**Context:** The current `list_campaigns` tool calls `GET /api/campaign/stt/active-campaigns`. The gap analysis mentions `GET /api/campaign/stt/user-campaigns` may return more campaigns. Both endpoints are on `www.dndbeyond.com` and require cookie + Bearer auth. The `DdbClient.get()` method auto-unwraps the `{ status: "success", data }` envelope.

**Step 1: Add the endpoint constant**

In `src/api/endpoints.ts`, add inside the `campaign` object:

```typescript
userCampaigns: () => `${DDB_WATERDEEP}/api/campaign/stt/user-campaigns`,
```

**Step 2: Write a test that exercises the new endpoint**

Add a test in `tests/tools/campaign.test.ts` that verifies `listCampaigns` works with the user-campaigns endpoint (or a new function). The exact integration depends on what the endpoint returns — this is a research task first.

**Step 3: Test the endpoint live**

Use the existing `DdbClient` to make a test call:
```typescript
const response = await client.get<DdbCampaign[]>(ENDPOINTS.campaign.userCampaigns(), "user-campaigns", 60_000);
```

Compare the response shape and data count with `active-campaigns`. Document findings.

**Step 4: Integration decision**

- If `user-campaigns` returns a superset: switch `list_campaigns` to use it
- If it returns different data: consider adding a `scope` parameter (`"active"` | `"all"`)
- If identical: document and keep `active-campaigns`

**Step 5: Update `listCampaigns` in `src/tools/campaign.ts` based on findings**

If switching endpoints, change line 10:
```typescript
// Before:
ENDPOINTS.campaign.list()
// After:
ENDPOINTS.campaign.userCampaigns()
```

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/api/endpoints.ts src/tools/campaign.ts tests/tools/campaign.test.ts
git commit -m "feat: test and integrate user-campaigns endpoint for broader campaign listing"
```

---

## Task 3: Consolidate Character Read Tools

**Files:**
- Modify: `src/tools/character.ts` (merge exported functions)
- Modify: `src/server.ts` (replace 3 tool registrations with 1)
- Modify: `tests/tools/character.test.ts` (update tests)
- Modify: `tests/integration/server.test.ts` (update tool name references if any)

**Depends on:** Task 1 (proficiency display should be in place before consolidation)

**Context:** Currently three separate exported functions — `getCharacter()`, `getCharacterSheet()`, `getCharacterFull()` — and three tool registrations in `server.ts` (lines 82-161). These become one `getCharacter()` with a `detail` parameter.

**Step 1: Write the failing test**

In `tests/tools/character.test.ts`, add a test for the new unified function:

```typescript
describe("getCharacter with detail levels", () => {
  it("should return summary by detail='summary'", async () => {
    // ... setup mock
    const result = await getCharacter(client, { characterName: "Thorin", detail: "summary" });
    const text = result.content[0].text;
    expect(text).toContain("Name: Thorin");
    expect(text).not.toContain("--- Saving Throws");
  });

  it("should return full sheet by detail='sheet' (default)", async () => {
    const result = await getCharacter(client, { characterName: "Thorin" });
    const text = result.content[0].text;
    expect(text).toContain("--- Saving Throws");
    expect(text).toContain("--- Skills");
  });

  it("should return expanded definitions by detail='full'", async () => {
    const result = await getCharacter(client, { characterName: "Thorin", detail: "full" });
    const text = result.content[0].text;
    expect(text).toContain("=== ");  // Definition sections use === headers
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/character.test.ts`
Expected: FAIL — `detail` param not accepted

**Step 3: Modify `getCharacter()` in `src/tools/character.ts`**

Update the `GetCharacterParams` interface:

```typescript
interface GetCharacterParams {
  characterId?: number;
  characterName?: string;
  detail?: "summary" | "sheet" | "full";
}
```

Merge the three functions into one:

```typescript
export async function getCharacter(
  client: DdbClient,
  params: GetCharacterParams
): Promise<ToolResult> {
  const idOrError = await resolveCharacterId(client, params);
  if (typeof idOrError === "string") {
    return { content: [{ type: "text", text: idOrError }] };
  }

  const character = await client.get<DdbCharacter>(
    ENDPOINTS.character.get(idOrError),
    `character:${idOrError}`,
    60_000
  );

  const detail = params.detail ?? "sheet";
  let text: string;
  switch (detail) {
    case "summary":
      text = formatCharacter(character);
      break;
    case "full":
      text = formatCharacterFull(character);
      break;
    case "sheet":
    default:
      text = formatCharacterSheet(character);
      break;
  }

  return { content: [{ type: "text", text }] };
}
```

Remove the now-redundant `getCharacterSheet()` and `getCharacterFull()` exports — keep `formatCharacterSheet` and `formatCharacterFull` as internal helpers.

**Step 4: Update `src/server.ts`**

Remove the `get_character_sheet` and `get_character_full` tool registrations (lines 106-161). Update the `get_character` registration:

```typescript
server.tool(
  "get_character",
  "Get character details by ID or name. Use 'detail' to control output: 'summary' (basic stats), 'sheet' (comprehensive with saves/skills/features, default), or 'full' (sheet + all definitions expanded, ~15-30KB).",
  {
    characterId: z.coerce.number().optional().describe("The character ID"),
    characterName: z.string().optional().describe("The character name (case-insensitive search)"),
    detail: z.enum(["summary", "sheet", "full"]).optional().describe("Detail level: 'summary', 'sheet' (default), or 'full'"),
  },
  async (params) =>
    getCharacter(client, {
      characterId: params.characterId,
      characterName: params.characterName,
      detail: params.detail,
    })
);
```

Update imports in `server.ts` — remove `getCharacterSheet`, `getCharacterFull` from the import.

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All PASS (some existing tests may need `detail` param or tool name updates)

**Step 6: Fix any broken tests**

Tests that called `getCharacterSheet()` or `getCharacterFull()` directly need to switch to `getCharacter(client, { ..., detail: "sheet" })` or `detail: "full"`. Integration tests referencing `"get_character_sheet"` or `"get_character_full"` tool names need updating.

**Step 7: Commit**

```bash
git add src/tools/character.ts src/server.ts tests/
git commit -m "feat: consolidate character tools into single get_character with detail parameter"
```

---

## Task 4: Test & Integrate `always-prepared-spells` Endpoint

**Files:**
- Modify: `src/api/endpoints.ts` (add endpoint)
- Possibly modify: `src/tools/reference.ts` (integrate if useful)
- Create: test file if integrating

**Context:** The `always-known-spells` endpoint at `character-service.dndbeyond.com/character/v5/game-data/always-known-spells?classId={id}&classLevel=20&sharingSetting=2` requires NO auth and is used for the spell compendium. The `always-prepared-spells` endpoint follows the same URL pattern but may return auto-prepared spell lists (e.g., domain spells for Clerics, circle spells for Druids).

**Step 1: Add the endpoint constant**

In `src/api/endpoints.ts`, add inside `gameData`:

```typescript
alwaysPreparedSpells: (classId: number, classLevel: number = 20) =>
  `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-prepared-spells?classId=${classId}&classLevel=${classLevel}&sharingSetting=2`,
```

**Step 2: Test the endpoint live**

Query each casting class (IDs 1-8) and inspect:
- Response shape — does it match `always-known-spells`?
- Data contents — what spells does it return?
- Auth requirement — does it work without auth like always-known-spells?

**Step 3: Integration decision**

If the endpoint returns data:
- Consider merging into the spell compendium (deduplicate with always-known-spells)
- Or expose as a separate tool parameter (e.g., `search_spells` with `preparedOnly: true`)
- Or enhance character sheet to show which of a character's spells are always-prepared

If the endpoint returns empty or errors: document and skip.

**Step 4: Implement based on findings**

If integrating into spell compendium, modify `searchSpells()` in `src/tools/reference.ts` to also fetch always-prepared-spells and merge results.

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/api/endpoints.ts src/tools/reference.ts
git commit -m "feat: test and integrate always-prepared-spells endpoint"
```

---

## Task 5: Test & Integrate `class-feature/collection` and `racial-trait/collection`

**Files:**
- Modify: `src/api/endpoints.ts` (add endpoints)
- Possibly modify: `src/tools/reference.ts` (add detail tools)
- Create: test files if integrating

**Context:** Found in ddb-proxy research — `GET /character/v5/game-data/class-feature/collection` and `GET /character/v5/game-data/racial-trait/collection`. These likely return bulk feature/trait data with descriptions, similar to how `classes`, `races`, `feats` endpoints work. They require auth (Bearer token).

**Step 1: Add endpoint constants**

In `src/api/endpoints.ts`, add inside `gameData`:

```typescript
classFeatureCollection: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/class-feature/collection`,
racialTraitCollection: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/racial-trait/collection`,
```

**Step 2: Test both endpoints live**

Fetch both and inspect:
- Response shape — array of objects? What fields?
- Data volume — how many features/traits?
- Usefulness — do they have descriptions, level requirements, class associations?

**Step 3: Integration decision**

If rich data:
- Could add `get_class_feature` detail tool (like `get_spell` but for class features)
- Could enhance `search_classes` to include feature descriptions
- Could add `search_class_features` and `search_racial_traits` tools

If thin data or errors: document and skip.

**Step 4: Implement based on findings**

Follow the existing reference tool pattern in `src/tools/reference.ts`:
1. Add types for the response shape
2. Add search/get functions
3. Register tools in `src/server.ts`

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/api/endpoints.ts src/tools/reference.ts src/server.ts
git commit -m "feat: test and integrate class-feature and racial-trait collection endpoints"
```

---

## Task 6: Add Source Book Filter to Monster Search

**Files:**
- Modify: `src/types/reference.ts` (add `source` to `MonsterSearchParams`)
- Modify: `src/api/endpoints.ts` (add `sources` param to monster search URL)
- Modify: `src/tools/reference.ts` (resolve source name to ID, pass to API)
- Modify: `src/server.ts` (add `source` param to `search_monsters` schema)
- Create: `tests/tools/reference-monster-source.test.ts`

**Context:** The monster search API at `monster-service.dndbeyond.com/v1/Monster` supports a `sources={sourceId}` query parameter. Source IDs need to be resolved from human-readable names. The config endpoint at `GET /api/config/json` returns lookup tables — we need to check if it includes source book mappings. If not, we may need a hardcoded map of common source books.

**Step 1: Write the failing test**

Create `tests/tools/reference-monster-source.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { searchMonsters } from "../../src/tools/reference.js";
import { DdbClient } from "../../src/api/client.js";

const MOCK_CONFIG = {
  challengeRatings: [{ id: 5, value: 1, xp: 200, proficiencyBonus: 2 }],
  monsterTypes: [{ id: 11, name: "Humanoid" }],
  environments: [],
  alignments: [],
  damageTypes: [],
  senses: [],
  sources: [
    { id: 1, name: "Monster Manual" },
    { id: 2, name: "Volo's Guide to Monsters" },
  ],
};

const MOCK_RESPONSE = {
  accessType: {},
  pagination: { take: 20, skip: 0, currentPage: 1, pages: 1, total: 1 },
  data: [
    {
      id: 1001,
      name: "Goblin",
      typeId: 11,
      challengeRatingId: 5,
      sizeId: 3,
      isHomebrew: false,
      stats: [],
      movements: [],
      senses: [],
      languages: [],
    },
  ],
};

function createRoutingMockClient(monsterResponses: unknown[]) {
  const responseQueue = [...monsterResponses];
  const getRawFn = vi.fn(async (url: string) => {
    if (url.includes("config/json")) return MOCK_CONFIG;
    return responseQueue.shift();
  });
  return {
    get: vi.fn(),
    getRaw: getRawFn,
  } as unknown as DdbClient;
}

describe("search_monsters with source filter", () => {
  it("should pass sources parameter to the API when source is provided", async () => {
    const client = createRoutingMockClient([MOCK_RESPONSE]);
    await searchMonsters(client, { source: "Monster Manual" });

    const monsterUrl = vi.mocked(client.getRaw).mock.calls.find(
      (call) => !call[0].toString().includes("config/json")
    )?.[0];
    expect(monsterUrl).toContain("sources=");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/reference-monster-source.test.ts`
Expected: FAIL — `source` param not recognized

**Step 3: Add `source` to `MonsterSearchParams`**

In `src/types/reference.ts`:

```typescript
export interface MonsterSearchParams {
  name?: string;
  cr?: number;
  type?: string;
  size?: string;
  environment?: string;
  page?: number;
  showHomebrew?: boolean;
  source?: string;  // Source book name (e.g., "Monster Manual")
}
```

**Step 4: Update the endpoint builder**

In `src/api/endpoints.ts`, update `monster.search`:

```typescript
search: (search: string = "", skip: number = 0, take: number = 20, showHomebrew?: boolean, sources?: string) => {
  const homebrewParam = showHomebrew ? "&showHomebrew=t" : "";
  const sourcesParam = sources ? `&sources=${encodeURIComponent(sources)}` : "";
  return `${DDB_MONSTER_SERVICE}/v1/Monster?search=${encodeURIComponent(search)}&skip=${skip}&take=${take}${homebrewParam}${sourcesParam}`;
},
```

**Step 5: Add source resolution and update `searchMonsters()`**

In `src/tools/reference.ts`, update the `GameConfig` interface to include sources (if the config endpoint has them), and update `searchMonsters()` to resolve source name → ID and pass it to the endpoint.

Check the config endpoint first — if sources aren't in the config, add a hardcoded `SOURCE_MAP`:

```typescript
const SOURCE_MAP: Record<string, number> = {
  "monster manual": 1,
  "volos guide": 2,
  "mordenkainens tome": 3,
  // ... add common sources
};
```

In `searchMonsters()`, resolve the source name before the fetch loop:

```typescript
let sourceId: string | undefined;
if (params.source) {
  // Try config first, then hardcoded map
  const sourceLower = params.source.toLowerCase();
  // ... resolution logic
  sourceId = resolvedId?.toString();
}

// Pass to endpoint builder
const url = ENDPOINTS.monster.search(searchTerm, skip, 20, params.showHomebrew, sourceId);
```

**Step 6: Register the `source` param in `src/server.ts`**

Add to the `search_monsters` tool schema (around line 391):

```typescript
source: z.string().optional().describe("Source book name (e.g., 'Monster Manual', 'Volo's Guide')"),
```

And pass it through:

```typescript
source: params.source,
```

**Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add src/types/reference.ts src/api/endpoints.ts src/tools/reference.ts src/server.ts tests/tools/reference-monster-source.test.ts
git commit -m "feat: add source book filter to monster search"
```

---

## Final Verification

After all tasks complete:

1. Run full test suite: `npx vitest run`
2. Build check: `npm run build`
3. Verify tool count: should be 23 tools (was 25, minus 2 removed by consolidation)
4. Update gap analysis: mark all 6 future improvements as complete

```bash
git add -A && git commit -m "chore: final verification — all 6 future improvements complete"
```
