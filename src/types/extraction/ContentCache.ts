import { Content, Score } from '../interfaces/ContentTypes';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
}

interface CacheOptions {
  maxSize: number;
  ttlMs: number;
}

export class ContentCache {
  private contentCache: Map<string, CacheEntry<Content>>;
  private scoreCache: Map<string, CacheEntry<Score>>;
  private options: CacheOptions;

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: options.maxSize ?? 1000,
      ttlMs: options.ttlMs ?? 300000
    };
    this.contentCache = new Map();
    this.scoreCache = new Map();
    this.startCleanupInterval();
  }

  getContent(id: string): Content | null {
    return this.get(this.contentCache, id);
  }

  setContent(content: Content): void {
    this.set(this.contentCache, content.id, content);
  }

  getScore(contentId: string): Score | null {
    return this.get(this.scoreCache, contentId);
  }

  setScore(score: Score): void {
    this.set(this.scoreCache, score.contentId, score);
  }

  hasContent(id: string): boolean {
    return this.has(this.contentCache, id);
  }

  hasScore(contentId: string): boolean {
    return this.has(this.scoreCache, contentId);
  }

  invalidateContent(id: string): void {
    this.contentCache.delete(id);
    this.scoreCache.delete(id);
  }

  invalidatePlatform(platform: string): void {
    for (const [key, entry] of this.contentCache) {
      if (entry.value.platform === platform) {
        this.invalidateContent(key);
      }
    }
  }

  clear(): void {
    this.contentCache.clear();
    this.scoreCache.clear();
  }

  getStats(): { contentSize: number; scoreSize: number; hitRate: number } {
    return {
      contentSize: this.contentCache.size,
      scoreSize: this.scoreCache.size,
      hitRate: this.calculateHitRate()
    };
  }

  private get<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.options.ttlMs) {
      cache.delete(key);
      return null;
    }

    entry.accessCount++;
    return entry.value;
  }

  private set<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    if (cache.size >= this.options.maxSize && !cache.has(key)) {
      this.evictLRU(cache);
    }

    cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0
    });
  }

  private has<T>(cache: Map<string, CacheEntry<T>>, key: string): boolean {
    const entry = cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > this.options.ttlMs) {
      cache.delete(key);
      return false;
    }
    return true;
  }

  private evictLRU<T>(cache: Map<string, CacheEntry<T>>): void {
    let oldest: [string, CacheEntry<T>] | null = null;
    
    for (const [key, entry] of cache) {
      if (!oldest || entry.accessCount < oldest[1].accessCount) {
        oldest = [key, entry];
      }
    }
    
    if (oldest) cache.delete(oldest[0]);
  }

  private startCleanupInterval(): void {
    if (typeof window !== 'undefined') {
      setInterval(() => this.cleanup(), this.options.ttlMs);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.contentCache) {
      if (now - entry.timestamp > this.options.ttlMs) {
        this.contentCache.delete(key);
      }
    }
    for (const [key, entry] of this.scoreCache) {
      if (now - entry.timestamp > this.options.ttlMs) {
        this.scoreCache.delete(key);
      }
    }
  }

  private calculateHitRate(): number {
    const total = this.contentCache.size + this.scoreCache.size;
    if (total === 0) return 0;
    const hits = Array.from(this.contentCache.values()).reduce((sum, e) => sum + e.accessCount, 0) +
                 Array.from(this.scoreCache.values()).reduce((sum, e) => sum + e.accessCount, 0);
    return Math.round((hits / total) * 100);
  }
}

export const globalCache = new ContentCache();
