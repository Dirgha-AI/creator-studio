export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<void>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
}

class StubRedis implements RedisClient {
  private store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async set(key: string, value: string) { this.store.set(key, value); }
  async setex(key: string, _seconds: number, value: string) { this.store.set(key, value); }
  async del(key: string) { this.store.delete(key); }
  async incr(key: string) {
    const v = parseInt(this.store.get(key) || '0', 10) + 1;
    this.store.set(key, String(v));
    return v;
  }
  async expire() {}
  async publish(_channel: string, _message: string) { return 0; }
  async lrange(key: string, start: number, stop: number) {
    const arr = JSON.parse(this.store.get(key) || '[]');
    return arr.slice(start, stop === -1 ? undefined : stop + 1);
  }
  async lpush(key: string, ...values: string[]) {
    const arr = JSON.parse(this.store.get(key) || '[]');
    arr.unshift(...values);
    this.store.set(key, JSON.stringify(arr));
    return arr.length;
  }
  async ltrim(key: string, start: number, stop: number) {
    const arr = JSON.parse(this.store.get(key) || '[]');
    this.store.set(key, JSON.stringify(arr.slice(start, stop + 1)));
  }
}

let client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!client) client = new StubRedis();
  return client;
}
