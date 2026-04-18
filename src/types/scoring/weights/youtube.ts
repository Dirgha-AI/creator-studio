import { PlatformWeights } from '../../interfaces/ContentTypes';

export const youtubeWeights: PlatformWeights = {
  careerRelevance: 0.20,
  quality: 0.30,
  engagement: 0.20,
  authenticity: 0.15,
  growthPotential: 0.10,
  recency: 0.05
};

export const youtubeDimensions = [
  'careerRelevance',
  'quality',
  'engagement',
  'authenticity', 
  'growthPotential',
  'recency'
];

export const youtubeSpecifics = {
  engagementSignals: {
    watchTimeWeight: 4,
    subscribeWeight: 3,
    commentWeight: 2,
    likeWeight: 1,
    shareWeight: 2.5
  },
  qualitySignals: {
    hdBonus: 1.5,
    durationOptimal: { min: 480, max: 1200 },
    thumbnailQuality: 1.2,
    descriptionCompleteness: 1.1
  },
  careerKeywords: [
    'tutorial', 'how to', 'course', 'learn', 'skills',
    'career', 'interview', 'resume', 'portfolio', 'tech'
  ],
  viralityThresholds: {
    views: 100000,
    ctr: 0.08,
    avgViewDuration: 0.5,
    subConversion: 0.02
  }
};

export default youtubeWeights;
