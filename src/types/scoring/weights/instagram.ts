import { PlatformWeights } from '../../interfaces/ContentTypes';

export const instagramWeights: PlatformWeights = {
  careerRelevance: 0.20,
  quality: 0.30,
  engagement: 0.25,
  authenticity: 0.10,
  growthPotential: 0.10,
  recency: 0.05
};

export const instagramDimensions = [
  'careerRelevance',
  'quality',
  'engagement', 
  'authenticity',
  'growthPotential',
  'recency'
];

export const instagramSpecifics = {
  engagementSignals: {
    saveWeight: 3,
    shareWeight: 2.5,
    commentWeight: 2,
    likeWeight: 1,
    storyReplyWeight: 1.5
  },
  qualitySignals: {
    carouselBonus: 1.3,
    reelBonus: 1.4,
    videoBonus: 1.2,
    captionLengthBonus: 0.8,
    hashtagOptimization: 1.1
  },
  careerKeywords: [
    'hiring', 'jobs', 'career', 'portfolio', 'design',
    'creative', 'freelance', 'agency', 'brand', 'art'
  ],
  viralityThresholds: {
    likes: 10000,
    saves: 1000,
    reach: 50000,
    shares: 500
  }
};

export default instagramWeights;
