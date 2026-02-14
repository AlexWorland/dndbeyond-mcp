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
    cache.set("c", "3");
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
