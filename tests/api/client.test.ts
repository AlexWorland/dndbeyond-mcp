import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DdbClient } from "../../src/api/client.js";
import { TtlCache } from "../../src/cache/lru.js";
import { CircuitBreaker, RateLimiter, HttpError } from "../../src/resilience/index.js";

vi.mock("../../src/api/auth.js", () => ({
  getCobaltSession: vi.fn(),
  buildAuthHeaders: vi.fn(),
}));

const mockGetCobaltSession = await import("../../src/api/auth.js").then(
  (m) => m.getCobaltSession as ReturnType<typeof vi.fn>
);
const mockBuildAuthHeaders = await import("../../src/api/auth.js").then(
  (m) => m.buildAuthHeaders as ReturnType<typeof vi.fn>
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

    mockGetCobaltSession.mockResolvedValue("fake-session-token");
    mockBuildAuthHeaders.mockReturnValue({
      Authorization: "Bearer fake-token",
      "Content-Type": "application/json",
    });
  });

  describe("get", () => {
    it("shouldReturnCachedDataWhenCacheHit", async () => {
      const cachedData = { id: 1, name: "Cached Character" };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(cachedData);

      const result = await client.get("/api/characters/1", "character:1");

      expect(result).toBe(cachedData);
      expect(mockCache.get).toHaveBeenCalledWith("character:1");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("shouldFetchFromApiWhenCacheMiss", async () => {
      const apiData = { id: 1, name: "API Character" };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(apiData),
      });

      const result = await client.get("/api/characters/1", "character:1");

      expect(result).toEqual(apiData);
      expect(mockCache.get).toHaveBeenCalledWith("character:1");
      expect(mockFetch).toHaveBeenCalledWith("/api/characters/1", {
        method: "GET",
        headers: {
          Authorization: "Bearer fake-token",
          "Content-Type": "application/json",
        },
      });
    });

    it("shouldStoreResultInCacheAfterFetch", async () => {
      const apiData = { id: 1, name: "API Character" };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(apiData),
      });

      await client.get("/api/characters/1", "character:1", 300);

      expect(mockCache.set).toHaveBeenCalledWith("character:1", apiData, 300);
    });

    it("shouldStoreResultInCacheWithoutTtlWhenNotProvided", async () => {
      const apiData = { id: 1, name: "API Character" };
      (mockCache.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(apiData),
      });

      await client.get("/api/characters/1", "character:1");

      expect(mockCache.set).toHaveBeenCalledWith("character:1", apiData, undefined);
    });
  });

  describe("put", () => {
    it("shouldSendRequestWithJsonBody", async () => {
      const requestBody = { name: "Updated Character", level: 5 };
      const responseData = { id: 1, ...requestBody };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseData),
      });

      const result = await client.put("/api/characters/1", requestBody);

      expect(result).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledWith("/api/characters/1", {
        method: "PUT",
        body: JSON.stringify(requestBody),
        headers: {
          Authorization: "Bearer fake-token",
          "Content-Type": "application/json",
        },
      });
    });

    it("shouldInvalidateSpecifiedCacheKeys", async () => {
      const responseData = { id: 1, name: "Updated" };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseData),
      });

      await client.put("/api/characters/1", { name: "Updated" }, ["character:1", "characters:list"]);

      expect(mockCache.invalidate).toHaveBeenCalledWith("character:1");
      expect(mockCache.invalidate).toHaveBeenCalledWith("characters:list");
      expect(mockCache.invalidate).toHaveBeenCalledTimes(2);
    });

    it("shouldNotInvalidateCacheWhenKeysNotProvided", async () => {
      const responseData = { id: 1, name: "Updated" };
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseData),
      });

      await client.put("/api/characters/1", { name: "Updated" });

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

      await expect(client.get("/api/characters/999", "character:999")).rejects.toThrow(HttpError);
      await expect(client.get("/api/characters/999", "character:999")).rejects.toThrow(
        "D&D Beyond API error: 404 Not Found"
      );
    });

    it("shouldSetAuthExpiredFlagWhen401Response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      expect(client.isAuthExpired).toBe(false);

      await expect(client.get("/api/characters/1", "character:1")).rejects.toThrow(HttpError);

      expect(client.isAuthExpired).toBe(true);
    });

    it("shouldNotSetAuthExpiredFlagWhenNon401Error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      expect(client.isAuthExpired).toBe(false);

      await expect(client.get("/api/characters/1", "character:1")).rejects.toThrow(HttpError);

      expect(client.isAuthExpired).toBe(false);
    });

    it("shouldThrowErrorWhenNotAuthenticated", async () => {
      vi.useFakeTimers();
      mockGetCobaltSession.mockResolvedValue(null);

      const promise = client.get("/api/characters/1", "character:1");

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
        json: vi.fn().mockResolvedValue({ id: 1 }),
      });
    });

    it("shouldCallRateLimiterAcquireBeforeEachRequest", async () => {
      await client.get("/api/characters/1", "character:1");

      expect(mockRateLimiter.acquire).toHaveBeenCalledTimes(1);
    });

    it("shouldWrapRequestInCircuitBreaker", async () => {
      await client.get("/api/characters/1", "character:1");

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

      await client.get("/api/characters/1", "character:1");

      expect(callOrder).toEqual(["rateLimiter", "circuitBreaker"]);
    });
  });
});
