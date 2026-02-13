# D&D Beyond MCP Server — Design Spec

> Date: 2026-02-13
> Status: Draft
> Approach: D&D Beyond-First

## Overview

A TypeScript MCP server that connects directly to D&D Beyond's (unofficial) API, providing Claude with full access to character sheets, campaigns, reference content, and write operations for gameplay tracking. Designed for both DMs and players as a comprehensive D&D toolkit.

---

## Architecture

```
+-----------------------------------------------+
|              MCP Protocol Layer                |
|     (Tools, Resources, Prompts via SDK)        |
+-----------------------------------------------+
|             Business Logic Layer               |
|  +----------+ +----------+ +---------------+  |
|  |Character | | Campaign | |   Reference   |  |
|  | Service  | | Service  | |    Service    |  |
|  +----+-----+ +----+-----+ +------+--------+  |
+-------+------------+---------------+-----------+
|       |     Integration Layer      |           |
|  +----v------------v---------------v-------+   |
|  |        D&D Beyond API Client            |   |
|  |  (Auth, HTTP, Rate Limit, Retry)        |   |
|  +-----------------+----------------------+    |
|  +-----------------v----------------------+    |
|  |          Cache Layer (LRU)             |    |
|  |  Characters: 60s TTL                   |    |
|  |  Reference: 24h TTL                    |    |
|  |  Campaigns: 5min TTL                   |    |
|  +----------------------------------------+    |
+------------------------------------------------+
|              Error and Resilience              |
|   Circuit Breaker - Retry - Rate Limiter       |
+------------------------------------------------+
```

### Technology Stack
- **Language:** TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk` (v1 stable)
- **Transport:** stdio (local, runs alongside Claude Desktop / Claude Code)
- **HTTP Client:** `undici` or `node-fetch`
- **Browser Automation:** Playwright (for auth setup flow)
- **Cache:** In-memory LRU with TTL
- **Distribution:** npm package (`npx dndbeyond-mcp`)

### Project Structure
```
dndbeyond-mcp/
├── src/
│   ├── index.ts              # Entry point, server initialization
│   ├── server.ts             # MCP server setup, tool/resource/prompt registration
│   ├── tools/
│   │   ├── character.ts      # Character read/write tools
│   │   ├── campaign.ts       # Campaign tools
│   │   ├── reference.ts      # Spell/monster/item lookup tools
│   │   └── auth.ts           # Auth setup/check tools
│   ├── resources/
│   │   ├── character.ts      # Character sheet resources
│   │   └── campaign.ts       # Campaign resources
│   ├── prompts/
│   │   ├── session-prep.ts   # DM session prep workflow
│   │   ├── encounter.ts      # Encounter builder workflow
│   │   ├── level-up.ts       # Level-up guide workflow
│   │   └── spell-advisor.ts  # Spell recommendation workflow
│   ├── api/
│   │   ├── client.ts         # D&D Beyond HTTP client
│   │   ├── auth.ts           # CobaltSession management
│   │   ├── endpoints.ts      # Endpoint URL constants
│   │   └── types.ts          # API response types
│   ├── cache/
│   │   └── lru.ts            # LRU cache with TTL
│   ├── resilience/
│   │   ├── circuit-breaker.ts
│   │   ├── rate-limiter.ts
│   │   └── retry.ts
│   └── types/
│       ├── character.ts      # Character data types
│       ├── spell.ts          # Spell types
│       ├── monster.ts        # Monster types
│       └── item.ts           # Item types
├── setup/
│   └── auth-flow.ts          # Playwright-based login flow
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Authentication

### First-Run Setup Flow

```
1. User runs: npx dndbeyond-mcp setup
2. Playwright opens browser to D&D Beyond login page
3. User logs in normally (username/password, SSO, etc.)
4. Server detects CobaltSession cookie set by D&D Beyond
5. Cookie stored in encrypted local config (~/.dndbeyond-mcp/config.json)
6. Server confirms: "Authenticated as [username]"

On cookie expiry -> Server detects 401 response -> Re-prompts setup flow
```

### Cookie Storage
- Location: `~/.dndbeyond-mcp/config.json`
- Encrypted at rest using system keychain or local encryption key
- Server detects expiry from 401 responses and prompts re-auth

### Auth Headers
```
Cookie: CobaltSession={token}
Authorization: Bearer {jwt_token}
```

---

## MCP Tools

### Character Tools

| Tool | Parameters | Description | R/W |
|------|-----------|-------------|-----|
| `get_character` | `characterId` or `characterName` | Full character sheet | Read |
| `list_characters` | none | All user's characters | Read |
| `update_hp` | `characterId`, `hpChange` | Apply damage or healing | Write |
| `update_spell_slots` | `characterId`, `level`, `used` | Use or restore spell slots | Write |
| `update_death_saves` | `characterId`, `type`, `count` | Record death save | Write |
| `update_currency` | `characterId`, `currency`, `amount` | Modify currency | Write |
| `use_ability` | `characterId`, `abilityName` | Decrement limited-use feature | Write |

### Campaign Tools

| Tool | Parameters | Description | R/W |
|------|-----------|-------------|-----|
| `list_campaigns` | none | User's active campaigns | Read |
| `get_campaign_characters` | `campaignId` | All characters in a campaign | Read |

### Reference Tools

| Tool | Parameters | Description | R/W |
|------|-----------|-------------|-----|
| `search_spells` | `name?`, `level?`, `class?`, `school?` | Filter spells | Read |
| `get_spell` | `spellName` | Full spell details | Read |
| `search_monsters` | `name?`, `cr?`, `type?`, `size?` | Filter monsters | Read |
| `get_monster` | `monsterName` | Full stat block | Read |
| `search_items` | `name?`, `rarity?`, `type?` | Filter magic items | Read |
| `get_item` | `itemName` | Full item details | Read |
| `search_feats` | `name?`, `prerequisite?` | Filter feats | Read |
| `get_condition` | `conditionName` | Condition rules text | Read |
| `search_classes` | `className?` | Class/subclass info | Read |

### Utility Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `setup_auth` | none | Trigger Playwright login flow |
| `check_auth` | none | Verify current session |

---

## MCP Resources

| Resource URI | Description | Template? |
|-------------|-------------|-----------|
| `dndbeyond://characters` | User's characters | No |
| `dndbeyond://character/{id}` | Character sheet | Yes |
| `dndbeyond://character/{id}/spells` | Spell list | Yes |
| `dndbeyond://character/{id}/inventory` | Inventory | Yes |
| `dndbeyond://campaigns` | User's campaigns | No |
| `dndbeyond://campaign/{id}/party` | Party roster | Yes |

---

## MCP Prompts

| Prompt | Parameters | Purpose |
|--------|-----------|---------|
| `character-summary` | `characterName` | Full character rundown |
| `session-prep` | `campaignId`, `partyLevel` | DM session preparation |
| `encounter-builder` | `partySize`, `partyLevel`, `difficulty`, `environment` | Balanced encounter design |
| `spell-advisor` | `characterId`, `situation` | Spell recommendations |
| `level-up-guide` | `characterId` | Level-up walkthrough |
| `rules-lookup` | `question` | Rules clarification |

---

## D&D Beyond API Endpoints

### Base URLs
- Character Service: `https://character-service.dndbeyond.com`
- Waterdeep Monolith: `https://www.dndbeyond.com`

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/character/v5/character/{id}` | GET | Full character data |
| `/api/campaign/stt/active-campaigns` | GET | User's campaigns |
| `/character/v5/character/{id}/life/hp/damage-taken` | PUT | Update HP |
| `/character/v5/character/{id}/spell/slots` | PUT | Update spell slots |
| `/character/v5/character/{id}/action/limited-use` | PUT | Update ability uses |
| `/character/v5/character/{id}/life/death-saves` | PUT | Update death saves |
| `/character/v5/character/{id}/inventory/currency` | PUT | Update currency |

---

## Caching Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Character sheets | 60 seconds | Changes frequently during play |
| Campaigns | 5 minutes | Changes infrequently |
| Reference content | 24 hours | Rarely changes |
| Auth status | 5 minutes | Avoid repeated validation |

---

## Resilience

### Circuit Breaker
- Threshold: 5 consecutive failures
- Cooldown: 30 seconds
- On open: return cached data

### Rate Limiter
- 2 requests/second to D&D Beyond
- Token bucket algorithm

### Retry Policy
- Max 3 retries, exponential backoff (1s, 2s, 4s)
- Retry: 429, 500, 502, 503, timeout
- No retry: 401, 403, 404

---

## Implementation Phases

### Phase 1: Core Read (MVP)
- Authentication setup flow (Playwright)
- `get_character`, `list_characters`
- `list_campaigns`, `get_campaign_characters`
- Character resources
- Cache layer and basic resilience
- `character-summary` prompt

### Phase 2: Reference and Write
- All reference tools
- Write tools (HP, spell slots, death saves, currency, abilities)
- Remaining resources and prompts
- Query enhancement (fuzzy matching)

### Phase 3: Advanced Features
- `encounter-builder` prompt with CR balancing
- `spell-advisor` with character-aware recommendations
- `level-up-guide` with progression analysis
- Batch operations

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| API endpoint changes | Medium | High | Response validation, circuit breaker |
| Cookie expiry mid-session | High | Medium | Auto-detect 401, prompt re-auth |
| Rate limiting / IP blocking | Low | High | Caching, 2 req/sec limit |
| CAPTCHA challenges | Low | Medium | Minimize requests |
| C&D from D&D Beyond | Very Low | Very High | Read-only default, disclaimers |

---

## Open Questions

1. Can we read public character sheets without authentication?
2. How to verify content entitlements without Avrae's DynamoDB?
3. Full game log schema for campaign events?
4. Any signals about a future official D&D Beyond API?
5. Can homebrew content be read via the character service?
