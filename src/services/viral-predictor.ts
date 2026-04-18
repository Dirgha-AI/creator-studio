import { Content } from '../interfaces/ContentTypes';

export interface ViralPrediction {
  viralProbability: number;
  confidence: number;
  predictedPeakTime: number;
  estimatedReach: { min: number; max: number };
  keyFactors: FactorScore[];
  similarViralExamples: string[];
  recommendations: string[];
}

interface FactorScore {
  factor: string;
  score: number;
  weight: number;
  description: string;
}

interface ViralSignal {
  earlyEngagementVelocity: number;
  shareRatio: number;
  commentSentiment: number;
  savesPerView: number;
  crossPlatformMentions: number;
}

export class ViralPredictor {
  private platformThresholds: Map<string, ViralThresholds> = new Map();
  private viralExamples: Map<string, ViralExample[]> = new Map();

  constructor() {
    this.initializeThresholds();
  }

  async predict(content: Content, currentMetrics?: Partial<ViralSignal>): Promise<ViralPrediction> {
    const thresholds = this.platformThresholds.get(content.platform);
    if (!thresholds) {
      return this.createDefaultPrediction();
    }

    const signals = this.extractSignals(content, currentMetrics);
    const factors = this.calculateFactors(content, signals, thresholds);
    const probability = this.calculateProbability(factors);

    return {
      viralProbability: Math.round(probability * 100) / 100,
      confidence: this.calculateConfidence(factors, currentMetrics),
      predictedPeakTime: this.predictPeakTime(content, probability),
      estimatedReach: this.estimateReach(content, probability),
      keyFactors: factors,
      similarViralExamples: this.findSimilarExamples(content),
      recommendations: this.generateRecommendations(factors, content.platform)
    };
  }

  async analyzeTrend(content: Content, timeSeries: number[]): Promise<{
    isAccelerating: boolean;
    inflectionPoint: number | null;
    decayRisk: number;
  }> {
    if (timeSeries.length < 3) {
      return { isAccelerating: false, inflectionPoint: null, decayRisk: 0 };
    }

    const velocity = this.calculateVelocity(timeSeries);
    const acceleration = this.calculateAcceleration(velocity);
    const inflection = this.findInflectionPoint(timeSeries);

    return {
      isAccelerating: acceleration > 0.1,
      inflectionPoint: inflection,
      decayRisk: this.calculateDecayRisk(timeSeries, velocity)
    };
  }

  private extractSignals(content: Content, metrics?: Partial<ViralSignal>): ViralSignal {
    const m = content.metrics;
    return {
      earlyEngagementVelocity: metrics?.earlyEngagementVelocity ?? this.calculateVelocity([m.likes, m.comments, m.shares]),
      shareRatio: metrics?.shareRatio ?? (m.shares / Math.max(m.likes, 1)),
      commentSentiment: metrics?.commentSentiment ?? 0.6,
      savesPerView: metrics?.savesPerView ?? ((m.saves ?? 0) / Math.max(m.views ?? 1, 1)),
      crossPlatformMentions: metrics?.crossPlatformMentions ?? 0
    };
  }

  private calculateFactors(content: Content, signals: ViralSignal, thresholds: ViralThresholds): FactorScore[] {
    return [
      {
        factor: 'Engagement Velocity',
        score: Math.min(signals.earlyEngagementVelocity / thresholds.velocityThreshold * 10, 10),
        weight: 0.25,
        description: 'Rate of early engagement vs. viral baseline'
      },
      {
        factor: 'Share Ratio',
        score: Math.min(signals.shareRatio / thresholds.shareRatioThreshold * 10, 10),
        weight: 0.20,
        description: 'Shares per like - indicates spreadability'
      },
      {
        factor: 'Save Rate',
        score: Math.min(signals.savesPerView / thresholds.savesThreshold * 1000, 10),
        weight: 0.15,
        description: 'Content value indicator from saves'
      },
      {
        factor: 'Content Quality',
        score: content.media.length > 0 ? 7 : 5,
        weight: 0.15,
        description: 'Visual/audio elements present'
      },
      {
        factor: 'Hashtag Optimization',
        score: Math.min(content.hashtags.length / 5 * 5, 10),
        weight: 0.10,
        description: 'Hashtag strategy effectiveness'
      },
      {
        factor: 'Cross-Platform Potential',
        score: Math.min(signals.crossPlatformMentions / thresholds.mentionThreshold * 10, 10),
        weight: 0.15,
        description: 'Mentions across other platforms'
      }
    ];
  }

  private calculateProbability(factors: FactorScore[]): number {
    const weightedSum = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const baseProbability = (weightedSum / totalWeight) / 10;
    return Math.min(Math.pow(baseProbability, 1.5), 0.99);
  }

  private calculateConfidence(factors: FactorScore[], metrics?: Partial<ViralSignal>): number {
    const hasMetrics = metrics !== undefined;
    const dataCompleteness = factors.filter((f) => f.score > 0).length / factors.length;
    return Math.round((hasMetrics ? 0.7 : 0.4 + dataCompleteness * 0.3) * 100) / 100;
  }

  private predictPeakTime(content: Content, probability: number): number {
    const baseTime = content.platform === 'tiktok' ? 24 : 48;
    return Math.round(baseTime * (1 + (1 - probability)));
  }

  private estimateReach(content: Content, probability: number): { min: number; max: number } {
    const followers = content.author?.followerCount ?? 1000;
    const multiplier = content.platform === 'tiktok' ? 50 : content.platform === 'twitter' ? 10 : 5;
    const min = Math.round(followers * multiplier * probability);
    const max = Math.round(followers * multiplier * 5 * probability);
    return { min, max };
  }

  private findSimilarExamples(content: Content): string[] {
    return ['Similar viral content example 1', 'Similar viral content example 2'];
  }

  private generateRecommendations(factors: FactorScore[], platform: string): string[] {
    const recs: string[] = [];
    const weakest = factors.sort((a, b) => a.score - b.score)[0];
    
    if (weakest.factor === 'Share Ratio') {
      recs.push('Add a clear call-to-action to encourage sharing');
    }
    if (weakest.factor === 'Engagement Velocity') {
      recs.push('Post during your audience\'s peak active hours');
    }
    if (platform === 'tiktok' || platform === 'instagram') {
      recs.push('Use trending audio to boost discoverability');
    }
    
    return recs;
  }

  private calculateVelocity(values: number[]): number {
    if (values.length < 2) return 0;
    return values[values.length - 1] - values[0];
  }

  private calculateAcceleration(velocity: number): number {
    return velocity > 0 ? velocity / 100 : 0;
  }

  private findInflectionPoint(values: number[]): number | null {
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
        return i;
      }
    }
    return null;
  }

  private calculateDecayRisk(values: number[], velocity: number): number {
    if (velocity < 0 && values.length > 3) {
      return Math.min(Math.abs(velocity) / values[values.length - 1], 1);
    }
    return 0;
  }

  private createDefaultPrediction(): ViralPrediction {
    return {
      viralProbability: 0.3,
      confidence: 0.3,
      predictedPeakTime: 48,
      estimatedReach: { min: 1000, max: 5000 },
      keyFactors: [],
      similarViralExamples: [],
      recommendations: ['Collect more data for accurate prediction']
    };
  }

  private initializeThresholds(): void {
    this.platformThresholds.set('tiktok', {
      velocityThreshold: 1000,
      shareRatioThreshold: 0.15,
      savesThreshold: 0.05,
      mentionThreshold: 50
    });
    this.platformThresholds.set('instagram', {
      velocityThreshold: 500,
      shareRatioThreshold: 0.1,
      savesThreshold: 0.03,
      mentionThreshold: 30
    });
    this.platformThresholds.set('twitter', {
      velocityThreshold: 200,
      shareRatioThreshold: 0.2,
      savesThreshold: 0.01,
      mentionThreshold: 100
    });
  }
}

interface ViralThresholds {
  velocityThreshold: number;
  shareRatioThreshold: number;
  savesThreshold: number;
  mentionThreshold: number;
}

interface ViralExample {
  contentId: string;
  similarityScore: number;
  viralReach: number;
}
