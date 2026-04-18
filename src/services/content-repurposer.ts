import { Content } from '../interfaces/ContentTypes';

export interface RepurposedContent {
  platform: string;
  content: string;
  format: 'post' | 'story' | 'reel' | 'short' | 'thread' | 'article';
  suggestedHashtags: string[];
  optimalLength: { min: number; max: number };
  mediaAdjustments?: {
    cropRatio?: string;
    durationLimit?: number;
    textOverlay?: string;
  };
}

export class ContentRepurposer {
  private platformRules: Map<string, PlatformRules> = new Map();

  constructor() {
    this.initializeRules();
  }

  async repurpose(content: Content, targetPlatforms: string[]): Promise<RepurposedContent[]> {
    const results: RepurposedContent[] = [];

    for (const platform of targetPlatforms) {
      const rules = this.platformRules.get(platform);
      if (!rules) continue;

      const repurposed = await this.adaptForPlatform(content, platform, rules);
      results.push(repurposed);
    }

    return results;
  }

  private async adaptForPlatform(
    content: Content,
    platform: string,
    rules: PlatformRules
  ): Promise<RepurposedContent> {
    const text = this.adaptText(content.text, rules);
    const format = this.selectFormat(content, rules);
    const hashtags = this.generateHashtags(content, platform);

    return {
      platform,
      content: text,
      format,
      suggestedHashtags: hashtags,
      optimalLength: rules.lengthLimits[format],
      mediaAdjustments: this.calculateMediaAdjustments(content, platform)
    };
  }

  private adaptText(text: string, rules: PlatformRules): string {
    let adapted = text;
    
    if (rules.removeLinks) {
      adapted = adapted.replace(/https?:\/\/\S+/g, rules.linkReplacement || '');
    }
    
    if (rules.toneAdjustment) {
      adapted = this.adjustTone(adapted, rules.toneAdjustment);
    }

    return adapted.slice(0, rules.maxChars);
  }

  private selectFormat(content: Content, rules: PlatformRules): RepurposedContent['format'] {
    if (content.media.length === 0) return 'post';
    const video = content.media.find((m) => m.type === 'video');
    if (video) {
      return (video.duration ?? 0) > 60 ? rules.longVideoFormat : rules.shortVideoFormat;
    }
    return rules.preferredFormat;
  }

  private generateHashtags(content: Content, platform: string): string[] {
    const base = content.hashtags.slice(0, 5);
    const platformSpecific = this.getPlatformHashtags(platform);
    return [...new Set([...base, ...platformSpecific])].slice(0, 8);
  }

  private getPlatformHashtags(platform: string): string[] {
    const map: Record<string, string[]> = {
      linkedin: ['professional', 'careergrowth'],
      twitter: ['thread', 'thoughts'],
      instagram: ['instagood', 'contentcreator'],
      tiktok: ['fyp', 'viral'],
      youtube: ['youtubeshorts']
    };
    return map[platform] ?? [];
  }

  private calculateMediaAdjustments(content: Content, platform: string): RepurposedContent['mediaAdjustments'] {
    const ratios: Record<string, string> = {
      instagram: '4:5',
      tiktok: '9:16',
      youtube: '16:9',
      linkedin: '1.91:1'
    };

    return {
      cropRatio: ratios[platform],
      durationLimit: platform === 'tiktok' ? 60 : platform === 'youtube' ? 60 : undefined,
      textOverlay: platform === 'tiktok' ? 'Auto-generated caption' : undefined
    };
  }

  private adjustTone(text: string, tone: string): string {
    return text;
  }

  private initializeRules(): void {
    this.platformRules.set('twitter', {
      maxChars: 280,
      removeLinks: false,
      preferredFormat: 'post',
      shortVideoFormat: 'short',
      longVideoFormat: 'thread',
      lengthLimits: { post: { min: 50, max: 280 }, thread: { min: 200, max: 2500 } }
    });

    this.platformRules.set('linkedin', {
      maxChars: 3000,
      removeLinks: false,
      toneAdjustment: 'professional',
      preferredFormat: 'article',
      shortVideoFormat: 'post',
      longVideoFormat: 'article',
      lengthLimits: { post: { min: 100, max: 3000 }, article: { min: 500, max: 10000 } }
    });

    this.platformRules.set('instagram', {
      maxChars: 2200,
      removeLinks: true,
      linkReplacement: 'Link in bio',
      preferredFormat: 'story',
      shortVideoFormat: 'reel',
      longVideoFormat: 'post',
      lengthLimits: { post: { min: 0, max: 2200 }, story: { min: 0, max: 100 }, reel: { min: 0, max: 500 } }
    });
  }
}

interface PlatformRules {
  maxChars: number;
  removeLinks: boolean;
  linkReplacement?: string;
  toneAdjustment?: string;
  preferredFormat: RepurposedContent['format'];
  shortVideoFormat: RepurposedContent['format'];
  longVideoFormat: RepurposedContent['format'];
  lengthLimits: Record<string, { min: number; max: number }>;
}
