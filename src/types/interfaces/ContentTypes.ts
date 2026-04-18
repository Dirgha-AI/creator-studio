export interface Content {
  id: string;
  platform: string;
  type: 'post' | 'video' | 'image' | 'article' | 'story' | 'reel' | 'short';
  url: string;
  text: string;
  media: MediaItem[];
  timestamp: number;
  authorId: string;
  author: Author;
  metrics: ContentMetrics;
  hashtags: string[];
  mentions: string[];
  extractedAt: number;
  metadata: Record<string, unknown>;
}

export interface MediaItem {
  type: 'image' | 'video' | 'gif' | 'audio';
  url: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface Author {
  id: string;
  platform: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  followerCount?: number;
  isVerified: boolean;
  isFollowing?: boolean;
  bio?: string;
  externalLinks?: string[];
}

export interface ContentMetrics {
  likes: number;
  comments: number;
  shares: number;
  views?: number;
  saves?: number;
  clicks?: number;
  impressions?: number;
  engagementRate?: number;
}

export interface Score {
  contentId: string;
  overall: number;
  dimensions: DimensionScores;
  confidence: number;
  calculatedAt: number;
  version: string;
  explanation?: string;
}

export interface DimensionScores {
  careerRelevance: number;
  quality: number;
  engagement: number;
  authenticity: number;
  growthPotential: number;
  recency: number;
}

export interface QueueItem {
  id: string;
  content: Content;
  score: Score;
  addedAt: number;
  priority: number;
  status: 'pending' | 'synced' | 'error' | 'archived';
  notes?: string;
  tags: string[];
  syncedAt?: number;
  errorMessage?: string;
}

export interface BadgePosition {
  type: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'inline';
  offset?: { x: number; y: number };
}

export interface SidepanelConfig {
  title: string;
  width?: number;
  position?: 'left' | 'right';
  theme?: 'light' | 'dark' | 'auto';
  initialTab?: string;
  onClose?: () => void;
}

export interface PlatformWeights {
  careerRelevance: number;
  quality: number;
  engagement: number;
  authenticity: number;
  growthPotential: number;
  recency: number;
}

export type ContentFilter = {
  platforms?: string[];
  minScore?: number;
  maxScore?: number;
  dateRange?: { from: number; to: number };
  tags?: string[];
  status?: QueueItem['status'][];
  searchQuery?: string;
};

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface AnalyticsEvent {
  type: string;
  platform: string;
  contentId?: string;
  timestamp: number;
  data: Record<string, unknown>;
  sessionId: string;
}
