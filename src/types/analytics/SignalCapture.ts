import { AnalyticsEvent } from '../interfaces/ContentTypes';

interface SignalCaptureConfig {
  samplingRate: number;
  maxBufferSize: number;
  flushIntervalMs: number;
  privacyMode: 'strict' | 'balanced' | 'minimal';
  anonymizeIds: boolean;
}

interface DwellTimeEntry {
  contentId: string;
  startTime: number;
  accumulated: number;
}

export class SignalCapture {
  private config: SignalCaptureConfig;
  private buffer: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private dwellTimes: Map<Element, DwellTimeEntry> = new Map();
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(config: Partial<SignalCaptureConfig> = {}) {
    this.config = {
      samplingRate: config.samplingRate ?? 1.0,
      maxBufferSize: config.maxBufferSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 30000,
      privacyMode: config.privacyMode ?? 'balanced',
      anonymizeIds: config.anonymizeIds ?? true
    };
    this.sessionId = this.generateSessionId();
  }

  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    this.setupDwellTimeTracking();
    this.attachGlobalListeners();
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.intersectionObserver?.disconnect();
    this.flush();
  }

  trackContentView(element: Element, contentId: string, metadata: Record<string, unknown> = {}): void {
    if (Math.random() > this.config.samplingRate) return;

    this.capture({
      type: 'content_view',
      platform: this.detectPlatform(),
      contentId: this.maskId(contentId),
      timestamp: Date.now(),
      data: this.filterMetadata(metadata),
      sessionId: this.sessionId
    });

    this.dwellTimes.set(element, { contentId: this.maskId(contentId), startTime: Date.now(), accumulated: 0 });
    this.intersectionObserver?.observe(element);
  }

  trackInteraction(type: 'like' | 'share' | 'save' | 'comment' | 'click', contentId: string, value?: number): void {
    this.capture({
      type: `interaction_${type}`,
      platform: this.detectPlatform(),
      contentId: this.maskId(contentId),
      timestamp: Date.now(),
      data: { value },
      sessionId: this.sessionId
    });
  }

  trackScoreAction(contentId: string, action: 'view_breakdown' | 'add_queue' | 'dismiss', score: number): void {
    this.capture({
      type: 'score_action',
      platform: this.detectPlatform(),
      contentId: this.maskId(contentId),
      timestamp: Date.now(),
      data: { action, score },
      sessionId: this.sessionId
    });
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  flush(): AnalyticsEvent[] {
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }

  private capture(event: AnalyticsEvent): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush();
    }
  }

  private setupDwellTimeTracking(): void {
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const dwell = this.dwellTimes.get(entry.target);
        if (!dwell) return;

        if (entry.isIntersecting) {
          dwell.startTime = Date.now();
        } else {
          dwell.accumulated += Date.now() - dwell.startTime;
        }
      });
    }, { threshold: 0.5 });
  }

  private attachGlobalListeners(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });

    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  private filterMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    if (this.config.privacyMode === 'strict') {
      return { platform: metadata.platform };
    }
    return metadata;
  }

  private maskId(id: string): string {
    if (!this.config.anonymizeIds) return id;
    return id.slice(0, 4) + '***' + id.slice(-4);
  }

  private detectPlatform(): string {
    const host = window.location.hostname;
    const map: Record<string, string> = {
      'twitter.com': 'twitter',
      'x.com': 'twitter',
      'instagram.com': 'instagram',
      'youtube.com': 'youtube',
      'tiktok.com': 'tiktok',
      'facebook.com': 'facebook',
      'linkedin.com': 'linkedin'
    };
    return map[host] || 'unknown';
  }

  private generateSessionId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
