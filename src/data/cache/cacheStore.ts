/**
 * Simple in-memory cache implementation for API responses
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class CacheStore {
  // We need to use Record<string, unknown> to represent values of different types
  private store: Map<string, CacheEntry<unknown>> = new Map();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }

    // Type assertion needed since we're storing as unknown but retrieving as T
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.store.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(pattern: RegExp): void {
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiry) {
        this.store.delete(key);
      }
    }
  }

  // Helper methods for common cache invalidation scenarios
  invalidateContentCache(): void {
    // Invalidate all content-related cache entries
    this.invalidatePattern(/^horizontal-list:/);
    this.invalidatePattern(/^media:/);
    this.invalidatePattern(/^episode-picker:/);
    this.invalidatePattern(/^content-count/);
    this.invalidatePattern(/^banner$/);
  }

  invalidateNotificationCache(): void {
    // Invalidate all notification-related cache entries
    this.invalidatePattern(/^notifications:/);
    this.invalidatePattern(/^unread-count$/);
  }

  invalidateSystemCache(): void {
    // Invalidate system-related cache entries
    this.invalidatePattern(/^system-status$/);
  }

  invalidateAdminCache(): void {
    // Invalidate all admin-related cache entries
    this.invalidatePattern(/^admin:/);
  }

  invalidateUserSpecificCache(): void {
    // Invalidate caches that are user-specific
    this.invalidateContentCache();
    this.invalidateNotificationCache();
  }
}

export const cacheStore = new CacheStore();

// Clean up expired entries every 5 minutes
setInterval(
  () => {
    cacheStore.cleanup();
  },
  5 * 60 * 1000,
);
