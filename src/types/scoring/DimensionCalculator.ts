import { PlatformAdapter } from '../interfaces/PlatformAdapter';
import { Content } from '../interfaces/ContentTypes';

export abstract class DimensionCalculator {
  abstract readonly name: string;
  abstract readonly version: string;
  protected platformOverrides = new Map<string, PlatformLogic>();

  abstract calculate(adapter: PlatformAdapter, content: Content): number;

  protected baseScore(content: Content): number {
    return 5;
  }

  registerPlatformOverride(platform: string, logic: PlatformLogic): void {
    this.platformOverrides.set(platform, logic);
  }

  protected getPlatformLogic(platform: string): PlatformLogic | undefined {
    return this.platformOverrides.get(platform);
  }

  protected normalize(value: number, min: number, max: number): number {
    return Math.max(0, Math.min(10, ((value - min) / (max - min)) * 10));
  }

  protected sigmoid(x: number): number {
    return 10 / (1 + Math.exp(-0.5 * (x - 5)));
  }
}

export interface PlatformLogic {
  adjustBaseScore(score: number, content: Content): number;
  getPlatformSignals(content: Content): Record<string, number>;
}

export class CareerRelevanceCalculator extends DimensionCalculator {
  readonly name = 'careerRelevance';
  readonly version = '1.0.0';

  calculate(adapter: PlatformAdapter, content: Content): number {
    const base = this.baseScore(content);
    const platformLogic = this.getPlatformLogic(adapter.platform);
    
    let score = base;
    const signals = this.extractSignals(content);
    
    score += signals.hasCareerKeywords ? 2 : 0;
    score += signals.hasIndustryTags ? 1.5 : 0;
    score += signals.authorIsInfluencer ? 1 : 0;
    score += Math.min(signals.engagementQuality * 2, 2);
    
    if (platformLogic) {
      score = platformLogic.adjustBaseScore(score, content);
    }
    
    return Math.round(this.normalize(score, 0, 15) * 10) / 10;
  }

  private extractSignals(content: Content): CareerSignals {
    const careerKeywords = ['career', 'jobs', 'hiring', 'promotion', 'salary', 'skills'];
    const industryTags = ['tech', 'marketing', 'finance', 'design', 'engineering'];
    
    return {
      hasCareerKeywords: careerKeywords.some(kw => content.text.toLowerCase().includes(kw)),
      hasIndustryTags: industryTags.some(tag => content.hashtags.includes(tag)),
      authorIsInfluencer: (content.author?.followerCount ?? 0) > 10000,
      engagementQuality: (content.metrics?.comments ?? 0) / Math.max(content.metrics?.likes ?? 1, 1)
    };
  }
}

export class QualityCalculator extends DimensionCalculator {
  readonly name = 'quality';
  readonly version = '1.0.0';

  calculate(adapter: PlatformAdapter, content: Content): number {
    let score = this.baseScore(content);
    const platformLogic = this.getPlatformLogic(adapter.platform);
    
    score += content.media.length > 0 ? 2 : 0;
    score += content.text.length > 100 ? 1 : 0;
    score += content.text.length < 500 ? 1 : -1;
    score += content.author?.isVerified ? 0.5 : 0;
    score += content.metrics?.saves ? 1 : 0;
    
    if (platformLogic) {
      score = platformLogic.adjustBaseScore(score, content);
    }
    
    return Math.round(this.normalize(score, 0, 15) * 10) / 10;
  }
}

export class EngagementCalculator extends DimensionCalculator {
  readonly name = 'engagement';
  readonly version = '1.0.0';

  calculate(adapter: PlatformAdapter, content: Content): number {
    const m = content.metrics;
    const engagementRate = m.engagementRate ?? 
      ((m.likes + m.comments * 2 + m.shares * 3) / Math.max(m.views ?? m.impressions ?? 1, 1));
    
    let score = this.sigmoid(engagementRate * 100);
    
    const platformLogic = this.getPlatformLogic(adapter.platform);
    if (platformLogic) {
      const signals = platformLogic.getPlatformSignals(content);
      score *= 1 + (signals.engagementMultiplier ?? 0);
    }
    
    return Math.round(Math.min(score, 10) * 10) / 10;
  }
}

interface CareerSignals {
  hasCareerKeywords: boolean;
  hasIndustryTags: boolean;
  authorIsInfluencer: boolean;
  engagementQuality: number;
}
