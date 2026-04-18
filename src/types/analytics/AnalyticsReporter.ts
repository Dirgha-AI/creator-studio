import { AnalyticsEvent } from '../interfaces/ContentTypes';

interface ReportPeriod {
  start: number;
  end: number;
}

interface PlatformStats {
  views: number;
  interactions: Record<string, number>;
  avgDwellTime: number;
  scoreActions: Record<string, number>;
  topContent: string[];
}

interface DailyReport {
  date: string;
  period: ReportPeriod;
  summary: {
    totalViews: number;
    totalInteractions: number;
    avgSessionDuration: number;
    queueAdditions: number;
  };
  byPlatform: Record<string, PlatformStats>;
  trends: TrendData[];
  insights: string[];
}

interface TrendData {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  change: number;
  confidence: number;
}

export class AnalyticsReporter {
  private events: AnalyticsEvent[] = [];

  ingest(events: AnalyticsEvent[]): void {
    this.events.push(...events);
    this.cleanup();
  }

  generateReport(period: ReportPeriod): DailyReport {
    const filtered = this.events.filter((e) => e.timestamp >= period.start && e.timestamp <= period.end);
    const byPlatform = this.aggregateByPlatform(filtered);

    return {
      date: new Date(period.start).toISOString().split('T')[0],
      period,
      summary: this.calculateSummary(filtered, byPlatform),
      byPlatform,
      trends: this.detectTrends(filtered, period),
      insights: this.generateInsights(byPlatform)
    };
  }

  generateWeeklyReport(endDate: Date = new Date()): DailyReport[] {
    const reports: DailyReport[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const start = new Date(date).setHours(0, 0, 0, 0);
      const end = new Date(date).setHours(23, 59, 59, 999);
      reports.push(this.generateReport({ start, end }));
    }
    return reports;
  }

  private aggregateByPlatform(events: AnalyticsEvent[]): Record<string, PlatformStats> {
    const stats: Record<string, PlatformStats> = {};

    for (const event of events) {
      const p = event.platform;
      if (!stats[p]) {
        stats[p] = { views: 0, interactions: {}, avgDwellTime: 0, scoreActions: {}, topContent: [] };
      }

      if (event.type === 'content_view') stats[p].views++;
      if (event.type.startsWith('interaction_')) {
        const type = event.type.replace('interaction_', '');
        stats[p].interactions[type] = (stats[p].interactions[type] || 0) + 1;
      }
      if (event.type === 'score_action') {
        const action = event.data.action as string;
        stats[p].scoreActions[action] = (stats[p].scoreActions[action] || 0) + 1;
      }
    }

    return stats;
  }

  private calculateSummary(events: AnalyticsEvent[], byPlatform: Record<string, PlatformStats>): DailyReport['summary'] {
    const views = events.filter((e) => e.type === 'content_view').length;
    const interactions = events.filter((e) => e.type.startsWith('interaction_')).length;
    const queueAdds = Object.values(byPlatform).reduce((sum, p) => sum + (p.scoreActions['add_queue'] || 0), 0);

    return {
      totalViews: views,
      totalInteractions: interactions,
      avgSessionDuration: this.calculateAvgSessionDuration(events),
      queueAdditions: queueAdds
    };
  }

  private calculateAvgSessionDuration(events: AnalyticsEvent[]): number {
    const bySession: Record<string, number[]> = {};
    for (const e of events) {
      if (!bySession[e.sessionId]) bySession[e.sessionId] = [];
      bySession[e.sessionId].push(e.timestamp);
    }

    let total = 0;
    let count = 0;
    for (const times of Object.values(bySession)) {
      if (times.length >= 2) {
        total += Math.max(...times) - Math.min(...times);
        count++;
      }
    }
    return count > 0 ? Math.round(total / count / 1000) : 0;
  }

  private detectTrends(events: AnalyticsEvent[], period: ReportPeriod): TrendData[] {
    const mid = (period.start + period.end) / 2;
    const first = events.filter((e) => e.timestamp < mid).length;
    const second = events.filter((e) => e.timestamp >= mid).length;
    const change = first > 0 ? ((second - first) / first) * 100 : 0;

    return [{
      metric: 'activity',
      direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
      change: Math.abs(change),
      confidence: Math.min(Math.abs(change) / 10, 1)
    }];
  }

  private generateInsights(byPlatform: Record<string, PlatformStats>): string[] {
    const insights: string[] = [];
    const platforms = Object.entries(byPlatform).sort((a, b) => b[1].views - a[1].views);
    
    if (platforms.length > 0) {
      insights.push(`Most active platform: ${platforms[0][0]} (${platforms[0][1].views} views)`);
    }

    const highEngagement = platforms.filter(([, s]) => Object.values(s.interactions).reduce((a, b) => a + b, 0) > s.views * 0.1);
    if (highEngagement.length > 0) {
      insights.push(`${highEngagement.length} platform(s) show above-average engagement`);
    }

    return insights;
  }

  private cleanup(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.events = this.events.filter((e) => e.timestamp > cutoff);
  }
}
