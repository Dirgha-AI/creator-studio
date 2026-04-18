interface TimeSlot {
  hour: number;
  day: number;
  score: number;
  engagementPrediction: number;
  competitionLevel: 'low' | 'medium' | 'high';
}

interface OptimalWindow {
  platform: string;
  slots: TimeSlot[];
  timezone: string;
  explanation: string;
}

interface HistoricalData {
  posts: Array<{
    timestamp: number;
    engagement: number;
    reach: number;
  }>;
  audienceActiveHours: number[];
  competitorPostTimes: number[];
}

export class TimingOptimizer {
  private platformPatterns: Map<string, EngagementPattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  async findOptimalWindows(
    platform: string,
    contentType: string,
    audienceTimezone: string,
    history?: HistoricalData
  ): Promise<OptimalWindow> {
    const pattern = this.platformPatterns.get(platform);
    if (!pattern) {
      return this.getDefaultWindow(platform, audienceTimezone);
    }

    const slots = this.calculateTimeSlots(pattern, audienceTimezone, history);
    const ranked = this.rankSlots(slots, contentType, history);

    return {
      platform,
      slots: ranked.slice(0, 5),
      timezone: audienceTimezone,
      explanation: this.generateExplanation(ranked[0], pattern)
    };
  }

  async predictEngagement(
    platform: string,
    proposedTime: Date,
    contentMetrics: Record<string, number>
  ): Promise<{ expectedEngagement: number; confidence: number }> {
    const pattern = this.platformPatterns.get(platform);
    if (!pattern) return { expectedEngagement: 0, confidence: 0 };

    const hour = proposedTime.getHours();
    const day = proposedTime.getDay();

    const baseEngagement = pattern.hourlyWeights[hour] * pattern.dailyWeights[day];
    const contentFactor = this.calculateContentFactor(contentMetrics);
    const competitionFactor = 1 - (pattern.competitionByHour[hour] / 100);

    const expected = baseEngagement * contentFactor * competitionFactor;
    const confidence = this.calculateConfidence(pattern, hour, day);

    return { expectedEngagement: Math.round(expected * 100) / 100, confidence };
  }

  private calculateTimeSlots(
    pattern: EngagementPattern,
    timezone: string,
    history?: HistoricalData
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let score = pattern.hourlyWeights[hour] * pattern.dailyWeights[day];

        if (history) {
          score = this.adjustForHistory(score, day, hour, history);
        }

        const competition = pattern.competitionByHour[hour];
        slots.push({
          hour,
          day,
          score: Math.round(score * 100) / 100,
          engagementPrediction: Math.round(score * 10),
          competitionLevel: competition > 70 ? 'high' : competition > 40 ? 'medium' : 'low'
        });
      }
    }

    return slots;
  }

  private rankSlots(slots: TimeSlot[], contentType: string, history?: HistoricalData): TimeSlot[] {
    return slots
      .map((slot) => ({
        ...slot,
        score: slot.score * this.getContentTypeMultiplier(contentType)
      }))
      .sort((a, b) => b.score - a.score);
  }

  private getContentTypeMultiplier(type: string): number {
    const multipliers: Record<string, number> = {
      video: 1.2,
      carousel: 1.15,
      story: 0.9,
      text: 1.0,
      reel: 1.25,
      short: 1.2
    };
    return multipliers[type] ?? 1.0;
  }

  private adjustForHistory(
    score: number,
    day: number,
    hour: number,
    history: HistoricalData
  ): number {
    const dayHistory = history.posts.filter((p) => {
      const d = new Date(p.timestamp);
      return d.getDay() === day && d.getHours() === hour;
    });

    if (dayHistory.length > 0) {
      const avgEngagement = dayHistory.reduce((s, p) => s + p.engagement, 0) / dayHistory.length;
      score *= (1 + avgEngagement / 100);
    }

    return score;
  }

  private calculateContentFactor(metrics: Record<string, number>): number {
    const quality = metrics.qualityScore ?? 5;
    const relevance = metrics.audienceRelevance ?? 5;
    return 1 + ((quality + relevance) / 20 - 0.5);
  }

  private calculateConfidence(pattern: EngagementPattern, hour: number, day: number): number {
    return (pattern.hourlyWeights[hour] + pattern.dailyWeights[day]) / 20;
  }

  private generateExplanation(slot: TimeSlot, pattern: EngagementPattern): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `Best time: ${days[slot.day]} ${slot.hour}:00 - Low competition (${slot.competitionLevel}) with predicted ${slot.engagementPrediction}% engagement`;
  }

  private getDefaultWindow(platform: string, timezone: string): OptimalWindow {
    return {
      platform,
      slots: [{ hour: 9, day: 2, score: 7, engagementPrediction: 5, competitionLevel: 'medium' }],
      timezone,
      explanation: 'Default recommendation - insufficient platform data'
    };
  }

  private initializePatterns(): void {
    this.platformPatterns.set('instagram', {
      hourlyWeights: [2,1,1,1,2,3,5,7,8,7,6,7,8,7,6,7,8,9,9,8,7,6,4,3],
      dailyWeights: [6,7,7.5,8,7.5,7,8],
      competitionByHour: [10,5,3,2,5,15,30,45,55,60,55,50,45,50,55,60,65,70,75,70,60,50,30,20]
    });

    this.platformPatterns.set('twitter', {
      hourlyWeights: [3,2,2,2,3,5,7,8,9,9,8,8,8,8,8,8,8,8,9,9,8,7,5,4],
      dailyWeights: [6,7,8,8.5,8,7.5,6.5],
      competitionByHour: [20,15,10,8,10,20,40,55,65,70,65,60,55,60,65,70,75,80,75,70,60,45,35,30]
    });

    this.platformPatterns.set('linkedin', {
      hourlyWeights: [1,1,1,1,2,4,6,8,9,9,8,7,7,6,6,7,7,6,5,4,3,2,2,1],
      dailyWeights: [7,8.5,8,7.5,7,6,5],
      competitionByHour: [5,3,2,2,5,20,50,70,80,75,60,50,45,50,55,50,40,30,20,15,10,8,5,5]
    });
  }
}

interface EngagementPattern {
  hourlyWeights: number[];
  dailyWeights: number[];
  competitionByHour: number[];
}
