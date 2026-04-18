import { PlatformWeights } from '../../interfaces/ContentTypes';

export const linkedinWeights: PlatformWeights = {
  careerRelevance: 0.35,
  quality: 0.20,
  engagement: 0.20,
  authenticity: 0.15,
  growthPotential: 0.05,
  recency: 0.05
};

export const linkedinDimensions = [
  'careerRelevance',
  'quality',
  'engagement',
  'authenticity',
  'growthPotential',
  'recency'
];

export const linkedinSpecifics = {
  engagementSignals: {
    commentWeight: 3,
    shareWeight: 2.5,
    reactionWeight: 1,
    clickWeight: 2,
    impressionToEngagement: 2
  },
  qualitySignals: {
    articleBonus: 1.5,
    newsletterBonus: 1.4,
    carouselBonus: 1.3,
    nativeDocumentBonus: 1.2
  },
  careerKeywords: [
    'hiring', 'jobs', 'career', 'promotion', 'leadership',
    'skills', 'industry', 'professional', 'growth', 'opportunity'
  ],
  viralityThresholds: {
    impressions: 10000,
    engagementRate: 0.06,
    socialSellingIndex: 70,
    connectionGrowth: 0.1
  }
};

export default linkedinWeights;
