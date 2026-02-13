# D&D Beyond MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript MCP server that connects to D&D Beyond's unofficial API, exposing character sheets, campaigns, reference content, and gameplay tracking via tools, resources, and prompts.

**Architecture:** Layered design — MCP Protocol Layer → Business Logic (Character/Campaign/Reference Services) → Integration Layer (D&D Beyond API Client with caching, rate limiting, circuit breaker). Playwright-based browser auth for cookie acquisition.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` v1, Playwright, Vitest, undici

**Design Spec:** `docs/design/2026-02-13-dndbeyond-mcp-design.md`

---

## Agent Team Analysis

### Recommendation: USE TEAM

### Justification
The project has clear layer boundaries (types → cache/resilience → API client → tools → resources → prompts → server) with multiple independent components at each layer. Agents can work in parallel on foundation modules, then on independent tool domains.

### Proposed Team

| Role | Agent Name | Subagent Type | Model | Responsibility |
|------|-----------|---------------|-------|----------------|
| Foundation Engineer | fiona-the-foundation-engineer | general-purpose | sonnet | Project scaffolding, types, cache, resilience |
| API Engineer | ada-the-api-engineer | general-purpose | sonnet | HTTP client, auth module, endpoints, Playwright flow |
| Character Tools Dev | cara-the-character-developer | general-purpose | sonnet | Character read/write tools, character resources |
| Reference Tools Dev | rena-the-reference-developer | general-purpose | sonnet | Spell/monster/item/feat/condition tools, query enhancement |
| Campaign + Prompts Dev | petra-the-prompts-developer | general-purpose | sonnet | Campaign tools/resources, all MCP prompts |
| Server Integrator | sara-the-server-integrator | general-purpose | sonnet | Server entry point, wiring, integration tests, npm config |

### Task Assignment

| Task/Subtask | Assigned To | Dependencies |
|-------------|-------------|--------------|
| 1a: Scaffolding | fiona-the-foundation-engineer | None |
| 1b: Types | fiona-the-foundation-engineer | None |
| 1c: Cache | fiona-the-foundation-engineer | None |
| 1d: Resilience | fiona-the-foundation-engineer | None |
| 2a: Endpoints | ada-the-api-engineer | 1a |
| 2b: Auth module | ada-the-api-engineer | 1a, 1b |
| 2c: API client | ada-the-api-engineer | 1b, 1c, 1d |
| 3a: Playwright auth | ada-the-api-engineer | 2b |
| 4a: Character read tools | cara-the-character-developer | 2c |
| 4b: Campaign tools | petra-the-prompts-developer | 2c |
| 4c: Reference tools (spells) | rena-the-reference-developer | 2c |
| 4d: Reference tools (monsters/items/feats) | rena-the-reference-developer | 2c |
| 5a: Character write tools | cara-the-character-developer | 4a |
| 5b: Character resources | cara-the-character-developer | 4a |
| 5c: Campaign resources | petra-the-prompts-developer | 4b |
| 5d: Auth tools | ada-the-api-engineer | 3a |
| 6a: Prompts | petra-the-prompts-developer | 4a, 4b, 4c |
| 6b: Query enhancement | rena-the-reference-developer | 4c, 4d |
| 7a: Server entry point | sara-the-server-integrator | All above |
| 7b: Integration tests | sara-the-server-integrator | 7a |
| 7c: npm packaging + README | sara-the-server-integrator | 7b |

---

## Parallelization Analysis

### Task Breakdown

| Task | Subtasks | Dependencies |
|------|----------|--------------|
| 1. Foundation | 1a. Scaffolding, 1b. Types, 1c. Cache, 1d. Resilience | None |
| 2. Integration | 2a. Endpoints, 2b. Auth module, 2c. API client | Task 1 |
| 3. Auth Setup | 3a. Playwright flow | Task 2b |
| 4. Read Tools | 4a. Character read, 4b. Campaign, 4c. Ref (spells), 4d. Ref (rest) | Task 2c |
| 5. Write + Resources | 5a. Char write, 5b. Char resources, 5c. Campaign resources, 5d. Auth tools | Task 3, 4 |
| 6. Prompts + Enhancement | 6a. Prompts, 6b. Query enhancement | Task 4, 5 |
| 7. Server + Polish | 7a. Entry point, 7b. Integration tests, 7c. Packaging | Task 6 |

### Execution Waves

- **Wave 1** (parallel, 4 agents): 1a, 1b, 1c, 1d — Foundation modules, no dependencies
- **Wave 2** (parallel, 3 agents): 2a, 2b, 2c — Integration layer, depends on Wave 1
- **Wave 3** (parallel, 5 agents): 3a, 4a, 4b, 4c, 4d — Auth flow + all read tools, depends on Wave 2
- **Wave 4** (parallel, 4 agents): 5a, 5b, 5c, 5d — Write tools + resources + auth tools, depends on Wave 3
- **Wave 5** (parallel, 2 agents): 6a, 6b — Prompts + query enhancement, depends on Wave 4
- **Wave 6** (sequential): 7a → 7b → 7c — Server wiring, integration tests, packaging

### Todo List Structure

**CRITICAL**: When implementing this plan, create TodoWrite entries for SUBTASKS (1a, 1b, 2a, etc.), NOT parent tasks (1, 2, etc.). Each subtask should be an individual todo item so progress can be tracked granularly.

### Agent Execution Instructions

**CRITICAL**: The parent agent implementing this plan MUST spawn parallel Task agents for each wave:

1. **Wave 1 Execution**: Launch 1a, 1b, 1c, 1d simultaneously in a SINGLE message using multiple `Task()` tool calls with `run_in_background: true`
2. **Wait for Wave 1**: Use `TaskOutput` to block and wait for ALL Wave 1 agents to complete
3. **Wave 2 Execution**: Launch 2a, 2b, 2c simultaneously in a SINGLE message
4. **Wait for Wave 2**: Block and wait for all
5. **Wave 3 Execution**: Launch 3a, 4a, 4b, 4c, 4d simultaneously
6. **Wait for Wave 3**: Block and wait for all
7. **Continue pattern** for Waves 4, 5, 6

DO NOT execute subtasks sequentially when they can be parallelized. DO NOT execute parent tasks — execute subtasks via Task agents.

---

## Task 1a: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder)

**Step 1: Initialize package.json**

```json
{
  "name": "dndbeyond-mcp",
  "version": "0.1.0",
  "description": "MCP server for D&D Beyond",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "dndbeyond-mcp": "build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node build/index.js",
    "setup": "node build/setup/auth-flow.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "undici": "^7.0.0",
    "playwright": "^1.50.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "build",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "setup/**/*"],
  "exclude": ["node_modules", "build", "tests"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

**Step 4: Create placeholder entry point**

```typescript
// src/index.ts
#!/usr/bin/env node
console.error("dndbeyond-mcp: server starting...");
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 6: Verify build**

Run: `npm run build`
Expected: `build/` directory with compiled JS

**Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/index.ts
git commit -m "feat: project scaffolding with TypeScript, MCP SDK, Vitest"
```

---

## Task 1b: TypeScript Types

**Files:**
- Create: `src/types/api.ts`
- Create: `src/types/character.ts`
- Create: `src/types/campaign.ts`
- Create: `src/types/reference.ts`
- Create: `src/types/index.ts`

**Step 1: Write API response types**

```typescript
// src/types/api.ts
export interface DdbApiResponse<T> {
  id: number;
  success: boolean;
  message: string;
  data: T;
  pagination: unknown | null;
}

export interface DdbErrorResponse {
  success: false;
  message: string;
  data: {
    serverMessage: string;
    errorCode: string;
  };
}

export interface DdbCampaignResponse {
  status: string;
  data: DdbCampaign[];
}

export interface DdbCampaign {
  id: number;
  name: string;
  dmId: number;
  dmUsername: string;
  characters: DdbCampaignCharacter[];
}

export interface DdbCampaignCharacter {
  characterId: number;
  characterName: string;
  userId: number;
  username: string;
}
```

**Step 2: Write character types**

```typescript
// src/types/character.ts
export interface DdbCharacter {
  id: number;
  readonlyUrl: string;
  name: string;
  race: DdbRace;
  classes: DdbClass[];
  level: number;
  background: DdbBackground;
  stats: DdbAbilityScore[];
  bonusStats: DdbAbilityScore[];
  overrideStats: DdbAbilityScore[];
  baseHitPoints: number;
  bonusHitPoints: number | null;
  overrideHitPoints: number | null;
  removedHitPoints: number;
  temporaryHitPoints: number;
  currentXp: number;
  alignmentId: number;
  lifestyleId: number;
  currencies: DdbCurrencies;
  spells: DdbSpellsContainer;
  inventory: DdbInventoryItem[];
  deathSaves: DdbDeathSaves;
  traits: DdbTraits;
  preferences: Record<string, unknown>;
  configuration: Record<string, unknown>;
  campaign: { id: number; name: string } | null;
}

export interface DdbRace {
  fullName: string;
  baseRaceName: string;
  isHomebrew: boolean;
}

export interface DdbClass {
  id: number;
  definition: { name: string };
  subclassDefinition: { name: string } | null;
  level: number;
  isStartingClass: boolean;
}

export interface DdbBackground {
  definition: { name: string; description: string } | null;
}

export interface DdbAbilityScore {
  id: number; // 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA
  value: number | null;
}

export interface DdbCurrencies {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface DdbSpellsContainer {
  race: DdbSpell[];
  class: DdbSpell[];
  background: DdbSpell[];
  item: DdbSpell[];
  feat: DdbSpell[];
}

export interface DdbSpell {
  id: number;
  definition: {
    name: string;
    level: number;
    school: string;
    description: string;
    range: { origin: string; value: number | null };
    duration: { durationType: string; durationInterval: number | null };
    castingTime: { castingTimeInterval: number };
    components: number[]; // 1=V, 2=S, 3=M
    concentration: boolean;
    ritual: boolean;
  };
  prepared: boolean;
  alwaysPrepared: boolean;
  usesSpellSlot: boolean;
}

export interface DdbInventoryItem {
  id: number;
  definition: {
    name: string;
    description: string;
    type: string;
    rarity: string;
    weight: number;
    cost: number | null;
    isHomebrew: boolean;
  };
  equipped: boolean;
  quantity: number;
}

export interface DdbDeathSaves {
  failCount: number | null;
  successCount: number | null;
  isStabilized: boolean;
}

export interface DdbTraits {
  personalityTraits: string | null;
  ideals: string | null;
  bonds: string | null;
  flaws: string | null;
  appearance: string | null;
}

export interface CharacterSummary {
  id: number;
  name: string;
  race: string;
  classes: string;
  level: number;
  hp: { current: number; max: number; temp: number };
  ac: number;
  campaignName: string | null;
}
```

**Step 3: Write reference types**

```typescript
// src/types/reference.ts
export interface SpellSearchParams {
  name?: string;
  level?: number;
  class?: string;
  school?: string;
  concentration?: boolean;
  ritual?: boolean;
}

export interface MonsterSearchParams {
  name?: string;
  cr?: number;
  type?: string;
  size?: string;
  environment?: string;
}

export interface ItemSearchParams {
  name?: string;
  rarity?: string;
  type?: string;
  attunement?: boolean;
}

export interface FeatSearchParams {
  name?: string;
  prerequisite?: string;
}
```

**Step 4: Write barrel export**

```typescript
// src/types/index.ts
export * from "./api.js";
export * from "./character.js";
export * from "./campaign.js";
export * from "./reference.js";
```

**Step 5: Verify compilation**

Run: `npm run build`
Expected: No errors, type files compiled to `build/types/`

**Step 6: Commit**

```bash
git add src/types/
git commit -m "feat: TypeScript type definitions for D&D Beyond API responses"
```

---

## Task 1c: LRU Cache with TTL

**Files:**
- Create: `src/cache/lru.ts`
- Create: `tests/cache/lru.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/cache/lru.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtlCache } from "../../src/cache/lru.js";

describe("TtlCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("should store and retrieve values", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("should return undefined for missing keys", () => {
    const cache = new TtlCache<string>(60_000);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("should expire entries after TTL", () => {
    const cache = new TtlCache<string>(1_000);
    cache.set("key", "value");
    vi.advanceTimersByTime(1_001);
    expect(cache.get("key")).toBeUndefined();
  });

  it("should not expire entries before TTL", () => {
    const cache = new TtlCache<string>(1_000);
    cache.set("key", "value");
    vi.advanceTimersByTime(999);
    expect(cache.get("key")).toBe("value");
  });

  it("should evict oldest entry when maxSize exceeded", () => {
    const cache = new TtlCache<string>(60_000, 2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3"); // evicts "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
  });

  it("should invalidate specific keys", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("key", "value");
    cache.invalidate("key");
    expect(cache.get("key")).toBeUndefined();
  });

  it("should clear all entries", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("should allow per-key TTL override", () => {
    const cache = new TtlCache<string>(60_000);
    cache.set("short", "value", 500);
    cache.set("long", "value", 5_000);
    vi.advanceTimersByTime(501);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("value");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/cache/lru.test.ts`
Expected: FAIL — module not found

**Step 3: Implement cache**

```typescript
// src/cache/lru.ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private readonly defaultTtl: number;
  private readonly maxSize: number;

  constructor(defaultTtlMs: number, maxSize = 1000) {
    this.defaultTtl = defaultTtlMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.entries.size >= this.maxSize) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtl),
    });
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/cache/lru.test.ts`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add src/cache/ tests/cache/
git commit -m "feat: LRU cache with TTL expiration and max size eviction"
```

---

## Task 1d: Resilience Utilities

**Files:**
- Create: `src/resilience/circuit-breaker.ts`
- Create: `src/resilience/rate-limiter.ts`
- Create: `src/resilience/retry.ts`
- Create: `src/resilience/index.ts`
- Create: `tests/resilience/circuit-breaker.test.ts`
- Create: `tests/resilience/rate-limiter.test.ts`
- Create: `tests/resilience/retry.test.ts`

**Step 1: Write circuit breaker tests**

```typescript
// tests/resilience/circuit-breaker.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker } from "../../src/resilience/circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("should allow calls when closed", async () => {
    const cb = new CircuitBreaker(3, 1000);
    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("should open after threshold failures", async () => {
    const cb = new CircuitBreaker(2, 1000);
    const fail = () => Promise.reject(new Error("fail"));
    await expect(cb.execute(fail)).rejects.toThrow("fail");
    await expect(cb.execute(fail)).rejects.toThrow("fail");
    await expect(cb.execute(() => Promise.resolve("ok"))).rejects.toThrow("Circuit breaker is open");
  });

  it("should transition to half-open after cooldown", async () => {
    const cb = new CircuitBreaker(1, 1000);
    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    vi.advanceTimersByTime(1001);
    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
  });

  it("should re-open on failure in half-open state", async () => {
    const cb = new CircuitBreaker(1, 1000);
    await expect(cb.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    vi.advanceTimersByTime(1001);
    await expect(cb.execute(() => Promise.reject(new Error("still broken")))).rejects.toThrow();
    await expect(cb.execute(() => Promise.resolve("ok"))).rejects.toThrow("Circuit breaker is open");
  });
});
```

**Step 2: Implement circuit breaker**

```typescript
// src/resilience/circuit-breaker.ts
type State = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: State = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly cooldownMs: number = 30_000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold || this.state === "half-open") {
      this.state = "open";
    }
  }
}
```

**Step 3: Write rate limiter tests and implementation**

```typescript
// src/resilience/rate-limiter.ts
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number = 2,
    private readonly refillRateMs: number = 1000,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    const waitMs = this.refillRateMs - (Date.now() - this.lastRefill);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)));
    this.refill();
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = Math.floor(elapsed / this.refillRateMs) * this.maxTokens;
    if (newTokens > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}
```

**Step 4: Write retry utility**

```typescript
// src/resilience/retry.ts
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const NON_RETRYABLE_STATUS_CODES = new Set([401, 403, 404]);

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof HttpError && NON_RETRYABLE_STATUS_CODES.has(error.statusCode)) {
        throw error;
      }
      if (attempt === maxRetries) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}
```

**Step 5: Create barrel export**

```typescript
// src/resilience/index.ts
export { CircuitBreaker } from "./circuit-breaker.js";
export { RateLimiter } from "./rate-limiter.js";
export { withRetry, HttpError, type RetryOptions } from "./retry.js";
```

**Step 6: Run all resilience tests**

Run: `npx vitest run tests/resilience/`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/resilience/ tests/resilience/
git commit -m "feat: resilience utilities — circuit breaker, rate limiter, retry with backoff"
```

---

## Task 2a: API Endpoint Constants

**Files:**
- Create: `src/api/endpoints.ts`

**Step 1: Define all endpoint constants**

```typescript
// src/api/endpoints.ts
export const DDB_CHARACTER_SERVICE = "https://character-service.dndbeyond.com";
export const DDB_WATERDEEP = "https://www.dndbeyond.com";

export const ENDPOINTS = {
  character: {
    get: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}`,
    updateHp: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/hp/damage-taken`,
    updateSpellSlots: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/slots`,
    updateDeathSaves: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/death-saves`,
    updateLimitedUse: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/action/limited-use`,
    updateCurrency: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/inventory/currency`,
    updatePactMagic: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/pact-magic`,
  },
  campaign: {
    list: () => `${DDB_WATERDEEP}/api/campaign/stt/active-campaigns`,
  },
} as const;
```

**Step 2: Commit**

```bash
git add src/api/endpoints.ts
git commit -m "feat: D&D Beyond API endpoint URL constants"
```

---

## Task 2b: Auth Module

**Files:**
- Create: `src/api/auth.ts`
- Create: `tests/api/auth.test.ts`

**Step 1: Write auth module** — manages CobaltSession cookie storage, retrieval, and header generation.

```typescript
// src/api/auth.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".dndbeyond-mcp");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface AuthConfig {
  cobaltSession: string;
  savedAt: string;
}

export async function getCobaltSession(): Promise<string | null> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const config: AuthConfig = JSON.parse(raw);
    return config.cobaltSession || null;
  } catch {
    return null;
  }
}

export async function saveCobaltSession(cookie: string): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  const config: AuthConfig = {
    cobaltSession: cookie,
    savedAt: new Date().toISOString(),
  };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function buildAuthHeaders(cobaltSession: string): Record<string, string> {
  return {
    Cookie: `CobaltSession=${cobaltSession}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getCobaltSession();
  return session !== null;
}
```

**Step 2: Write tests, run, verify**

Run: `npx vitest run tests/api/auth.test.ts`

**Step 3: Commit**

```bash
git add src/api/auth.ts tests/api/auth.test.ts
git commit -m "feat: auth module — CobaltSession cookie storage and header generation"
```

---

## Task 2c: D&D Beyond API Client

**Files:**
- Create: `src/api/client.ts`
- Create: `tests/api/client.test.ts`

**Step 1: Implement HTTP client** wrapping undici `fetch` with auth headers, rate limiting, circuit breaker, caching, and retry.

Key structure:
```typescript
// src/api/client.ts
export class DdbClient {
  constructor(cache, circuitBreaker, rateLimiter) { ... }
  async get<T>(url: string, cacheKey: string, ttl?: number): Promise<T> { ... }
  async put<T>(url: string, body: unknown): Promise<T> { ... }
  private async request<T>(url: string, options: RequestInit): Promise<T> { ... }
}
```

The client should:
- Call `rateLimiter.acquire()` before every request
- Wrap requests in `circuitBreaker.execute()`
- Wrap requests in `withRetry()`
- Check cache before GET requests, populate cache after
- Invalidate cache on PUT requests
- Throw `HttpError` for non-2xx responses
- Detect 401 and set `authExpired` flag

**Step 2: Write unit tests with mocked fetch**

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat: D&D Beyond API client with caching, rate limiting, circuit breaker"
```

---

## Task 3a: Playwright Auth Flow

**Files:**
- Create: `setup/auth-flow.ts`

**Step 1: Implement browser-based login flow**

```typescript
// setup/auth-flow.ts
import { chromium } from "playwright";
import { saveCobaltSession } from "../src/api/auth.js";

const DDB_LOGIN_URL = "https://www.dndbeyond.com/sign-in";
const DDB_HOME_URL = "https://www.dndbeyond.com";

export async function runAuthFlow(): Promise<void> {
  console.error("Opening browser for D&D Beyond login...");
  console.error("Please log in normally. The browser will close when authentication is detected.");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(DDB_LOGIN_URL);

  // Poll for CobaltSession cookie
  const cookie = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Login timed out after 5 minutes")), 300_000);

    const interval = setInterval(async () => {
      const cookies = await context.cookies("https://www.dndbeyond.com");
      const cobalt = cookies.find((c) => c.name === "CobaltSession");
      if (cobalt) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(cobalt.value);
      }
    }, 1000);
  });

  await saveCobaltSession(cookie);
  console.error("Authentication successful! Cookie saved.");
  await browser.close();
}

// CLI entry point
if (process.argv[1]?.endsWith("auth-flow.js")) {
  runAuthFlow().catch((err) => {
    console.error("Auth failed:", err.message);
    process.exit(1);
  });
}
```

**Step 2: Commit**

```bash
git add setup/auth-flow.ts
git commit -m "feat: Playwright-based D&D Beyond login flow for CobaltSession extraction"
```

---

## Task 4a: Character Read Tools

**Files:**
- Create: `src/tools/character.ts`
- Create: `tests/tools/character.test.ts`

**Step 1: Implement `get_character` and `list_characters` MCP tools**

Each tool should:
- Accept parameters per the design spec
- Call `DdbClient.get()` with the character service endpoint
- Transform D&D Beyond's verbose response into a clean summary
- Return formatted text content via MCP `CallToolResult`

**Step 2: Write unit tests with mocked DdbClient**

**Step 3: Commit**

```bash
git add src/tools/character.ts tests/tools/character.test.ts
git commit -m "feat: character read tools — get_character, list_characters"
```

---

## Task 4b: Campaign Tools

**Files:**
- Create: `src/tools/campaign.ts`
- Create: `tests/tools/campaign.test.ts`

**Step 1: Implement `list_campaigns` and `get_campaign_characters`**

**Step 2: Tests, verify, commit**

```bash
git add src/tools/campaign.ts tests/tools/campaign.test.ts
git commit -m "feat: campaign tools — list_campaigns, get_campaign_characters"
```

---

## Task 4c: Reference Tools (Spells)

**Files:**
- Create: `src/tools/reference.ts` (spells section)
- Create: `tests/tools/reference-spells.test.ts`

**Step 1: Implement `search_spells` and `get_spell`**

These parse spells from the character's known/accessible spells via the character service, or from D&D Beyond's content endpoints. Format results with spell level, school, casting time, range, components, duration, concentration/ritual status, and description.

**Step 2: Tests, verify, commit**

---

## Task 4d: Reference Tools (Monsters, Items, Feats, Conditions)

**Files:**
- Modify: `src/tools/reference.ts`
- Create: `tests/tools/reference-monsters.test.ts`
- Create: `tests/tools/reference-items.test.ts`

**Step 1: Implement `search_monsters`, `get_monster`, `search_items`, `get_item`, `search_feats`, `get_condition`, `search_classes`**

**Step 2: Tests, verify, commit**

---

## Task 5a: Character Write Tools

**Files:**
- Modify: `src/tools/character.ts`
- Create: `tests/tools/character-write.test.ts`

**Step 1: Implement write tools**

- `update_hp` → PUT to `/life/hp/damage-taken` with `{ removedHitPoints, temporaryHitPoints }`
- `update_spell_slots` → PUT to `/spell/slots` with slot level and usage data
- `update_death_saves` → PUT to `/life/death-saves`
- `update_currency` → PUT to `/inventory/currency`
- `use_ability` → PUT to `/action/limited-use`

Each write tool must:
- Validate inputs
- Call `DdbClient.put()` with proper endpoint and body
- Invalidate character cache after successful write
- Return confirmation text

**Step 2: Tests, verify, commit**

```bash
git commit -m "feat: character write tools — update HP, spell slots, death saves, currency, abilities"
```

---

## Task 5b: Character Resources

**Files:**
- Create: `src/resources/character.ts`

**Step 1: Register MCP resources**

- `dndbeyond://characters` (direct) → calls list_characters logic
- `dndbeyond://character/{id}` (template) → calls get_character logic
- `dndbeyond://character/{id}/spells` (template) → extracts spell data
- `dndbeyond://character/{id}/inventory` (template) → extracts inventory

**Step 2: Commit**

---

## Task 5c: Campaign Resources

**Files:**
- Create: `src/resources/campaign.ts`

Register: `dndbeyond://campaigns` and `dndbeyond://campaign/{id}/party`

---

## Task 5d: Auth MCP Tools

**Files:**
- Create: `src/tools/auth.ts`

Implement `setup_auth` (triggers Playwright flow) and `check_auth` (validates current session).

---

## Task 6a: MCP Prompts

**Files:**
- Create: `src/prompts/character-summary.ts`
- Create: `src/prompts/session-prep.ts`
- Create: `src/prompts/encounter-builder.ts`
- Create: `src/prompts/spell-advisor.ts`
- Create: `src/prompts/level-up-guide.ts`
- Create: `src/prompts/rules-lookup.ts`

Each prompt is a parameterized template registered with the MCP server. They provide structured instructions for Claude to follow when the user invokes them.

Example `character-summary`:
```typescript
server.prompt("character-summary", { characterName: z.string() }, ({ characterName }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Retrieve the character "${characterName}" from D&D Beyond and provide a comprehensive summary including:
- Basic info (name, race, class/level, background)
- Ability scores with modifiers
- HP (current/max/temp), AC, speed
- Proficient skills and saves
- Notable features and abilities
- Spell slots and prepared spells (if any)
- Key inventory items
- Campaign membership`,
    },
  }],
}));
```

**Commit after all prompts implemented.**

---

## Task 6b: Query Enhancement

**Files:**
- Create: `src/utils/fuzzy-match.ts`

Implement synonym mapping and fuzzy matching for D&D-specific queries:
- "fireball" → "Fireball"
- "HP" → "Hit Points"
- "AC" → "Armor Class"
- Levenshtein distance for typo tolerance

---

## Task 7a: Server Entry Point

**Files:**
- Modify: `src/index.ts`
- Create: `src/server.ts`

Wire everything together:
1. Initialize cache instances (character: 60s, campaign: 5min, reference: 24h)
2. Initialize resilience (circuit breaker: 5 failures / 30s cooldown, rate limiter: 2/sec)
3. Initialize DdbClient with cache + resilience
4. Create MCP server
5. Register all tools, resources, and prompts
6. Connect via stdio transport
7. Handle graceful shutdown

---

## Task 7b: Integration Tests

**Files:**
- Create: `tests/integration/server.test.ts`

Test the MCP server end-to-end with mocked HTTP responses:
- Server starts and responds to `initialize`
- `tools/list` returns all registered tools
- `resources/list` returns all resources
- `prompts/list` returns all prompts
- Tool calls with mocked API return expected results

---

## Task 7c: npm Packaging + README Update

**Files:**
- Modify: `package.json` (verify bin, main, files fields)
- Modify: `README.md` (update with actual usage examples)

Verify:
- `npm run build` succeeds
- `npm pack` creates valid tarball
- `npx . setup` triggers auth flow
- `npx .` starts MCP server

**Final commit:**

```bash
git commit -m "feat: complete MCP server with tools, resources, prompts, and packaging"
```

---

## Summary

| Phase | Tasks | Wave Coverage |
|-------|-------|--------------|
| Foundation | 1a, 1b, 1c, 1d | Wave 1 |
| Integration | 2a, 2b, 2c | Wave 2 |
| Auth + Read Tools | 3a, 4a, 4b, 4c, 4d | Wave 3 |
| Write + Resources | 5a, 5b, 5c, 5d | Wave 4 |
| Prompts + Enhancement | 6a, 6b | Wave 5 |
| Server + Polish | 7a, 7b, 7c | Wave 6 |

**Total: 20 subtasks across 6 waves, parallelizable to 3-5 concurrent agents per wave.**
