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
