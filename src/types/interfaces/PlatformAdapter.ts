import { Content, Author, Score, BadgePosition, SidepanelConfig } from './ContentTypes';

export interface PlatformAdapter {
  readonly platform: string;
  readonly version: string;

  detect(): boolean;

  extractContent(element: Element): Content | null;
  extractAuthor(element: Element): Author | null;
  extractMetrics(element: Element): Record<string, number>;

  getScoringDimensions(): string[];
  getDimensionWeights(): Record<string, number>;

  injectBadge(content: Content, score: Score, position: BadgePosition): Element | null;
  removeBadge(contentId: string): void;

  createSidepanel(config: SidepanelConfig): Element | null;
  updateSidepanel(element: Element, data: unknown): void;
  destroySidepanel(element: Element): void;

  getContentSelector(): string;
  getFeedContainer(): Element | null;

  onContentAdded(callback: (element: Element) => void): () => void;
  onContentRemoved(callback: (contentId: string) => void): () => void;

  getPlatformSpecificData(element: Element): Record<string, unknown>;
}

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: string;
  abstract readonly version: string;

  abstract detect(): boolean;
  abstract extractContent(element: Element): Content | null;
  abstract extractAuthor(element: Element): Author | null;
  abstract extractMetrics(element: Element): Record<string, number>;

  abstract getContentSelector(): string;
  abstract getFeedContainer(): Element | null;

  abstract injectBadge(content: Content, score: Score, position: BadgePosition): Element | null;
  abstract removeBadge(contentId: string): void;

  abstract createSidepanel(config: SidepanelConfig): Element | null;
  abstract updateSidepanel(element: Element, data: unknown): void;
  abstract destroySidepanel(element: Element): void;

  getScoringDimensions(): string[] {
    return ['careerRelevance', 'quality', 'engagement', 'authenticity', 'growthPotential', 'recency'];
  }

  getDimensionWeights(): Record<string, number> {
    return {
      careerRelevance: 0.25,
      quality: 0.20,
      engagement: 0.20,
      authenticity: 0.15,
      growthPotential: 0.10,
      recency: 0.10
    };
  }

  onContentAdded(callback: (element: Element) => void): () => void {
    const container = this.getFeedContainer();
    if (!container) return () => {};

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node instanceof Element && node.matches(this.getContentSelector())) {
            callback(node);
          }
        });
      });
    });

    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  onContentRemoved(callback: (contentId: string) => void): () => void {
    return () => {};
  }

  getPlatformSpecificData(_element: Element): Record<string, unknown> {
    return {};
  }
}
