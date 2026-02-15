# Future Improvements Design

**Date:** 2026-02-14
**Scope:** All 6 items from gap analysis Future Improvements section

---

## 1. Display Proficiencies

Extract armor, weapon, tool, and language proficiencies from the `modifiers` field (same source powering saving throw/skill proficiency detection). Add a "Proficiencies" section to `formatCharacterSheet()`.

- Filter modifiers where `type: "proficiency"` and `subType` matches known patterns
- Group by category: Armor, Weapons, Tools, Languages
- Display between Skills and Spell Slots in sheet output
- Include in both `sheet` and `full` detail levels

## 2. Test & Integrate `user-campaigns` Endpoint

Call `GET /api/campaign/stt/user-campaigns` and compare with `active-campaigns`:
- If it returns more campaigns (player campaigns, completed ones), switch `list_campaigns` to use it
- If response shape differs, add a `role` filter parameter
- If no meaningful difference, document and keep `active-campaigns`

## 3. Consolidate Character Read Tools

Replace 3 tools (`get_character`, `get_character_sheet`, `get_character_full`) with one:

```
get_character(characterId, detail?: "summary" | "sheet" | "full")
```

- `detail` defaults to `"sheet"` (most useful for gameplay)
- Remove old tool registrations, add single unified tool
- Existing format functions (`formatCharacter`, `formatCharacterSheet`, `formatCharacterFull`) remain as internal helpers

## 4. Test & Integrate `always-prepared-spells`

Call `GET /game-data/always-prepared-spells?classId={1-8}&classLevel=20&sharingSetting=2`:
- Same query pattern as always-known-spells (no auth required expected)
- If useful, integrate into spell compendium or character sheet
- Shows which spells are auto-prepared per class/subclass

## 5. Test & Integrate `class-feature/collection` & `racial-trait/collection`

Call both endpoints:
- `GET /game-data/class-feature/collection`
- `GET /game-data/racial-trait/collection`

If they return rich data (descriptions, level requirements), enhance `search_classes`/`search_races` or create detail tools.

## 6. Source Book Filter for Monster Search

Add optional `source` parameter to `search_monsters`:
- API supports `sources={sourceId}` parameter
- Map human-readable names to source IDs via config endpoint (`/api/config/json`)
- Add `source?: string` to tool schema with name-to-ID resolution

---

## Agent Team

| Teammate | Model | Tasks |
|----------|-------|-------|
| piper-the-proficiency-parser | sonnet | Item 1: Display proficiencies |
| elena-the-endpoint-explorer | sonnet | Items 2, 4, 5: Test & integrate endpoints |
| clara-the-consolidator | sonnet | Item 3: Consolidate read tools |
| maria-the-monster-modifier | sonnet | Item 6: Source book filter |
| Lead (self) | — | Coordination, testing, review |

All 4 agents run in parallel. Lead handles final integration testing after agents complete.
