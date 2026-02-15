# D&D Beyond MCP Server — Feature Audit

**Date:** 2026-02-14
**Build:** Passes clean (TypeScript strict mode, no warnings)
**Tests:** 190/190 passing across 18 test files

---

## Feature Inventory

| Category | Count | Status |
|----------|-------|--------|
| MCP Tools | 30 | 21 functional, 8 deprecated (404), 1 partially broken |
| MCP Resources | 6 | All functional (2 have bugs) |
| MCP Prompts | 6 | All functional |
| API Endpoints | 18 URL builders | 12 functional, 6 deprecated |
| Resilience | 3 components | All functional |
| Cache | 1 TTL/LRU cache | Functional (dead code in server.ts) |

---

## Errors & Warnings

### BUG: Cache key collision in campaign-party resource

**File:** `src/resources/campaign.ts:74-78`
**Severity:** High — returns wrong data type

The `dndbeyond://campaign/{id}/party` resource caches the **campaigns list** under the characters cache key:

```typescript
// Line 74-78: stores DdbCampaign[] under the characters key
const campaigns = await client.get<DdbCampaign[]>(
  ENDPOINTS.campaign.list(),
  `campaign:${campaignId}:characters`,  // BUG: should be "campaigns"
  CAMPAIGN_CACHE_TTL
);
```

Then on line 93-96 it fetches characters using the **same cache key**:

```typescript
const characters = await client.get<DdbCampaignCharacter2[]>(
  ENDPOINTS.campaign.characters(campaignId),
  `campaign:${campaignId}:characters`,  // Collides with campaigns list above
  CAMPAIGN_CACHE_TTL
);
```

**Effect:** If the campaigns list is fetched first (which it always is), the characters fetch returns the cached campaigns list cast as `DdbCampaignCharacter2[]`. The fields don't align, so the party roster renders with wrong/missing data. The bug is masked because `name` exists on both types.

**Fix:** Change line 76 cache key from `` `campaign:${campaignId}:characters` `` to `"campaigns"`.

---

### BUG: Resource AC calculation ignores armor

**File:** `src/resources/character.ts:70-73`
**Severity:** Medium — displays incorrect AC for armored characters

The resource's `calculateAc` uses only `10 + dexMod` (unarmored calculation):

```typescript
function calculateAc(char: DdbCharacter): number {
  const dexMod = Math.floor((...) - 10) / 2);
  return 10 + dexMod;  // Always unarmored AC
}
```

Meanwhile, the **tool's** `calculateAc` in `src/tools/character.ts:118-210` correctly accounts for equipped armor type (heavy/medium/light), shields, magic bonuses, and unarmored defense class features (Barbarian CON, Monk WIS).

**Effect:** The `dndbeyond://character/{id}` resource shows incorrect AC for any character wearing armor. A fighter in plate mail (AC 18) would show AC 10+dexMod instead.

**Fix:** Extract the full AC calculation from tools/character.ts into a shared utility and use it in both places.

---

### BUG: Resource ability scores ignore modifier bonuses

**File:** `src/resources/character.ts:18-29`
**Severity:** Medium — displays incorrect ability scores

The resource's `computeFinalAbilityScore` only considers base stats, bonus stats, and override stats:

```typescript
function computeFinalAbilityScore(base, bonus, override, id): number {
  // Missing: modifier bonuses from items, feats, racial traits, etc.
}
```

The **tool's** version in `src/tools/character.ts:62-116` additionally calls `sumModifierBonuses(modifiers, subType)` which sums bonuses from all modifier sources (items, feats, class features, racial traits, conditions, etc.).

**Effect:** Characters with magic items that boost ability scores (e.g., Belt of Giant Strength, Headband of Intellect) show their unmodified base scores in the resource output.

---

### WARNING: All v5 character write endpoints return 404

**Files:** `src/tools/character.ts` (8 functions)
**Severity:** High — 8 of 9 write tools are non-functional

D&D Beyond decommissioned the v5 character write API. These tools always return a graceful error message:

| Tool | Endpoint | Status |
|------|----------|--------|
| `update_hp` | `PUT /character/v5/character/{id}/life/hp/damage-taken` | 404 |
| `update_spell_slots` | `PUT /character/v5/character/{id}/spell/slots` | 404 |
| `update_death_saves` | `PUT /character/v5/character/{id}/life/death-saves` | 404 |
| `update_currency` | `PUT /character/v5/character/{id}/inventory/currency` | 404 |
| `update_pact_magic` | `PUT /character/v5/character/{id}/spell/pact-magic` | 404 |
| `long_rest` | Multiple PUTs | 404 |
| `short_rest` | Multiple PUTs | 404 |
| `cast_spell` | PUT spell slots or pact magic | 404 |

**Still works:** `use_ability` (`PUT /character/v5/action/limited-use`) uses a different endpoint path and remains functional.

**Graceful handling:** All 8 broken tools catch `HttpError` with `statusCode === 404` and return a user-friendly message explaining the endpoint was deprecated.

---

### WARNING: Dead code — unused cache instances in server.ts

**File:** `src/server.ts:44-50`
**Severity:** Low — no functional impact

Three cache instances are created but only one is used:

```typescript
const characterCache = new TtlCache<unknown>(60_000);   // used
const campaignCache = new TtlCache<unknown>(300_000);    // NEVER USED
const referenceCache = new TtlCache<unknown>(86_400_000); // NEVER USED

const cache = characterCache; // Only this one is passed to DdbClient
```

**No functional impact** because all callers pass explicit per-entry TTLs (e.g., `300_000` for campaigns, `86_400_000` for reference). The unused cache instances just waste a trivial amount of memory.

**Fix:** Remove `campaignCache` and `referenceCache` declarations, rename `characterCache` to `cache`.

---

### WARNING: No error handling in resource handlers

**Files:** `src/resources/character.ts`, `src/resources/campaign.ts`
**Severity:** Medium — unhandled API errors crash resource reads

None of the 6 resource handlers have try/catch blocks. If any API call fails (auth expired, network error, rate limited), the error propagates as an unhandled exception to the MCP client.

Compare with tool handlers which catch `HttpError` and return user-friendly messages.

---

### WARNING: `dndbeyond://characters` resource fetches every character individually

**File:** `src/resources/character.ts:201-217`
**Severity:** Low — performance concern

The characters list resource fetches all campaigns, then all characters per campaign, then fetches **full character details** for every character via `Promise.all`:

```typescript
const characterDetails = await Promise.all(
  allCharacters.map(async (char) => {
    const details = await client.get<DdbCharacter>(
      ENDPOINTS.character.get(char.id), ...
    );
    ...
  })
);
```

With a 2 req/sec rate limiter, a user with 10 characters across 3 campaigns would need: 1 (campaigns) + 3 (character lists) + 10 (character details) = 14 requests, taking ~7 seconds. The `Promise.all` fires all requests concurrently but they serialize through the rate limiter.

---

### WARNING: `findCharacterByName` uses exact match only

**File:** `src/tools/character.ts:994-1020`
**Severity:** Low — UX limitation

Character name lookup does case-insensitive exact match:

```typescript
const match = allCharacters.find(
  (char) => char.name.toLowerCase() === name.toLowerCase()
);
```

The codebase has `fuzzyMatch` from `src/utils/fuzzy-match.ts` (Levenshtein distance) but it's only used for ability name lookup in `useAbility`, not for character name resolution. Searching for "Astarion" wouldn't find "Astarion the Bold".

---

### WARNING: Monster filter-without-name limited to 200 results

**File:** `src/tools/reference.ts:366-401`
**Severity:** Low — documented limitation

When searching monsters by CR/type/size without a name, the server fetches 10 pages (200 results) from the monster service's alphabetical listing. The total monster database has thousands of entries. A search like `cr: 5, type: "dragon"` will only match dragons in the first 200 alphabetical monsters.

This is documented in the tool description but could miss valid results.

---

### WARNING: Condition data is hardcoded

**File:** `src/tools/reference.ts` (not shown, but confirmed)
**Severity:** Low — limited scope

The `get_condition` tool uses hardcoded SRD condition text for 14 standard conditions. There is no API endpoint for condition data. Any non-standard conditions (e.g., from homebrew) are unsupported.

---

### WARNING: Spell compendium requires 16 API calls on first load

**File:** `src/tools/reference.ts:110-149`
**Severity:** Low — mitigated by 24h cache

Building the spell compendium queries 8 classes × 2 levels = 16 endpoints. At 2 req/sec, first load takes ~8 seconds. Subsequent calls use the 24-hour cache.

Silent error handling (`catch { continue }`) means partial failures during compendium loading are invisible — some class spell lists could be missing without any indication.

---

### INFO: Duplicate utility functions across files

**Files:** `src/tools/character.ts` vs `src/resources/character.ts`
**Severity:** Low — code quality

Both files independently define:
- `calculateAc()` (with different implementations — see bug above)
- `computeLevel()`
- `calculateAbilityModifier()`
- `computeFinalAbilityScore()` (with different signatures)
- `formatClasses()`
- `formatHp()` / `calculateMaxHp()` / `calculateCurrentHp()`

These should be extracted into a shared utility module to prevent drift.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| Bug | 3 | Cache key collision, resource AC wrong, resource ability scores wrong |
| Warning (non-functional) | 1 | 8 write tools deprecated (gracefully handled) |
| Warning (code quality) | 5 | Dead cache code, no resource error handling, perf concern, exact name match, silent spell errors |
| Warning (limitation) | 3 | Monster filter cap, hardcoded conditions, slow spell compendium |
| Info | 1 | Duplicate utility functions |
