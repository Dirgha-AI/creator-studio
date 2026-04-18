import { PlatformAdapter } from '../interfaces/PlatformAdapter';
import { Content, Score, DimensionScores } from '../interfaces/ContentTypes';
import { DimensionCalculator } from './DimensionCalculator';

export interface ScoringEngineConfig {
  version: string;
  calculators: Map<string, DimensionCalculator>;
  minConfidence: number;
  cacheEnabled: boolean;
}

export class ScoringEngine {
  private config: ScoringEngineConfig;
  private cache = new Map<string, Score>();

  constructor(config?: Partial<ScoringEngineConfig>) {
    this.config = {
      version: '1.0.0',
      calculators: new Map(),
      minConfidence: 0.6,
      cacheEnabled: true,
      ...config
    };
  }

  registerCalculator(name: string, calculator: DimensionCalculator): void {
    this.config.calculators.set(name, calculator);
  }

  calculate(adapter: PlatformAdapter, content: Content): Score {
    const cacheKey = `${content.platform}:${content.id}`;
    
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.calculatedAt < 300000) {
        return cached;
      }
    }

    const weights = adapter.getDimensionWeights();
    const dimensions = this.calculateDimensions(adapter, content);
    const overall = this.aggregateScore(dimensions, weights);
    const confidence = this.calculateConfidence(dimensions, content);

    const score: Score = {
      contentId: content.id,
      overall: Math.round(overall * 10) / 10,
      dimensions,
      confidence: Math.round(confidence * 100) / 100,
      calculatedAt: Date.now(),
      version: this.config.version,
      explanation: this.generateExplanation(dimensions, weights)
    };

    if (this.config.cacheEnabled) {
      this.cache.set(cacheKey, score);
    }

    return score;
  }

  private calculateDimensions(adapter: PlatformAdapter, content: Content): DimensionScores {
    const dimensions: Partial<DimensionScores> = {};
    const dimNames = adapter.getScoringDimensions();

    for (const name of dimNames) {
      const calculator = this.config.calculators.get(name);
      if (calculator) {
        dimensions[name as keyof DimensionScores] = calculator.calculate(adapter, content);
      } else {
        dimensions[name as keyof DimensionScores] = this.defaultCalculation(name, content);
      }
    }

    return dimensions as DimensionScores;
  }

  private aggregateScore(dimensions: DimensionScores, weights: Record<string, number>): number {
    let total = 0;
    let weightSum = 0;

    for (const [dim, value] of Object.entries(dimensions)) {
      const weight = weights[dim] ?? 0.15;
      total += value * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? (total / weightSum) * 10 : 5;
  }

  private calculateConfidence(dimensions: DimensionScores, content: Content): number {
    const hasMetrics = content.metrics && Object.keys(content.metrics).length > 0;
    const hasAuthor = content.author && content.author.followerCount !== undefined;
    const dimCount = Object.values(dimensions).filter(v => v > 0).length;

    let confidence = 0.5;
    if (hasMetrics) confidence += 0.2;
    if (hasAuthor) confidence += 0.15;
    confidence += (dimCount / 6) * 0.15;

    return Math.min(confidence, 1);
  }

  private generateExplanation(dimensions: DimensionScores, weights: Record<string, number>): string {
    const topDim = Object.entries(dimensions)
      .sort((a, b) => (b[1] * (weights[b[0]] ?? 0.15)) - (a[1] * (weights[a[0]] ?? 0.15)))[0];
    
    return `High ${topDim[0]} (${Math.round(topDim[1] * 10) / 10}/10) drives this score.`;
  }

  private defaultCalculation(dimension: string, content: Content): number {
    const defaults: Record<string, number> = {
      careerRelevance: content.hashtags.some(h => ['career', 'jobs', 'hiring'].includes(h)) ? 7 : 5,
      quality: content.media.length > 0 ? 6 : 4,
      engagement: Math.min((content.metrics?.engagementRate ?? 0) * 100, 10) || 5,
      authenticity: content.author?.isVerified ? 6 : 5,
      growthPotential: content.metrics?.shares > content.metrics?.likes * 0.1 ? 7 : 5,
      recency: Math.max(0, 10 - (Date.now() - content.timestamp) / 86400000)
    };
    return defaults[dimension] ?? 5;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
