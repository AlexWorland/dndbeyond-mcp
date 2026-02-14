# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build          # TypeScript compilation (tsc)
npm run dev            # Watch mode (tsc --watch)
npm test               # Run all tests (vitest)
npm run test:watch     # Vitest watch mode
npx vitest tests/tools/character.test.ts  # Run a single test file
npx vitest -t "should format"            # Run tests matching name pattern
npm run setup          # Browser-based auth flow (Playwright)
```

## Architecture

MCP server exposing D&D Beyond data through tools, resources, and prompts. ES module TypeScript project targeting ES2022/Node16.

### Request Flow

```
MCP Client → StdioServerTransport → McpServer (src/server.ts)
  → Tool handler (src/tools/*.ts)
    → DdbClient (src/api/client.ts)
      → TtlCache → RateLimiter (2 req/s) → CircuitBreaker → withRetry → fetch
        → D&D Beyond APIs
```

### Three API Hosts

| Host | Auth | Envelope | Client Method |
|------|------|----------|---------------|
| `character-service.dndbeyond.com` | Bearer token | `{ success, data }` | `client.get()` |
| `monster-service.dndbeyond.com` | Bearer token | `{ accessType, pagination, data }` | `client.getRaw()` |
| `www.dndbeyond.com` | Cookie + Bearer | `{ status: "success", data }` | `client.get()` |

`client.get()` auto-unwraps envelopes. `client.getRaw()` returns raw JSON (used for monster-service's custom format).

### Key Directories

- `src/api/` — Auth (cobalt token exchange, cookie storage), HTTP client, endpoint URL builders
- `src/tools/` — MCP tool implementations: `character.ts` (read+write), `campaign.ts`, `reference.ts`, `auth.ts`
- `src/resilience/` — Circuit breaker, rate limiter, exponential retry
- `src/cache/` — TTL cache with LRU eviction
- `src/types/` — API response types, character model, reference params
- `src/prompts/` — Six workflow prompts (session-prep, encounter-builder, etc.)
- `src/resources/` — MCP resource templates for character/campaign data
- `setup/` — Playwright browser auth flow

### Auth Flow

Credentials stored at `~/.dndbeyond-mcp/config.json`. Cobalt token obtained by POSTing cookies to `auth-service.dndbeyond.com/v1/cobalt-token`, cached in memory with 30s buffer before TTL. Header construction in `DdbClient.buildHeaders()` selects cookie+bearer vs bearer-only based on URL host.

## Testing Patterns

- **Framework:** Vitest 3.0 with globals enabled
- **Mock auth:** Mock `getCobaltToken` and `getAllCookies` (not `getCobaltSession`)
- **Mock client:** Supply `{ get, getRaw }` — `get()` returns unwrapped data (not the envelope)
- **Mock fetch:** `global.fetch = vi.fn()` with `{ ok: true, json: () => Promise.resolve(data) }`
- **Timer tests:** `vi.useFakeTimers()` + `vi.runAllTimersAsync()` for retry/delay paths
- **Character mocks:** Must include `modifiers` and `actions` fields

## Conventions

- All tool handlers return `{ content: [{ type: "text", text: string }] }`
- Endpoints defined as URL builder functions in `src/api/endpoints.ts`
- Cache keys follow `entity:id` pattern (e.g., `character:123`, `spell-compendium:class:1`)
- Character lookup supports fuzzy name matching (not just numeric ID)
- Ability scores use IDs 1-6 mapping to STR, DEX, CON, INT, WIS, CHA
- `client.put()` auto-invalidates specified cache keys on success
- Spell compendium built by querying `always-known-spells` across 8 casting class IDs (no auth required)
