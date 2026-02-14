import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/resilience/rate-limiter.js";

describe("RateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("should allow immediate acquisition when tokens available", async () => {
    const limiter = new RateLimiter(2, 1000);
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBe(0);
  });

  it("should wait when no tokens available", async () => {
    const limiter = new RateLimiter(1, 1000);
    await limiter.acquire();

    const acquirePromise = limiter.acquire();
    vi.advanceTimersByTime(1000);
    await acquirePromise;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("should refill tokens over time", async () => {
    const limiter = new RateLimiter(2, 1000);

    await limiter.acquire();
    await limiter.acquire();

    vi.advanceTimersByTime(1000);

    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBe(0);
  });
});
