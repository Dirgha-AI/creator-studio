import { QueueItem, Content, Score, ContentFilter } from '../interfaces/ContentTypes';
import { StorageAdapter } from './StorageAdapter';

interface QueueOptions {
  maxSize: number;
  storage: StorageAdapter;
  apiEndpoint?: string;
}

export class QueueManager {
  private items: Map<string, QueueItem> = new Map();
  private options: QueueOptions;
  private listeners: Set<(items: QueueItem[]) => void> = new Set();

  constructor(options: QueueOptions) {
    this.options = options;
    this.loadFromStorage();
  }

  async add(content: Content, score: Score, priority?: number): Promise<QueueItem> {
    if (this.items.has(content.id)) {
      return this.items.get(content.id)!;
    }

    if (this.items.size >= this.options.maxSize) {
      this.evictLowestPriority();
    }

    const item: QueueItem = {
      id: content.id,
      content,
      score,
      addedAt: Date.now(),
      priority: priority ?? Math.round(score.overall),
      status: 'pending',
      tags: [],
      notes: ''
    };

    this.items.set(content.id, item);
    await this.persist();
    this.notifyListeners();

    return item;
  }

  async remove(id: string): Promise<boolean> {
    const removed = this.items.delete(id);
    if (removed) {
      await this.persist();
      this.notifyListeners();
    }
    return removed;
  }

  async update(id: string, updates: Partial<QueueItem>): Promise<QueueItem | null> {
    const item = this.items.get(id);
    if (!item) return null;

    Object.assign(item, updates);
    await this.persist();
    this.notifyListeners();
    return item;
  }

  get(id: string): QueueItem | undefined {
    return this.items.get(id);
  }

  getAll(): QueueItem[] {
    return Array.from(this.items.values());
  }

  filter(predicate: ContentFilter): QueueItem[] {
    return this.getAll().filter((item) => {
      if (predicate.platforms && !predicate.platforms.includes(item.content.platform)) return false;
      if (predicate.minScore && item.score.overall < predicate.minScore) return false;
      if (predicate.maxScore && item.score.overall > predicate.maxScore) return false;
      if (predicate.tags && !predicate.tags.some((t) => item.tags.includes(t))) return false;
      if (predicate.status && !predicate.status.includes(item.status)) return false;
      return true;
    });
  }

  subscribe(callback: (items: QueueItem[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getAll());
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const items = this.getAll();
    this.listeners.forEach((cb) => cb(items));
  }

  private async loadFromStorage(): Promise<void> {
    const data = await this.options.storage.get('creator-os-queue');
    if (data) {
      const parsed = JSON.parse(data);
      this.items = new Map(parsed.map((i: QueueItem) => [i.id, i]));
      this.notifyListeners();
    }
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify(this.getAll());
    await this.options.storage.set('creator-os-queue', data);
  }

  private evictLowestPriority(): void {
    let lowest: [string, QueueItem] | null = null;
    for (const [id, item] of this.items) {
      if (!lowest || item.priority < lowest[1].priority) {
        lowest = [id, item];
      }
    }
    if (lowest) this.items.delete(lowest[0]);
  }
}
