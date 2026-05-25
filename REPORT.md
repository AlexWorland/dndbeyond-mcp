# D&D Beyond MCP — Current Implementation Report

**Updated:** 2026-05-25  
**Scope:** Public repository implementation status after the DDB write/inventory, extended character-service, and live E2E PR stack was merged.

## Summary

The old `AUDIT.md` and `MCP_TOOL_TEST_REPORT.md` reports were stale. They described February 2026 failures that have since been fixed or superseded by current endpoint work.

Current status:

- Core build and unit test suite are passing.
- Character read, campaign read, reference lookup, write, inventory, custom item, and extended character-service tools are covered by automated tests.
- A live E2E test covers the reverse-engineered extended endpoint families with throwaway character creation and cleanup.
- No open GitHub issues were found at the time of this report.
- No credentials, session cookies, `.env` files, campaign-specific metadata, or local probe scripts are part of the public repo.

## Verification Snapshot

Latest local verification from the merged stack:

- `npm run build` — passing
- `npm test -- --run` — passing, 24 test files / 261 tests
- `npm run test:live -- tests/live/extended-character-service.test.ts` — passing with live DDB credentials and throwaway character cleanup
- `gitleaks detect --no-git --source . --redact` — no leaks found

Live tests require local D&D Beyond authentication and are not expected to run in public CI without credentials.

## Previously Reported Issues

| Old report item | Current status |
| --- | --- |
| Campaign API response changed / character lists broken | Fixed. Campaign characters are fetched via the active short-characters endpoint and covered by tests. |
| Campaign resource cache key collision | Fixed. Campaign list and character roster use distinct cache keys. |
| Character resource AC ignores armor | Fixed. Resources now use shared character calculation utilities. |
| Character resource ability scores ignore modifier bonuses | Fixed. Resources now use shared ability-score calculation utilities. |
| v5 character write endpoints return 404 | Fixed/superseded. Write tools now use current character-service endpoints and are unit/live tested. |
| Zod numeric ID validation errors | Fixed broadly by using `z.coerce.number()` for numeric IDs in MCP schemas. |
| Spell compendium missing cantrips | Fixed. Spell loading queries cantrip-capable class levels and has tests. |
| `get_spell` emits raw HTML | Fixed. Spell details strip HTML. |
| Shield/reaction spell casting time wrong | Fixed. Activation type mapping includes reaction and related activation types. |
| Some registered tools not exposed | Superseded by current server registration and integration tests. |
| Dead cache instances in server startup | Fixed. Server initializes one shared cache instance. |
| Resource handlers lack error handling | Fixed for character/campaign resources with user-readable `HttpError` handling. |

## Current Tool Coverage

### Character and Campaign Read

Covered by tests:

- `get_character`
- `get_character_sheet`
- `get_character_full`
- `get_definition`
- `list_characters`
- `list_campaigns`
- `get_campaign_characters`
- character/campaign MCP resources

### Character Write and Sheet Mutations

Covered by tests and current endpoint routing:

- HP, spell slots, pact magic, death saves, currency
- rests and spell casting helpers
- limited-use ability updates
- character creation/deletion
- class, species/race, background, choices, inspiration, conditions
- character name, class level, ability score/type, starting equipment type
- description fields

### Inventory and Custom Items

Covered by tests:

- add catalog item
- list inventory
- quantity/equipped/attuned/charge updates
- move item
- remove item
- create/update/delete custom item

### Extended Character-Service Endpoints

Covered by unit tests and live E2E where DDB account state permits:

- source categories
- campaign settings
- custom background toggle/set
- custom values and custom entity values
- custom proficiency/movement/sense/defense/action
- ad-hoc feats
- known infusions and infusion item mappings
- optional class features and racial traits
- portrait decoration
- feature flags
- party inventory read
- rule-data and share URL reads
- roll-result groups
- vehicles, fuel, conditions, components, and component HP

## Known External Limitations

These are not currently treated as implementation bugs because the public APIs require additional DDB web-app state, account permissions, or payload generation not available from stable documented contracts.

### PDF generation

`generate_character_pdf` is implemented with the current DDB endpoint shape and requires DDB web-app `exportData`. DDB rejects characterId-only or incomplete export data. A successful standalone live PDF test needs a faithful export-data generator derived from the web app.

### Premade info

`manage_premade_info` is implemented as a typed wrapper around the observed premade endpoints, but live create/update/delete attempts are route- or permission-gated for the tested account/session. The tool remains available for accounts/states where DDB permits the operation.

### Monster filter-only searches

Monster CR/type/size filtering without a name is still limited by the upstream monster service. The implementation paginates a bounded set of results and documents this limitation. Best results come from combining filters with a name search term.

## Security and Privacy

The public repository should not contain:

- `DDB_COBALT_SESSION` values
- bearer tokens
- `.env` files
- live character IDs used during local probing
- private campaign names or IDs
- local probe scripts from `/tmp`
- workspace-only planning files

Run before publishing sensitive changes:

```bash
git grep -nE 'DDB_COBALT|CobaltSession|Bearer [A-Za-z0-9._-]{20,}|\.env|campaign:' -- . ':!node_modules' || true
gitleaks detect --no-git --source . --redact
```

## Recommended Ongoing Checks

Before cutting a release or merging endpoint changes:

```bash
npm run build
npm test -- --run
```

When live credentials are available and the change touches DDB mutations:

```bash
npm run test:live -- tests/live/extended-character-service.test.ts
```
