import { TtlCache } from "../cache/lru.js";
import { CircuitBreaker, RateLimiter, withRetry, HttpError } from "../resilience/index.js";
import { getCobaltSession, buildAuthHeaders } from "./auth.js";

export class DdbClient {
  private authExpired = false;

  constructor(
    private readonly cache: TtlCache<unknown>,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly rateLimiter: RateLimiter,
  ) {}

  get isAuthExpired(): boolean {
    return this.authExpired;
  }

  async get<T>(url: string, cacheKey: string, ttl?: number): Promise<T> {
    const cached = this.cache.get(cacheKey) as T | undefined;
    if (cached !== undefined) return cached;

    const result = await this.request<T>(url, { method: "GET" });
    this.cache.set(cacheKey, result, ttl);
    return result;
  }

  async put<T>(url: string, body: unknown, invalidateCacheKeys?: string[]): Promise<T> {
    const result = await this.request<T>(url, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (invalidateCacheKeys) {
      for (const key of invalidateCacheKeys) {
        this.cache.invalidate(key);
      }
    }
    return result;
  }

  private async request<T>(url: string, options: RequestInit): Promise<T> {
    await this.rateLimiter.acquire();

    return this.circuitBreaker.execute(() =>
      withRetry(async () => {
        const session = await getCobaltSession();
        if (!session) throw new Error("Not authenticated. Run setup first.");

        const headers = buildAuthHeaders(session);
        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
          if (response.status === 401) {
            this.authExpired = true;
          }
          throw new HttpError(
            `D&D Beyond API error: ${response.status} ${response.statusText}`,
            response.status,
          );
        }

        return response.json() as Promise<T>;
      })
    );
  }
}
