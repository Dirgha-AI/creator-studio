type Callback = (elements: Element[]) => void;

interface DOMObserverConfig {
  targetSelector: string;
  containerSelector?: string;
  debounceMs?: number;
  observeSubtree?: boolean;
  maxBatchSize?: number;
}

export class DOMObserver {
  private observer: MutationObserver | null = null;
  private config: Required<DOMObserverConfig>;
  private callback: Callback;
  private pendingElements: Set<Element> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isObserving = false;

  constructor(callback: Callback, config: DOMObserverConfig) {
    this.callback = callback;
    this.config = {
      targetSelector: config.targetSelector,
      containerSelector: config.containerSelector ?? 'body',
      debounceMs: config.debounceMs ?? 100,
      observeSubtree: config.observeSubtree ?? true,
      maxBatchSize: config.maxBatchSize ?? 50
    };
  }

  start(): boolean {
    if (this.isObserving || typeof window === 'undefined') return false;

    const container = document.querySelector(this.config.containerSelector);
    if (!container) return false;

    this.processInitialElements(container);
    
    this.observer = new MutationObserver((mutations) => {
      const newElements: Element[] = [];
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) {
            if (node.matches(this.config.targetSelector)) {
              newElements.push(node);
            }
            if (this.config.observeSubtree) {
              const nested = node.querySelectorAll(this.config.targetSelector);
              nested.forEach((el) => newElements.push(el));
            }
          }
        });
      });

      if (newElements.length > 0) {
        newElements.forEach((el) => this.pendingElements.add(el));
        this.scheduleCallback();
      }
    });

    this.observer.observe(container, {
      childList: true,
      subtree: this.config.observeSubtree
    });

    this.isObserving = true;
    return true;
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingElements.clear();
    this.isObserving = false;
  }

  private processInitialElements(container: Element): void {
    const elements = Array.from(container.querySelectorAll(this.config.targetSelector));
    if (elements.length > 0) {
      elements.forEach((el) => this.pendingElements.add(el));
      this.flushPendingElements();
    }
  }

  private scheduleCallback(): void {
    if (this.debounceTimer) return;

    this.debounceTimer = setTimeout(() => {
      this.flushPendingElements();
      this.debounceTimer = null;
    }, this.config.debounceMs);
  }

  private flushPendingElements(): void {
    if (this.pendingElements.size === 0) return;

    const elements = Array.from(this.pendingElements);
    this.pendingElements.clear();

    const batches = this.chunkArray(elements, this.config.maxBatchSize);
    batches.forEach((batch) => {
      requestIdleCallback?.(() => this.callback(batch)) ??
        setTimeout(() => this.callback(batch), 0);
    });
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  isRunning(): boolean {
    return this.isObserving;
  }
}

export function detectPlatform(): string | null {
  const host = window.location.hostname;
  const platforms: Record<string, string[]> = {
    twitter: ['twitter.com', 'x.com'],
    instagram: ['instagram.com'],
    youtube: ['youtube.com', 'youtu.be'],
    tiktok: ['tiktok.com'],
    facebook: ['facebook.com', 'fb.com'],
    linkedin: ['linkedin.com']
  };

  for (const [name, domains] of Object.entries(platforms)) {
    if (domains.some((d) => host.includes(d))) return name;
  }
  return null;
}
