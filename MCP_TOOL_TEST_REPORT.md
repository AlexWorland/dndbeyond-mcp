# D&D Beyond MCP Server — Tool Test Report

**Date:** 2026-02-14
**Test Method:** Live MCP tool calls against D&D Beyond production APIs
**Test Character:** Jane Dont (ID: 161336179), Campaign: "One Shot" (ID: 7506650)

---

## Summary

| Category | Tools | Pass | Fail | Not Testable |
|----------|-------|------|------|--------------|
| Auth | 2 | 1 | 0 | 1 (setup_auth opens browser) |
| Character Read | 5 | 3 | 2 | 0 |
| Character Write | 9 | 0 | 9 | 0 |
| Campaign | 2 | 0 | 2 | 0 |
| Reference Search | 6 | 4 | 2 (partial) | 0 |
| Reference Detail | 4 | 4 | 0 | 0 |
| **Not Exposed** | 6 | — | — | 6 |
| **Total** | **29** | **12** | **15** | **7** |

---

## Critical Issues

### ISSUE-1: Campaign API Response Structure Changed

**Affected Tools:** `list_campaigns`, `list_characters`, `get_campaign_characters`, `get_character` (by name), `get_character_sheet` (by name), `get_character_full` (by name), `get_definition` (by name)

**Error:** `Cannot read properties of undefined (reading 'map')` or `Cannot read properties of undefined (reading 'length')`

**Request:** `GET https://www.dndbeyond.com/api/campaign/stt/active-campaigns`

**Expected Response Shape (per `DdbCampaign` type):**
```json
{
  "id": 7506650,
  "name": "One Shot",
  "dmId": 106877728,
  "dmUsername": "Shostakofish",
  "characters": [
    { "characterId": 161336179, "characterName": "Jane Dont", "userId": 106856761, "username": "Jazz8680" }
  ]
}
```

**Actual Response Shape:**
```json
{
  "id": 7506650,
  "name": "One Shot",
  "dmId": 106877728,
  "dmUsername": "Shostakofish",
  "dateCreated": "2/8/2026",
  "playerCount": 5
}
```

**Root Cause:** The D&D Beyond campaign list endpoint no longer includes the `characters` array inline. It now returns only `playerCount` and `dateCreated` fields instead. Campaign characters must be fetched separately.

**Discovered Workaround:** A separate endpoint exists:
```
GET https://www.dndbeyond.com/api/campaign/stt/active-short-characters/{campaignId}
```
Returns:
```json
[
  { "id": 161336179, "name": "Jane Dont", "userId": 106856761, "userName": "Jazz8680", "avatarUrl": "...", "characterStatus": 1, "isAssigned": true }
]
```
Note the field name changes: `characterId` → `id`, `characterName` → `name`, `username` → `userName`.

**Impact:** All character-by-name resolution is broken. All campaign listing/roster tools are broken. Only character-by-ID works for read tools.

---

### ISSUE-2: All Character Write Endpoints Return 404

**Affected Tools:** `update_hp`, `update_spell_slots`, `update_death_saves`, `update_currency`, `update_pact_magic`, `long_rest`, `short_rest`, `cast_spell`

**Error:** `D&D Beyond API error: 404 Not Found`

**Endpoints Tested (all 404):**
| Endpoint | Method |
|----------|--------|
| `/character/v5/character/{id}/life/hp/damage-taken` | PUT |
| `/character/v5/character/{id}/life/hp` | PUT |
| `/character/v5/character/{id}/spell/slots` | PUT |
| `/character/v5/character/{id}/life/death-saves` | PUT |
| `/character/v5/character/{id}/inventory/currency` | PUT |
| `/character/v5/character/{id}/spell/pact-magic` | PUT |

**Still Working:**
| Endpoint | Method | Status |
|----------|--------|--------|
| `/character/v5/character/{id}?includeCustomItems=true` | GET | 200 |
| `/character/v5/action/limited-use` | PUT | 400 (valid error for bad params) |

**Root Cause:** D&D Beyond has retired or relocated the character write API endpoints under `/character/v5/character/{id}/...`. The read endpoint and the `limited-use` action endpoint still work. The API may have migrated to a newer version (v6?) or restructured the write paths.

**Impact:** All 8 character mutation tools are non-functional. The only potentially working write tool is `use_ability` (which uses the `limited-use` endpoint), but it couldn't be tested due to ISSUE-3.

---

### ISSUE-3: Zod Type Validation Error on Some Tools

**Affected Tools:** `get_character_full`, `use_ability`

**Error:**
```
MCP error -32602: Input validation error: Invalid arguments for tool get_character_full:
  expected number, received string (path: characterId)
```

**Probable Cause:** The MCP client (Claude) sends `characterId` as a string when invoking these tools, but the Zod schema expects `z.number()`. Oddly, `get_character` and `get_character_sheet` have the identical schema (`z.number().optional()`) and work fine.

This may be an MCP SDK issue with how tool parameters are serialized/deserialized for certain tool registrations, or a client-side issue with how the tool schema is interpreted.

**Impact:** `get_character_full` and `use_ability` cannot be invoked via MCP with a numeric character ID.

---

### ISSUE-4: Spell Compendium Missing Cantrips (Level 0)

**Affected Tools:** `search_spells`, `get_spell`

**Request:** `search_spells({ level: 0 })` or `search_spells({ level: 0, school: "evocation" })`

**Result:** "No spells found matching the criteria."

**Root Cause:** The spell compendium is built from the `always-known-spells` API endpoint, which returns spells for levels 1-9 only. Cantrips (level 0 spells like Fire Bolt, Eldritch Blast, Prestidigitation, etc.) are not included in this dataset.

**Impact:** Cantrip lookups always return empty results. This is a significant gap — many common spell queries involve cantrips.

---

### ISSUE-5: Monster Search Filters Are Client-Side Only

**Affected Tools:** `search_monsters`

**Request:** `search_monsters({ cr: 1, type: "undead" })` → "No monsters found"
**Request:** `search_monsters({ type: "undead" })` → 1 result out of 5,485 total

**Root Cause:** The monster service API (`/v1/Monster?search=...`) only supports text-based name search. CR, type, and size filters are applied **client-side** on just the first page (20 results) returned by the API. When searching without a name, the API returns the first 20 alphabetical monsters, of which very few (or none) may match the CR/type/size criteria.

**Impact:** Filtering by CR, type, or size without also providing a name is unreliable. Results are essentially random depending on which 20 monsters happen to be on the current page.

---

### ISSUE-6: Six Registered Tools Not Exposed via MCP

**Tools Not Available:**
- `search_races`
- `search_backgrounds`
- `long_rest`
- `short_rest`
- `cast_spell`
- `update_pact_magic`

These tools are registered in `server.ts` (lines 500-524, 270-325) but do not appear when querying available MCP tools via ToolSearch. Other tools from the same server are discoverable.

**Probable Cause:** Could be an MCP tool registration limit, a tool name collision, or a deferred tool discovery issue. The tools exist in code and compile without error.

**Impact:** These 6 tools cannot be invoked at all through the MCP interface.

---

### ISSUE-7: `get_spell` Outputs Raw HTML in Description

**Affected Tools:** `get_spell`

**Example:** `get_spell({ spellName: "Shield" })` returns:
```
<p>An invisible barrier of magical force appears and protects you. Until the start of your next turn,
you have a +5 bonus to AC, including against the triggering attack, and you take no damage from
<strong>magic missile</strong>.</p>
```

**Root Cause:** In `reference.ts:formatSpellDetails()` (line 289), `def.description` is output directly without calling `stripHtml()`. The character tool's spell formatter in `character.ts` does call `stripHtml()`, but the reference tool version doesn't.

**Impact:** All spell detail outputs contain HTML tags instead of clean text.

---

### ISSUE-8: Shield Spell Shows Wrong Casting Time

**Affected Tools:** `get_spell`

**Example:** `get_spell({ spellName: "Shield" })` shows "Casting Time: 1 Action" — Shield is a Reaction.

**Root Cause:** In `reference.ts:formatSpellDetails()` (line 251-254), the activation type mapping `ACTIVATION_TYPES` is `{ 1: "Action", 3: "Bonus Action", 6: "Reaction" }`. The fallback is `?? "Action"`. If the activation data is `null`/`undefined` or uses a different type ID, it defaults to "1 Action". Shield's activation type may not be mapping correctly.

**Impact:** Reaction spells may display incorrect casting times.

---

## Detailed Test Results

### Auth Tools

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `check_auth` | (none) | "Authenticated — CobaltSession cookie found" | PASS |
| `setup_auth` | (none) | Not tested (opens browser) | SKIP |

### Character Read Tools

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `get_character` | `characterId: 161336179` | Full character summary returned | PASS |
| `get_character` | `characterName: "Kael"` | Crashes (ISSUE-1) | FAIL |
| `get_character_sheet` | `characterId: 161336179` | Detailed sheet with stats, saves, skills | PASS |
| `get_character_full` | `characterId: 161336179` | Zod validation error (ISSUE-3) | FAIL |
| `get_character_full` | `characterName: "Jane Dont"` | Crashes (ISSUE-1) | FAIL |
| `get_definition` | `characterId: 161336179, name: "hunter"` | Hunter's Mark definition returned | PASS |
| `list_characters` | (none) | Crashes (ISSUE-1) | FAIL |

### Character Write Tools

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `update_hp` | `characterId: 161336179, hpChange: -1` | 404 (ISSUE-2) | FAIL |
| `update_spell_slots` | `characterId: 161336179, level: 1, used: 0` | 404 (ISSUE-2) | FAIL |
| `update_death_saves` | `characterId: 161336179, type: success, count: 0` | 404 (ISSUE-2) | FAIL |
| `update_currency` | `characterId: 161336179, currency: gp, amount: 0` | 404 (ISSUE-2) | FAIL |
| `use_ability` | `characterId: 161336179, abilityName: "Hunter's Mark"` | Zod validation error (ISSUE-3) | FAIL |
| `update_pact_magic` | — | Not exposed via MCP (ISSUE-6) | N/A |
| `long_rest` | — | Not exposed via MCP (ISSUE-6) | N/A |
| `short_rest` | — | Not exposed via MCP (ISSUE-6) | N/A |
| `cast_spell` | — | Not exposed via MCP (ISSUE-6) | N/A |

### Campaign Tools

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `list_campaigns` | (none) | Crashes (ISSUE-1) | FAIL |
| `get_campaign_characters` | `campaignId: 7506650` | Crashes (ISSUE-1) | FAIL |

### Reference Search Tools

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `search_spells` | `name: "fireball"` | 2 results (Fireball, Delayed Blast Fireball) | PASS |
| `search_spells` | `level: 0, school: "evocation"` | 0 results (ISSUE-4) | FAIL |
| `search_spells` | `ritual: true, level: 1` | 13 results | PASS |
| `search_monsters` | `name: "goblin"` | 20 results (paginated correctly) | PASS |
| `search_monsters` | `cr: 1, type: "undead"` | 0 results (ISSUE-5) | FAIL |
| `search_items` | `rarity: "legendary", type: "weapon"` | 28 results | PASS |
| `search_items` | `name: "bag of holding"` | 2 results | PASS |
| `search_feats` | `name: "sentinel"` | 1 result | PASS |
| `search_classes` | `className: "ranger"` | 2 results (2014 + 2024 Ranger) | PASS |
| `get_condition` | `conditionName: "frightened"` | Full rules text | PASS |

### Reference Detail Tools

| Tool | Input | Result | Status |
|------|-------|--------|--------|
| `get_spell` | `spellName: "Fireball"` | Spell details returned (with raw HTML — ISSUE-7) | PASS* |
| `get_spell` | `spellName: "Shield"` | Wrong casting time "1 Action" (ISSUE-8), HTML in desc | FAIL |
| `get_monster` | `monsterName: "Goblin"` | Full stat block | PASS |
| `get_item` | `itemName: "Bag of Holding"` | Full item description | PASS |
| `get_condition` | `conditionName: "frightened"` | Full rules text | PASS |

---

## API Endpoint Status Summary

### Working Endpoints
| Endpoint | Method | Auth |
|----------|--------|------|
| `character-service: /character/v5/character/{id}` | GET | Bearer |
| `character-service: /character/v5/action/limited-use` | PUT | Bearer |
| `character-service: /character/v5/game-data/*` | GET | Bearer |
| `monster-service: /v1/Monster` | GET | Bearer |
| `www: /api/campaign/stt/active-campaigns` | GET | Cookie+Bearer |
| `www: /api/campaign/stt/active-short-characters/{id}` | GET | Cookie+Bearer |
| `www: /api/config/json` | GET | None |
| `auth-service: /v1/cobalt-token` | POST | Cookie |

### Broken Endpoints (404)
| Endpoint | Method |
|----------|--------|
| `character-service: /character/v5/character/{id}/life/hp/damage-taken` | PUT |
| `character-service: /character/v5/character/{id}/life/hp` | PUT |
| `character-service: /character/v5/character/{id}/spell/slots` | PUT |
| `character-service: /character/v5/character/{id}/life/death-saves` | PUT |
| `character-service: /character/v5/character/{id}/inventory/currency` | PUT |
| `character-service: /character/v5/character/{id}/spell/pact-magic` | PUT |

### Changed Endpoints (response format differs from expected)
| Endpoint | Change |
|----------|--------|
| `www: /api/campaign/stt/active-campaigns` | No longer includes `characters[]`; only `playerCount` |

---

## Minor Observations (Not Bugs)

1. **Duplicate entries across 2014/2024 rules:** `search_feats` returns 127 feats with many duplicates (2014 vs 2024 versions of same feat, e.g., "Sentinel" appears once). `search_classes` returns 26 entries (13 classes x 2 editions). This is by-design from the D&D Beyond API but could benefit from deduplication or edition filtering.

2. **`search_items` duplicates:** "Bag of Holding" appears twice (same item, likely 2014 + 2024 editions).

3. **`get_character_sheet` limited-use display:** Some abilities show `0/0` uses (e.g., "Dreadful Strike: 0/0") and reset type shows "unknown" rather than "Long Rest" / "Short Rest". The reset type description is not being resolved from the API data.

4. **Unstripped template variables in feats:** Some feat descriptions contain `{{proficiency#signed}}` and `{{2*characterlevel}}` template placeholders that aren't resolved in search results.

5. **`get_character_sheet` AC calculation:** Jane Dont shows AC 14 wearing Mithral Half Plate (which should be 15 + DEX mod capped at 2 = 17 normally, or uncapped for mithral). The AC calculation may not account for mithral's special property.
