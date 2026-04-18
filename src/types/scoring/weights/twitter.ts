import { PlatformWeights } from '../../interfaces/ContentTypes';

export const twitterWeights: PlatformWeights = {
  careerRelevance: 0.30,
  quality: 0.15,
  engagement: 0.25,
  authenticity: 0.15,
  growthPotential: 0.10,
  recency: 0.05
};

export const twitterDimensions = [
  'careerRelevance',
  'quality', 
  'engagement',
  'authenticity',
  'growthPotential',
  'recency'
];

export const twitterSpecifics = {
  engagementSignals: {
    retweetWeight: 3,
    replyWeight: 2,
    likeWeight: 1,
    quoteWeight: 2.5
  },
  qualitySignals: {
    threadBonus: 1.5,
    mediaBonus: 1.2,
    linkBonus: 0.8
  },
  careerKeywords: [
    'hiring', 'jobs', 'career', 'promoted', 'startup',
    'tech', 'remote', 'salary', 'interview', 'resume'
  ],
  viralityThresholds: {
    impressions: 10000,
    engagementRate: 0.05,
    followerRatio: 0.1
  }
};

export default twitterWeights;
