import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, HttpError } from "../../src/resilience/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on retryable errors and eventually succeed", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue("success");

    const retryPromise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100 });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await retryPromise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should not retry on non-retryable HttpError (401)", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("Unauthorized", 401));
    await expect(withRetry(fn)).rejects.toThrow("Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not retry on non-retryable HttpError (403)", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("Forbidden", 403));
    await expect(withRetry(fn)).rejects.toThrow("Forbidden");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not retry on non-retryable HttpError (404)", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("Not Found", 404));
    await expect(withRetry(fn)).rejects.toThrow("Not Found");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should throw after max retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));

    const retryPromise = withRetry(fn, { maxRetries: 2, baseDelayMs: 100 }).catch((e) => e);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(400);

    const error = await retryPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("persistent failure");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should use exponential backoff delays", async () => {
    vi.useRealTimers();

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("failure"))
      .mockRejectedValueOnce(new Error("failure"))
      .mockRejectedValueOnce(new Error("failure"));

    const delays: number[] = [];
    vi.spyOn(global, "setTimeout").mockImplementation(((callback: () => void, delay: number) => {
      delays.push(delay);
      callback();
      return {} as NodeJS.Timeout;
    }) as typeof setTimeout);

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 100 })).rejects.toThrow("failure");

    expect(delays).toEqual([100, 200]);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
