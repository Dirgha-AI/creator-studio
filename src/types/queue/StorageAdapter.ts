export abstract class StorageAdapter {
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string): Promise<void>;
  abstract remove(key: string): Promise<void>;
  abstract getAll(): Promise<Record<string, string>>;
  abstract clear(): Promise<void>;
}

export class LocalStorageAdapter extends StorageAdapter {
  async get(key: string): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }

  async getAll(): Promise<Record<string, string>> {
    if (typeof localStorage === 'undefined') return {};
    const result: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) result[key] = localStorage.getItem(key) ?? '';
    }
    return result;
  }

  async clear(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.clear();
  }
}

export class ChromeStorageAdapter extends StorageAdapter {
  private area: 'local' | 'sync';

  constructor(area: 'local' | 'sync' = 'local') {
    super();
    this.area = area;
  }

  async get(key: string): Promise<string | null> {
    const storage = this.getStorage();
    if (!storage) return null;
    const result = await storage.get(key);
    return result[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;
    await storage.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;
    await storage.remove(key);
  }

  async getAll(): Promise<Record<string, string>> {
    const storage = this.getStorage();
    if (!storage) return {};
    return await storage.get(null) as Record<string, string>;
  }

  async clear(): Promise<void> {
    const storage = this.getStorage();
    if (!storage) return;
    await storage.clear();
  }

  private getStorage(): chrome.storage.StorageArea | null {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    return chrome.storage[this.area];
  }
}

export class IndexedDBAdapter extends StorageAdapter {
  private dbName = 'creator-os-storage';
  private storeName = 'kv-store';
  private version = 1;
  private db: IDBDatabase | null = null;

  async get(key: string): Promise<string | null> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const result = await this.request(store.get(key));
    return result?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await this.request(store.put({ key, value, timestamp: Date.now() }));
  }

  async remove(key: string): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await this.request(store.delete(key));
  }

  async getAll(): Promise<Record<string, string>> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const results = await this.request(store.getAll());
    return results.reduce((acc: Record<string, string>, item: { key: string; value: string }) => {
      acc[item.key] = item.value;
      return acc;
    }, {});
  }

  async clear(): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await this.request(store.clear());
  }

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.db = request.result; resolve(this.db!); };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
        }
      };
    });
  }

  private request<T>(req: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}
