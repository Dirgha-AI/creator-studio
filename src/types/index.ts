// Interfaces
export {
  PlatformAdapter,
  BasePlatformAdapter
} from './interfaces/PlatformAdapter';

export type {
  Content,
  MediaItem,
  Author,
  ContentMetrics,
  Score,
  DimensionScores,
  QueueItem,
  BadgePosition,
  SidepanelConfig,
  PlatformWeights,
  ContentFilter,
  SyncStatus,
  AnalyticsEvent
} from './interfaces/ContentTypes';

// Scoring
export { ScoringEngine, ScoringEngineConfig } from './scoring/ScoringEngine';
export {
  DimensionCalculator,
  CareerRelevanceCalculator,
  QualityCalculator,
  EngagementCalculator,
  PlatformLogic
} from './scoring/DimensionCalculator';

// Weights
export { twitterWeights } from './scoring/weights/twitter';
export { instagramWeights } from './scoring/weights/instagram';
export { youtubeWeights } from './scoring/weights/youtube';
export { tiktokWeights } from './scoring/weights/tiktok';
export { facebookWeights } from './scoring/weights/facebook';
export { linkedinWeights } from './scoring/weights/linkedin';

// Extraction
export { DOMObserver, detectPlatform } from './extraction/DOMObserver';
export { ContentCache, globalCache } from './extraction/ContentCache';

// Queue
export { QueueManager } from './queue/QueueManager';
export { SyncEngine } from './queue/SyncEngine';
export {
  StorageAdapter,
  LocalStorageAdapter,
  ChromeStorageAdapter,
  IndexedDBAdapter
} from './queue/StorageAdapter';

// Analytics
export { SignalCapture } from './analytics/SignalCapture';
export { AnalyticsReporter } from './analytics/AnalyticsReporter';

// Version
export const VERSION = '1.0.0';
export const PACKAGE_NAME = '@dirgha-ai/creator-os-core';
