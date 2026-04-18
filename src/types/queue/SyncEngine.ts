import { QueueItem, QueueManager } from './QueueManager';
import { StorageAdapter } from './StorageAdapter';

interface SyncEngineConfig {
  apiUrl: string;
  apiKey: string;
  syncIntervalMs: number;
  conflictStrategy: 'local' | 'remote' | 'timestamp';
  batchSize: number;
  retryAttempts: number;
}

interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
  timestamp: number;
}

export class SyncEngine {
  private config: SyncEngineConfig;
  private queue: QueueManager;
  private storage: StorageAdapter;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private lastSync = 0;

  constructor(
    queue: QueueManager,
    storage: StorageAdapter,
    config: Partial<SyncEngineConfig> = {}
  ) {
    this.queue = queue;
    this.storage = storage;
    this.config = {
      apiUrl: config.apiUrl ?? 'https://api.dirgha.ai/v1/creator-os',
      apiKey: config.apiKey ?? '',
      syncIntervalMs: config.syncIntervalMs ?? 300000,
      conflictStrategy: config.conflictStrategy ?? 'timestamp',
      batchSize: config.batchSize ?? 50,
      retryAttempts: config.retryAttempts ?? 3
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sync(), this.config.syncIntervalMs);
    this.sync();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync(): Promise<SyncResult> {
    if (this.isSyncing) return { synced: 0, failed: 0, conflicts: 0, timestamp: Date.now() };
    this.isSyncing = true;

    const result: SyncResult = { synced: 0, failed: 0, conflicts: 0, timestamp: Date.now() };
    
    try {
      const pending = this.queue.getAll().filter((i) => i.status === 'pending');
      const batches = this.chunk(pending, this.config.batchSize);

      for (const batch of batches) {
        const batchResult = await this.syncBatch(batch);
        result.synced += batchResult.synced;
        result.failed += batchResult.failed;
        result.conflicts += batchResult.conflicts;
      }

      const remoteItems = await this.fetchRemoteItems();
      await this.mergeRemote(remoteItems, result);

      this.lastSync = Date.now();
      await this.storage.set('last-sync', String(this.lastSync));
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  private async syncBatch(items: QueueItem[]): Promise<Partial<SyncResult>> {
    const result = { synced: 0, failed: 0, conflicts: 0 };

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.config.apiUrl}/queue/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({ items })
        });

        if (response.ok) {
          for (const item of items) {
            await this.queue.update(item.id, { status: 'synced', syncedAt: Date.now() });
          }
          result.synced = items.length;
          return result;
        }
      } catch {
        await this.delay(1000 * Math.pow(2, attempt));
      }
    }

    result.failed = items.length;
    for (const item of items) {
      await this.queue.update(item.id, { status: 'error', errorMessage: 'Sync failed after retries' });
    }

    return result;
  }

  private async fetchRemoteItems(): Promise<QueueItem[]> {
    try {
      const response = await fetch(`${this.config.apiUrl}/queue?since=${this.lastSync}`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
      });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }

  private async mergeRemote(remoteItems: QueueItem[], result: SyncResult): Promise<void> {
    for (const remote of remoteItems) {
      const local = this.queue.get(remote.id);
      if (!local) {
        await this.queue.add(remote.content, remote.score, remote.priority);
        continue;
      }

      const winner = this.resolveConflict(local, remote);
      if (winner === 'remote') {
        await this.queue.update(local.id, { ...remote, status: 'synced' });
        result.conflicts++;
      }
    }
  }

  private resolveConflict(local: QueueItem, remote: QueueItem): 'local' | 'remote' {
    switch (this.config.conflictStrategy) {
      case 'local': return 'local';
      case 'remote': return 'remote';
      case 'timestamp':
      default:
        return (remote.syncedAt ?? 0) > (local.syncedAt ?? 0) ? 'remote' : 'local';
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }
}
