export interface Trend {
  id: string;
  name: string;
  category: string;
  platforms: string[];
  growthRate: number;
  volume: number;
  sentiment: number;
  peakTime: number;
  relatedHashtags: string[];
  keyInfluencers: string[];
  predictedDuration: number;
  confidence: number;
}

export interface CrossPlatformSignal {
  topic: string;
  platformBreakdown: Record<string, { volume: number; velocity: number }>;
  crossPlatformVelocity: number;
  emergingPlatforms: string[];
  saturationRisk: number;
}

export class TrendDetector {
  private trendHistory: Map<string, Trend[]> = new Map();
  private platformData: Map<string, PlatformMetrics> = new Map();

  constructor() {
    this.initializeHistory();
  }

  async detectTrends(platforms: string[], timeframe: 'hour' | 'day' | 'week'): Promise<Trend[]> {
    const trends: Trend[] = [];
    const signals = this.aggregateSignals(platforms, timeframe);

    for (const signal of signals) {
      if (this.isTrending(signal)) {
        const trend = await this.buildTrend(signal, platforms);
        trends.push(trend);
      }
    }

    return trends.sort((a, b) => b.growthRate - a.growthRate);
  }

  async detectCrossPlatformSignals(topic: string): Promise<CrossPlatformSignal> {
    const platforms = ['twitter', 'instagram', 'tiktok', 'youtube', 'linkedin'];
    const breakdown: Record<string, { volume: number; velocity: number }> = {};

    for (const platform of platforms) {
      const metrics = this.platformData.get(platform)?.topics.get(topic);
      breakdown[platform] = {
        volume: metrics?.volume ?? 0,
        velocity: metrics?.velocity ?? 0
      };
    }

    const velocities = Object.values(breakdown).map((b) => b.velocity);
    const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const maxVelocity = Math.max(...velocities);
    const emerging = platforms.filter((p) => breakdown[p].velocity > avgVelocity * 1.5);

    return {
      topic,
      platformBreakdown: breakdown,
      crossPlatformVelocity: maxVelocity,
      emergingPlatforms: emerging,
      saturationRisk: this.calculateSaturation(breakdown)
    };
  }

  async predictTrendEvolution(trendId: string): Promise<{
    trajectory: 'rising' | 'plateau' | 'declining';
    peakEstimate: number;
    nextMilestones: string[];
    relatedOpportunities: string[];
  }> {
    const history = this.trendHistory.get(trendId) ?? [];
    if (history.length < 3) {
      return { trajectory: 'rising', peakEstimate: 0, nextMilestones: [], relatedOpportunities: [] };
    }

    const recent = history.slice(-7);
    const velocity = this.calculateTrendVelocity(recent);
    const acceleration = this.calculateTrendAcceleration(recent);

    return {
      trajectory: acceleration > 0.2 ? 'rising' : acceleration < -0.1 ? 'declining' : 'plateau',
      peakEstimate: this.estimatePeak(recent, velocity, acceleration),
      nextMilestones: this.predictMilestones(recent),
      relatedOpportunities: this.findOpportunities(recent)
    };
  }

  async findEmergingNiches(platform: string, minGrowthRate: number = 50): Promise<Trend[]> {
    const all = await this.detectTrends([platform], 'day');
    return all.filter((t) => t.growthRate >= minGrowthRate && t.volume < 100000);
  }

  private aggregateSignals(platforms: string[], timeframe: string): TrendSignal[] {
    const signals: TrendSignal[] = [];
    const multiplier = timeframe === 'hour' ? 1 : timeframe === 'day' ? 24 : 168;

    for (const platform of platforms) {
      const data = this.platformData.get(platform);
      if (!data) continue;

      for (const [topic, metrics] of data.topics) {
        signals.push({
          topic,
          platform,
          volume: metrics.volume,
          velocity: metrics.velocity * multiplier,
          timestamp: Date.now()
        });
      }
    }

    return this.mergeCrossPlatformSignals(signals);
  }

  private mergeCrossPlatformSignals(signals: TrendSignal[]): TrendSignal[] {
    const merged = new Map<string, TrendSignal>();

    for (const signal of signals) {
      const key = signal.topic.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existing = merged.get(key);

      if (existing) {
        existing.volume += signal.volume;
        existing.velocity = Math.max(existing.velocity, signal.velocity);
      } else {
        merged.set(key, { ...signal });
      }
    }

    return Array.from(merged.values());
  }

  private isTrending(signal: TrendSignal): boolean {
    return signal.velocity > 100 && signal.volume > 1000;
  }

  private async buildTrend(signal: TrendSignal, platforms: string[]): Promise<Trend> {
    const related = this.findRelatedHashtags(signal.topic);
    const influencers = this.findKeyInfluencers(signal.topic, platforms);

    return {
      id: `trend-${signal.topic.replace(/\s+/g, '-')}`,
      name: this.formatTrendName(signal.topic),
      category: this.categorizeTrend(signal.topic),
      platforms,
      growthRate: Math.round(signal.velocity * 10) / 10,
      volume: signal.volume,
      sentiment: 0.6 + Math.random() * 0.3,
      peakTime: this.estimatePeakTime(signal),
      relatedHashtags: related,
      keyInfluencers: influencers,
      predictedDuration: this.estimateDuration(signal),
      confidence: 0.7
    };
  }

  private calculateSaturation(breakdown: Record<string, { volume: number }>): number {
    const volumes = Object.values(breakdown).map((b) => b.volume);
    const max = Math.max(...volumes);
    const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return max > avg * 5 ? 0.8 : max > avg * 2 ? 0.5 : 0.2;
  }

  private calculateTrendVelocity(history: Trend[]): number {
    if (history.length < 2) return 0;
    const first = history[0].growthRate;
    const last = history[history.length - 1].growthRate;
    return (last - first) / history.length;
  }

  private calculateTrendAcceleration(history: Trend[]): number {
    if (history.length < 3) return 0;
    const velocities: number[] = [];
    for (let i = 1; i < history.length; i++) {
      velocities.push(history[i].growthRate - history[i - 1].growthRate);
    }
    return (velocities[velocities.length - 1] - velocities[0]) / velocities.length;
  }

  private estimatePeak(history: Trend[], velocity: number, acceleration: number): number {
    const currentGrowth = history[history.length - 1].growthRate;
    const hoursToPeak = acceleration > 0 ? (100 - currentGrowth) / velocity : 0;
    return Math.round(Math.max(0, hoursToPeak));
  }

  private predictMilestones(history: Trend[]): string[] {
    const last = history[history.length - 1];
    const milestones: string[] = [];

    if (last.volume > 10000) milestones.push('10K mentions reached');
    if (last.growthRate > 500) milestones.push('500% growth velocity');
    milestones.push('Expected mainstream coverage in 24h');

    return milestones;
  }

  private findOpportunities(history: Trend[]): string[] {
    return ['Create related content now', 'Engage with top influencers', 'Join trending conversations'];
  }

  private findRelatedHashtags(topic: string): string[] {
    return [`#${topic.replace(/\s+/g, '')}`, `#${topic}Trend`, '#RelatedTopic'];
  }

  private findKeyInfluencers(topic: string, platforms: string[]): string[] {
    return platforms.map((p) => `@${p}Creator`);
  }

  private formatTrendName(topic: string): string {
    return topic.charAt(0).toUpperCase() + topic.slice(1);
  }

  private categorizeTrend(topic: string): string {
    const categories: Record<string, string[]> = {
      tech: ['ai', 'crypto', 'startup', 'app'],
      entertainment: ['meme', 'viral', 'challenge'],
      business: ['career', 'hiring', 'remote']
    };

    for (const [cat, keywords] of Object.entries(categories)) {
      if (keywords.some((k) => topic.includes(k))) return cat;
    }
    return 'general';
  }

  private estimatePeakTime(signal: TrendSignal): number {
    return Date.now() + 24 * 60 * 60 * 1000;
  }

  private estimateDuration(signal: TrendSignal): number {
    return signal.velocity > 1000 ? 48 : signal.velocity > 500 ? 72 : 120;
  }

  private initializeHistory(): void {
    this.platformData.set('twitter', {
      topics: new Map([
        ['ai', { volume: 500000, velocity: 150 }],
        ['startup', { volume: 200000, velocity: 80 }]
      ])
    });
  }
}

interface TrendSignal {
  topic: string;
  platform?: string;
  volume: number;
  velocity: number;
  timestamp?: number;
}

interface PlatformMetrics {
  topics: Map<string, { volume: number; velocity: number }>;
}
