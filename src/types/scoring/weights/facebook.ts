import { PlatformWeights } from '../../interfaces/ContentTypes';

export const facebookWeights: PlatformWeights = {
  careerRelevance: 0.25,
  quality: 0.15,
  engagement: 0.20,
  authenticity: 0.20,
  growthPotential: 0.10,
  recency: 0.10
};

export const facebookDimensions = [
  'careerRelevance',
  'quality',
  'engagement',
  'authenticity',
  'growthPotential',
  'recency'
];

export const facebookSpecifics = {
  engagementSignals: {
    shareWeight: 3,
    reactionWeight: 1.5,
    commentWeight: 2,
    clickWeight: 2.5
  },
  qualitySignals: {
    linkPreviewBonus: 1.2,
    nativeVideoBonus: 1.4,
    liveVideoBonus: 1.5,
    groupPostBonus: 1.1
  },
  careerKeywords: [
    'hiring', 'jobs', 'career', 'business', 'opportunity',
    'network', 'professional', 'skills', 'training'
  ],
  viralityThresholds: {
    shares: 1000,
    reactions: 5000,
    comments: 500,
    reachRate: 0.3
  }
};

export default facebookWeights;
