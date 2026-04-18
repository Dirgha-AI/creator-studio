import { Content } from '../interfaces/ContentTypes';

export interface HashtagSet {
  primary: string[];
  secondary: string[];
  trending: string[];
  niche: string[];
  branded: string[];
  score: number;
  reachEstimate: { min: number; max: number };
  competitionLevel: 'low' | 'medium' | 'high';
}

export class HashtagGenerator {
  private platformTrends: Map<string, TrendingData> = new Map();
  private nicheDatabase: Map<string, string[]> = new Map();

  constructor() {
    this.initializeDatabases();
  }

  async generate(content: Content, platform: string, count: number = 10): Promise<HashtagSet> {
    const textFeatures = this.extractFeatures(content);
    const platformData: TrendingData = this.platformTrends.get(platform) ?? { trending: [], volumes: {}, growth: {}, updatedAt: 0 };

    const primary = this.selectPrimaryHashtags(textFeatures, platformData, Math.ceil(count * 0.3));
    const secondary = this.selectSecondaryHashtags(textFeatures, Math.ceil(count * 0.3));
    const trending = this.selectTrendingHashtags(platformData, Math.ceil(count * 0.2));
    const niche = this.selectNicheHashtags(textFeatures.industry, Math.ceil(count * 0.2));
    const branded = this.extractBrandedHashtags(content);

    const all = [...primary, ...secondary, ...trending, ...niche, ...branded];
    const score = this.calculateSetScore(all, platformData);

    return {
      primary,
      secondary,
      trending,
      niche,
      branded,
      score,
      reachEstimate: this.estimateReach(all, platformData),
      competitionLevel: this.assessCompetition(all, platformData)
    };
  }

  async optimize(existing: string[], platform: string, content: Content): Promise<{
    keep: string[];
    remove: string[];
    add: string[];
    improvedScore: number;
  }> {
    const generated = await this.generate(content, platform, existing.length);
    const allSuggested = [
      ...generated.primary,
      ...generated.secondary,
      ...generated.trending
    ];

    const keep = existing.filter((h) => allSuggested.includes(h));
    const remove = existing.filter((h) => !allSuggested.includes(h));
    const add = allSuggested.filter((h) => !existing.includes(h)).slice(0, 3);

    const newScore = this.calculateSetScore([...keep, ...add], this.platformTrends.get(platform)!);

    return { keep, remove, add, improvedScore: newScore };
  }

  async getTrending(platform: string, category?: string): Promise<{
    hashtags: Array<{ tag: string; posts: number; growth: number }>;
    updatedAt: number;
  }> {
    const data = this.platformTrends.get(platform);
    if (!data) return { hashtags: [], updatedAt: 0 };

    let trending = data.trending.map((t) => ({
      tag: t,
      posts: data.volumes[t] ?? 0,
      growth: data.growth[t] ?? 0
    }));

    if (category) {
      trending = trending.filter((t) => this.isInCategory(t.tag, category));
    }

    return { hashtags: trending.slice(0, 20), updatedAt: data.updatedAt };
  }

  private extractFeatures(content: Content): ContentFeatures {
    const text = content.text.toLowerCase();
    return {
      keywords: this.extractKeywords(text),
      entities: this.extractEntities(text),
      sentiment: this.analyzeSentiment(text),
      industry: this.detectIndustry(text, content.hashtags),
      contentType: content.type
    };
  }

  private extractKeywords(text: string): string[] {
    const common = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his'];
    return text.split(/\s+/)
      .filter((w) => w.length > 3 && !common.includes(w))
      .slice(0, 10);
  }

  private extractEntities(text: string): string[] {
    return [];
  }

  private analyzeSentiment(text: string): number {
    return 0.5;
  }

  private detectIndustry(text: string, hashtags: string[]): string {
    const industries: Record<string, string[]> = {
      tech: ['tech', 'software', 'ai', 'startup', 'coding', 'developer'],
      marketing: ['marketing', 'seo', 'brand', 'growth', 'ads'],
      design: ['design', 'ui', 'ux', 'creative', 'art'],
      finance: ['finance', 'crypto', 'investing', 'trading', 'money']
    };

    for (const [ind, keywords] of Object.entries(industries)) {
      if (keywords.some((k) => text.includes(k) || hashtags.includes(k))) {
        return ind;
      }
    }
    return 'general';
  }

  private selectPrimaryHashtags(features: ContentFeatures, data: TrendingData, count: number): string[] {
    const candidates = [...features.keywords, ...features.entities];
    return candidates.slice(0, count).map((k) => (k.startsWith('#') ? k : `#${k}`));
  }

  private selectSecondaryHashtags(features: ContentFeatures, count: number): string[] {
    const map: Record<string, string[]> = {
      tech: ['#technology', '#innovation', '#digital'],
      marketing: ['#marketingtips', '#socialmedia', '#contentstrategy'],
      design: ['#designinspiration', '#creative', '#visual'],
      general: ['#content', '#creator', '#community']
    };
    return map[features.industry] ?? map.general.slice(0, count);
  }

  private selectTrendingHashtags(data: TrendingData, count: number): string[] {
    return data.trending.slice(0, count);
  }

  private selectNicheHashtags(industry: string, count: number): string[] {
    const niche = this.nicheDatabase.get(industry) ?? [];
    return niche.slice(0, count);
  }

  private extractBrandedHashtags(content: Content): string[] {
    return content.hashtags.filter((h) => h.startsWith('@') || /^[A-Z]/.test(h));
  }

  private calculateSetScore(hashtags: string[], data: TrendingData): number {
    const volume = hashtags.reduce((sum, h) => sum + (data.volumes[h] ?? 1000), 0);
    const diversity = new Set(hashtags.map((h) => h.split(/[^a-zA-Z]/)[0])).size / hashtags.length;
    return Math.min((volume / 10000) * diversity * 10, 10);
  }

  private estimateReach(hashtags: string[], data: TrendingData): { min: number; max: number } {
    const avgVolume = hashtags.reduce((sum, h) => sum + (data.volumes[h] ?? 5000), 0) / hashtags.length;
    return { min: Math.round(avgVolume * 0.1), max: Math.round(avgVolume * 2) };
  }

  private assessCompetition(hashtags: string[], data: TrendingData): 'low' | 'medium' | 'high' {
    const avgVolume = hashtags.reduce((sum, h) => sum + (data.volumes[h] ?? 5000), 0) / hashtags.length;
    return avgVolume > 1000000 ? 'high' : avgVolume > 100000 ? 'medium' : 'low';
  }

  private isInCategory(tag: string, category: string): boolean {
    return tag.includes(category);
  }

  private initializeDatabases(): void {
    this.platformTrends.set('instagram', {
      trending: ['#reels', '#instagood', '#love', '#photooftheday', '#fashion'],
      volumes: { '#reels': 500000000, '#instagood': 600000000 },
      growth: { '#reels': 15, '#instagood': 5 },
      updatedAt: Date.now()
    });

    this.nicheDatabase.set('tech', ['#webdev', '#ai', '#machinelearning', '#codinglife']);
    this.nicheDatabase.set('marketing', ['#digitalmarketing', '#seo', '#growthhacking']);
  }
}

interface ContentFeatures {
  keywords: string[];
  entities: string[];
  sentiment: number;
  industry: string;
  contentType: string;
}

interface TrendingData {
  trending: string[];
  volumes: Record<string, number>;
  growth: Record<string, number>;
  updatedAt: number;
}
