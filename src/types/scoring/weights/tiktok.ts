import { PlatformWeights } from '../../interfaces/ContentTypes';

export const tiktokWeights: PlatformWeights = {
  careerRelevance: 0.15,
  quality: 0.20,
  engagement: 0.30,
  authenticity: 0.15,
  growthPotential: 0.15,
  recency: 0.05
};

export const tiktokDimensions = [
  'careerRelevance',
  'quality',
  'engagement',
  'authenticity',
  'growthPotential',
  'recency'
];

export const tiktokSpecifics = {
  engagementSignals: {
    completionRateWeight: 4,
    shareWeight: 3,
    commentWeight: 2.5,
    likeWeight: 1,
    followWeight: 2
  },
  qualitySignals: {
    trendAudioBonus: 1.4,
    effectBonus: 1.2,
    stitchBonus: 1.3,
    optimalDuration: { min: 15, max: 60 }
  },
  careerKeywords: [
    'day in my life', 'career', 'job', 'work', 'office',
    'hiring', 'salary', 'interview', 'tips', 'advice'
  ],
  viralityThresholds: {
    views: 100000,
    completionRate: 0.8,
    fypRate: 0.5,
    shareVelocity: 100
  }
};

export default tiktokWeights;
