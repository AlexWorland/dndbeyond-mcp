# Gap Analysis Implementation Design

> Date: 2026-02-14
> Source: Gap Analysis doc in Obsidian vault
> Scope: All items P0–P4 (21 total)

## Overview

Implement all items identified in the gap analysis to bring the dndbeyond-mcp server to full feature parity with the known D&D Beyond API surface. Work is organized into waves to manage file contention across parallel agents.

## Items by Priority

### P0 — Bug Fixes (4 items)
1. **Fix `update_hp` temp HP** — Add `temporaryHitPoints` support to the existing endpoint call. Add optional `tempHp` param.
2. **Register `update_pact_magic` tool** — Endpoint already defined in `endpoints.ts`. Need MCP tool + handler function.
3. **Fix AC calculation** — Replace naive `10 + DEX` with proper armor-aware calculation using equipped items and modifiers.
4. **Fix spell save DC** — Check each class's `spellCastingAbilityId` instead of hardcoding WIS.

### P1 — Composite Tools (3 items)
5. **`long_rest` tool** — Orchestrate: reset HP, temp HP, spell slots, pact magic, long-rest limited-use abilities.
6. **`short_rest` tool** — Orchestrate: reset short-rest limited-use abilities, pact magic.
7. **`includeCustomItems=true`** — Add query param to character GET endpoint.

### P2 — Read Improvements (5 items)
8. **Spell slot display** — Parse `spellSlots` from character data, show current/max per level in character sheet.
9. **Hit dice display** — Parse hit dice used/max per class.
10. **Speed display** — Parse and show walk/fly/swim/climb/burrow speeds.
11. **Traits display** — Show personality traits, ideals, bonds, flaws.
12. **Notes/backstory display** — Show character notes sections.

### P3 — Reference Tools (5 items)
13. **`search_races` tool** — New tool using `game-data/races` endpoint.
14. **`search_backgrounds` tool** — New tool using `game-data/backgrounds` endpoint.
15. **Monster search pagination** — Add `skip` param to monster search for paging through results.
16. **Monster homebrew filter** — Add `showHomebrew` param to monster search.
17. **Test `user-campaigns`** — Compare `user-campaigns` vs `active-campaigns` endpoint.

### P4 — UX Polish (4 items)
18. **Delta mode for `update_currency`** — Add `mode: "set" | "add" | "spend"` parameter.
19. **Fuzzy ability matching** — Use existing `fuzzyMatch` utility in `use_ability` for loose name matching.
20. **`cast_spell` tool** — Composite: decrement spell slot (or pact magic for warlocks) by spell level.
21. **Consolidate character read tools** — Merge `get_character`, `get_character_sheet`, `get_character_full` into one tool with `detail` param.

## Agent Team

| Teammate | Model | Wave | Tasks | Files |
|----------|-------|------|-------|-------|
| rosie-the-reference-engineer | sonnet | 1 | 13, 14, 15, 16 | `reference.ts`, `types/reference.ts` |
| petra-the-patch-fixer | sonnet | 1 | 1, 2, 3, 4 | `character.ts`, `types/character.ts` |
| carmen-the-composer | sonnet | 2 | 5, 6, 7, 8, 9, 10, 11, 12 | `character.ts`, `types/character.ts` |
| Lead (self) | — | 3 | 17, 18, 19, 20, 21 + all `server.ts` registrations | `server.ts`, `character.ts` |

### Parallelization

```
Wave 1: [rosie: 13-16] ∥ [petra: 1-4]     (different files)
Wave 2: [carmen: 5-12]                      (after petra, same files)
Wave 3: [lead: 17-21 + server.ts wiring]   (after all agents)
Final:  [lead: run tests, fix issues]
```

### Key Constraints
- `server.ts` tool registrations deferred to Wave 3 (lead) to prevent merge conflicts
- Agents export functions only; they do NOT modify `server.ts`
- Wave 2 starts after Wave 1 completes (petra and carmen share `character.ts`)
- All agents create tests but do NOT run them — testing is a final phase

## Type Changes Needed

### `types/character.ts` additions
- `pactMagic` field on `DdbCharacter` (for pact magic slot tracking)
- `spellSlots` field on `DdbCharacter` (for spell slot current/max)
- Speed-related fields (if not already in modifiers)

### `types/reference.ts` additions
- `RaceSearchParams` interface
- `BackgroundSearchParams` interface

### `endpoints.ts` changes
- Add `?includeCustomItems=true` to character.get
- Ensure `gameData.races()` and `gameData.backgrounds()` exist (already there)
