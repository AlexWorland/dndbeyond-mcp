import { TtlCache } from "../cache/lru.js";
import { CircuitBreaker, RateLimiter, withRetry, HttpError } from "../resilience/index.js";
import { getCobaltToken, getAllCookies, buildAuthHeadersFromCookies } from "./auth.js";

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
        const headers = await this.buildHeaders(url);
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

  private async buildHeaders(url: string): Promise<Record<string, string>> {
    // character-service and auth-service use bearer tokens
    if (url.includes("character-service.dndbeyond.com")) {
      const token = await getCobaltToken();
      return {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };
    }

    // dndbeyond.com endpoints use cookies + cobalt token header
    const cookies = await getAllCookies();
    if (cookies.length === 0) throw new Error("Not authenticated. Run setup first.");

    const token = await getCobaltToken();
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    return {
      Cookie: cookieStr,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }
}
