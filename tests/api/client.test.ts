import { describe, it, expect, vi, beforeEach } from "vitest";
import { DdbClient } from "../../src/api/client.js";
import { TtlCache } from "../../src/cache/lru.js";
import { CircuitBreaker, RateLimiter, HttpError } from "../../src/resilience/index.js";

vi.mock("../../src/api/auth.js", () => ({
  getCobaltToken: vi.fn(),
  getAllCookies: vi.fn(),
  buildAuthHeadersFromCookies: vi.fn(),
  getCobaltSession: vi.fn(),
  buildAuthHeaders: vi.fn(),
}));

const mockGetCobaltToken = await import("../../src/api/auth.js").then(
  (m) => m.getCobaltToken as ReturnType<typeof vi.fn>
);
const mockGetAllCookies = await import("../../src/api/auth.js").then(
  (m) => m.getAllCookies as ReturnType<typeof vi.fn>
);

describe("DdbClient", () => {
  let client: DdbClient;
  let mockCache: TtlCache<unknown>;
  let mockCircuitBreaker: CircuitBreaker;
  let mockRateLimiter: RateLimiter;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
    } as unknown as TtlCache<unknown>;

    mockCircuitBreaker = {
      execute: vi.fn((fn) => fn()),
    } as unknown as CircuitBreaker;

    mockRateLimiter = {
      acquire: vi.fn().mockResolvedValue(undefined),
    } as unknown as RateLimiter;

    client = new DdbClient(mockCache, mockCircuitBreaker, mockRateLimiter);

    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Default: character-service URL uses bearer tokens
    mockGetCobaltToken.mockResolvedValue("fake-bearer-token");
    // For non-character-service URLs, provide cookies
    mockGetAllCookies.mockResolvedValue([
      { name: "CobaltSession", value: "fake-session" },
    ]);
  });

  describe("get", () => {
    it("shouldReturnCachedDataWhenCacheHit", async () => {
      const cachedData = { id: 1, name: "Cached Character" };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(cachedData);

      const result = await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1");

      expect(result).toBe(cachedData);
      expect(mockCache.get).toHaveBeenCalledWith("character:1");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("shouldFetchFromApiWhenCacheMiss", async () => {
      const apiData = { success: true, data: { id: 1, name: "API Character" } };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(apiData),
      });

      const result = await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1");

      // client.get unwraps the envelope
      expect(result).toEqual({ id: 1, name: "API Character" });
      expect(mockCache.get).toHaveBeenCalledWith("character:1");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://character-service.dndbeyond.com/character/v5/character/1",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer fake-bearer-token",
          }),
        })
      );
    });

    it("shouldStoreResultInCacheAfterFetch", async () => {
      const apiData = { success: true, data: { id: 1, name: "API Character" } };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(apiData),
      });

      await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1", 300);

      // Cache stores the unwrapped data
      expect(mockCache.set).toHaveBeenCalledWith("character:1", { id: 1, name: "API Character" }, 300);
    });

    it("shouldStoreResultInCacheWithoutTtlWhenNotProvided", async () => {
      const apiData = { success: true, data: { id: 1, name: "API Character" } };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(apiData),
      });

      await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1");

      expect(mockCache.set).toHaveBeenCalledWith("character:1", { id: 1, name: "API Character" }, undefined);
    });
  });

  describe("put", () => {
    it("shouldSendRequestWithJsonBody", async () => {
      const requestBody = { name: "Updated Character", level: 5 };
      const responseData = { success: true, data: { id: 1, ...requestBody } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseData),
      });

      const result = await client.put("https://character-service.dndbeyond.com/character/v5/character/1", requestBody);

      expect(result).toEqual({ id: 1, ...requestBody });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://character-service.dndbeyond.com/character/v5/character/1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(requestBody),
        })
      );
    });

    it("shouldInvalidateSpecifiedCacheKeys", async () => {
      const responseData = { success: true, data: { id: 1, name: "Updated" } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseData),
      });

      await client.put("https://character-service.dndbeyond.com/character/v5/character/1", { name: "Updated" }, ["character:1", "characters:list"]);

      expect(mockCache.invalidate).toHaveBeenCalledWith("character:1");
      expect(mockCache.invalidate).toHaveBeenCalledWith("characters:list");
      expect(mockCache.invalidate).toHaveBeenCalledTimes(2);
    });

    it("shouldNotInvalidateCacheWhenKeysNotProvided", async () => {
      const responseData = { success: true, data: { id: 1, name: "Updated" } };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseData),
      });

      await client.put("https://character-service.dndbeyond.com/character/v5/character/1", { name: "Updated" });

      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe("request error handling", () => {
    beforeEach(() => {
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    });

    it("shouldThrowHttpErrorWhenResponseNotOk", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        client.get("https://character-service.dndbeyond.com/character/v5/character/999", "character:999")
      ).rejects.toThrow(HttpError);
      await expect(
        client.get("https://character-service.dndbeyond.com/character/v5/character/999", "character:999")
      ).rejects.toThrow("D&D Beyond API error: 404 Not Found");
    });

    it("shouldSetAuthExpiredFlagWhen401Response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      expect(client.isAuthExpired).toBe(false);

      await expect(
        client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1")
      ).rejects.toThrow(HttpError);

      expect(client.isAuthExpired).toBe(true);
    });

    it("shouldNotSetAuthExpiredFlagWhenNon401Error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      expect(client.isAuthExpired).toBe(false);

      await expect(
        client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1")
      ).rejects.toThrow(HttpError);

      expect(client.isAuthExpired).toBe(false);
    });

    it("shouldThrowErrorWhenNotAuthenticatedForCookieEndpoints", async () => {
      vi.useFakeTimers();
      mockGetAllCookies.mockResolvedValue([]);

      const promise = client.get("https://www.dndbeyond.com/api/config/json", "config");

      // Advance past withRetry's exponential backoff delays
      const expectPromise = expect(promise).rejects.toThrow("Not authenticated. Run setup first.");
      await vi.runAllTimersAsync();
      await expectPromise;

      expect(mockFetch).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("resilience integration", () => {
    beforeEach(() => {
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { id: 1 } }),
      });
    });

    it("shouldCallRateLimiterAcquireBeforeEachRequest", async () => {
      await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1");

      expect(mockRateLimiter.acquire).toHaveBeenCalledTimes(1);
    });

    it("shouldWrapRequestInCircuitBreaker", async () => {
      await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1");

      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1);
      expect(mockCircuitBreaker.execute).toHaveBeenCalledWith(expect.any(Function));
    });

    it("shouldCallRateLimiterBeforeCircuitBreaker", async () => {
      const callOrder: string[] = [];

      (mockRateLimiter.acquire as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callOrder.push("rateLimiter");
      });

      (mockCircuitBreaker.execute as ReturnType<typeof vi.fn>).mockImplementation((fn) => {
        callOrder.push("circuitBreaker");
        return fn();
      });

      await client.get("https://character-service.dndbeyond.com/character/v5/character/1", "character:1");

      expect(callOrder).toEqual(["rateLimiter", "circuitBreaker"]);
    });
  });
});
