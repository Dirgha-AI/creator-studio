/**
 * Creator Commerce: Creator Marketplace & Discovery (CC-3)
 * Discovery and matching of creators with brands
 * 
 * Features:
 * - Creator profile management
 * - Creator discovery/search for brands
 * - Portfolio management
 * - Performance tracking
 * - Creator tiers and verification
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';

const router = new Hono();

// Profile update schema
const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100),
  bio: z.string().min(50).max(1000),
  avatar: z.string().url().optional(),
  location: z.string().optional(),
  languages: z.array(z.string()).max(5),
  categories: z.array(z.string()).max(5),
  platforms: z.array(z.object({
    name: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin', 'blog']),
    handle: z.string(),
    followerCount: z.number().min(0),
    engagementRate: z.number().min(0).max(100),
    avgViews: z.number().optional(),
    verified: z.boolean().default(false),
    url: z.string().url()
  })).min(1),
  pricing: z.object({
    postRate: z.number().optional(),
    storyRate: z.number().optional(),
    videoRate: z.number().optional(),
    reelRate: z.number().optional(),
    currency: z.string().default('USD')
  }).optional(),
  contentTypes: z.array(z.enum(['video', 'photo', 'story', 'reel', 'post', 'article', 'review'])),
  audienceDemographics: z.object({
    ageRange: z.string().optional(),
    topLocations: z.array(z.string()).optional(),
    genderSplit: z.object({
      male: z.number(),
      female: z.number(),
      other: z.number()
    }).optional(),
    interests: z.array(z.string()).optional()
  }).optional(),
  collaborationPreferences: z.object({
    minFollowerRequirement: z.number().optional(),
    preferredCompensation: z.enum(['product_only', 'fixed_fee', 'performance_based', 'hybrid']),
    contentRights: z.enum(['usage_rights', 'full_rights', 'no_rights']),
    exclusivity: z.enum(['exclusive', 'semi_exclusive', 'non_exclusive'])
  })
});

const searchCreatorsSchema = z.object({
  minFollowers: z.number().min(0).optional(),
  maxFollowers: z.number().min(0).optional(),
  platforms: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  location: z.string().optional(),
  engagementRateMin: z.number().min(0).max(100).optional(),
  verifiedOnly: z.boolean().default(false),
  availableOnly: z.boolean().default(false),
  sortBy: z.enum(['relevance', 'followers', 'engagement', 'completed_collabs', 'rating']).default('relevance')
});

/**
 * Get or create creator profile
 * GET /api/creator-commerce/creator/profile
 */
router.get('/profile', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  
  try {
    const result = await neonQuery(`
      SELECT * FROM cc_creator_profiles WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      // Return empty profile structure
      return c.json({
        profile: null,
        isComplete: false,
        message: 'Profile not found. Create one to start collaborating.'
      });
    }

    const profile = result.rows[0];
    
    // Get collaboration stats
    const statsResult = await neonQuery(`
      SELECT 
        COUNT(DISTINCT ca.id) as total_applications,
        COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'approved') as approved_collabs,
        COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'approved' AND cd.status = 'published') as completed_deliverables,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as review_count
      FROM cc_creator_profiles cp
      LEFT JOIN cc_campaign_applications ca ON cp.user_id = ca.creator_id
      LEFT JOIN cc_campaign_deliverables cd ON ca.id = cd.application_id
      LEFT JOIN cc_reviews r ON cp.user_id = r.creator_id AND r.status = 'approved'
      WHERE cp.user_id = $1
      GROUP BY cp.id
    `, [userId]);

    return c.json({
      profile,
      stats: statsResult.rows[0] || {
        total_applications: 0,
        approved_collabs: 0,
        completed_deliverables: 0,
        avg_rating: 0,
        review_count: 0
      },
      isComplete: true
    });

  } catch (error) {
    console.error('[Creator Profile] Error:', error);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

/**
 * Update or create creator profile
 * POST /api/creator-commerce/creator/profile
 */
router.post('/profile', authMiddleware, zValidator('json', updateProfileSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const body = c.req.valid('json');
  
  try {
    // Calculate tier based on total followers
    const totalFollowers = body.platforms.reduce((sum, p) => sum + p.followerCount, 0);
    let tier = 'bronze';
    if (totalFollowers >= 1000000) tier = 'platinum';
    else if (totalFollowers >= 500000) tier = 'gold';
    else if (totalFollowers >= 100000) tier = 'silver';

    // Check if profile exists
    const existing = await neonQuery(`
      SELECT id FROM cc_creator_profiles WHERE user_id = $1
    `, [userId]);

    if (existing.rows.length > 0) {
      // Update
      await neonQuery(`
        UPDATE cc_creator_profiles SET
          display_name = $2,
          bio = $3,
          avatar = $4,
          location = $5,
          languages = $6,
          categories = $7,
          platforms = $8,
          pricing = $9,
          content_types = $10,
          audience_demographics = $11,
          collaboration_preferences = $12,
          follower_count = $13,
          tier = $14,
          is_available = true,
          updated_at = NOW()
        WHERE user_id = $1
      `, [
        userId,
        body.displayName,
        body.bio,
        body.avatar || null,
        body.location || null,
        JSON.stringify(body.languages),
        JSON.stringify(body.categories),
        JSON.stringify(body.platforms),
        body.pricing ? JSON.stringify(body.pricing) : null,
        JSON.stringify(body.contentTypes),
        body.audienceDemographics ? JSON.stringify(body.audienceDemographics) : null,
        JSON.stringify(body.collaborationPreferences),
        totalFollowers,
        tier
      ]);
    } else {
      // Create
      await neonQuery(`
        INSERT INTO cc_creator_profiles (
          user_id, display_name, bio, avatar, location, languages,
          categories, platforms, pricing, content_types, audience_demographics,
          collaboration_preferences, follower_count, tier, is_available, is_verified,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, false, NOW(), NOW())
      `, [
        userId,
        body.displayName,
        body.bio,
        body.avatar || null,
        body.location || null,
        JSON.stringify(body.languages),
        JSON.stringify(body.categories),
        JSON.stringify(body.platforms),
        body.pricing ? JSON.stringify(body.pricing) : null,
        JSON.stringify(body.contentTypes),
        body.audienceDemographics ? JSON.stringify(body.audienceDemographics) : null,
        JSON.stringify(body.collaborationPreferences),
        totalFollowers,
        tier
      ]);
    }

    return c.json({
      success: true,
      tier,
      totalFollowers,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('[Profile Update] Error:', error);
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

/**
 * Search creators (brand view)
 * POST /api/creator-commerce/creator/search
 */
router.post('/search', authMiddleware, zValidator('json', searchCreatorsSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const body = c.req.valid('json');
  const { limit = '20', offset = '0' } = c.req.query();
  
  try {
    // Build query
    let orderBy = body.sortBy === 'followers' ? 'cp.follower_count DESC' :
                  body.sortBy === 'engagement' ? '(cp.platforms->0->>\'engagementRate\')::float DESC' :
                  body.sortBy === 'completed_collabs' ? 'stats.completed_deliverables DESC' :
                  body.sortBy === 'rating' ? 'stats.avg_rating DESC' :
                  'cp.created_at DESC';

    const result = await neonQuery(`
      WITH creator_stats AS (
        SELECT 
          cp.id,
          COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'approved') as completed_collabs,
          COUNT(DISTINCT cd.id) FILTER (WHERE cd.status = 'published') as completed_deliverables,
          COALESCE(AVG(r.rating), 0) as avg_rating
        FROM cc_creator_profiles cp
        LEFT JOIN cc_campaign_applications ca ON cp.user_id = ca.creator_id
        LEFT JOIN cc_campaign_deliverables cd ON ca.id = cd.application_id
        LEFT JOIN cc_reviews r ON cp.user_id = r.creator_id AND r.status = 'approved'
        GROUP BY cp.id
      )
      SELECT 
        cp.id,
        cp.user_id,
        cp.display_name,
        cp.bio,
        cp.avatar,
        cp.location,
        cp.categories,
        cp.platforms,
        cp.follower_count,
        cp.tier,
        cp.is_verified,
        cp.pricing,
        cp.content_types,
        cp.audience_demographics,
        cp.is_available,
        stats.completed_collabs,
        stats.completed_deliverables,
        stats.avg_rating
      FROM cc_creator_profiles cp
      LEFT JOIN creator_stats stats ON cp.id = stats.id
      WHERE cp.is_available = true
        ${body.minFollowers ? `AND cp.follower_count >= $1` : ''}
        ${body.maxFollowers ? `AND cp.follower_count <= $2` : ''}
        ${body.verifiedOnly ? `AND cp.is_verified = true` : ''}
        ${body.categories?.length ? `AND cp.categories @> $3::jsonb` : ''}
        ${body.location ? `AND cp.location ILIKE $4` : ''}
      ORDER BY ${orderBy}
      LIMIT $5 OFFSET $6
    `, [
      ...(body.minFollowers ? [body.minFollowers] : []),
      ...(body.maxFollowers ? [body.maxFollowers] : []),
      ...(body.categories?.length ? [JSON.stringify(body.categories)] : []),
      ...(body.location ? [`%${body.location}%`] : []),
      parseInt(limit),
      parseInt(offset)
    ].filter(Boolean));

    // Filter by platform engagement if specified
    let creators = result.rows;
    if (body.platforms?.length || body.engagementRateMin) {
      creators = creators.filter(c => {
        const platforms = c.platforms || [];
        
        if (body.platforms?.length) {
          const hasPlatform = platforms.some((p: any) => 
            body.platforms?.includes(p.name)
          );
          if (!hasPlatform) return false;
        }
        
        if (body.engagementRateMin) {
          const meetsEngagement = platforms.some((p: any) => 
            (p.engagementRate || 0) >= body.engagementRateMin!
          );
          if (!meetsEngagement) return false;
        }
        
        return true;
      });
    }

    return c.json({
      creators,
      count: creators.length,
      filters: body
    });

  } catch (error) {
    console.error('[Creator Search] Error:', error);
    return c.json({ error: 'Failed to search creators' }, 500);
  }
});

/**
 * Get creator public profile
 * GET /api/creator-commerce/creator/:id
 */
router.get('/:id', async (c) => {
  const creatorId = c.req.param('id');
  
  try {
    const result = await neonQuery(`
      SELECT 
        cp.display_name,
        cp.bio,
        cp.avatar,
        cp.location,
        cp.categories,
        cp.platforms,
        cp.follower_count,
        cp.tier,
        cp.is_verified,
        cp.pricing,
        cp.content_types,
        cp.audience_demographics,
        COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'approved') as completed_collabs,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(DISTINCT r.id) as review_count
      FROM cc_creator_profiles cp
      LEFT JOIN cc_campaign_applications ca ON cp.user_id = ca.creator_id
      LEFT JOIN cc_reviews r ON cp.user_id = r.creator_id AND r.status = 'approved'
      WHERE cp.user_id = $1 AND cp.is_available = true
      GROUP BY cp.id
    `, [creatorId]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Creator not found' }, 404);
    }

    // Get recent work samples
    const samplesResult = await neonQuery(`
      SELECT 
        cd.type,
        cd.content_url,
        cd.metrics,
        cd.updated_at,
        c.name as campaign_name
      FROM cc_campaign_deliverables cd
      JOIN cc_campaign_applications ca ON cd.application_id = ca.id
      JOIN cc_campaigns c ON ca.campaign_id = c.id
      WHERE ca.creator_id = $1 AND cd.status = 'published'
      ORDER BY cd.updated_at DESC
      LIMIT 6
    `, [creatorId]);

    return c.json({
      profile: result.rows[0],
      workSamples: samplesResult.rows
    });

  } catch (error) {
    console.error('[Public Profile] Error:', error);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

/**
 * Get featured creators
 * GET /api/creator-commerce/creator/featured
 */
router.get('/featured', async (c) => {
  const { limit = '10' } = c.req.query();
  
  try {
    const result = await neonQuery(`
      SELECT 
        cp.user_id,
        cp.display_name,
        cp.avatar,
        cp.categories,
        cp.platforms,
        cp.follower_count,
        cp.tier,
        cp.is_verified,
        stats.avg_rating,
        stats.completed_deliverables
      FROM cc_creator_profiles cp
      LEFT JOIN (
        SELECT 
          cp2.id,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          COUNT(DISTINCT cd.id) FILTER (WHERE cd.status = 'published') as completed_deliverables
        FROM cc_creator_profiles cp2
        LEFT JOIN cc_campaign_applications ca ON cp2.user_id = ca.creator_id
        LEFT JOIN cc_campaign_deliverables cd ON ca.id = cd.application_id
        LEFT JOIN cc_reviews r ON cp2.user_id = r.creator_id AND r.status = 'approved'
        GROUP BY cp2.id
      ) stats ON cp.id = stats.id
      WHERE cp.is_available = true AND cp.is_verified = true
      ORDER BY stats.completed_deliverables DESC NULLS LAST, cp.follower_count DESC
      LIMIT $1
    `, [parseInt(limit)]);

    return c.json({
      creators: result.rows
    });

  } catch (error) {
    console.error('[Featured Creators] Error:', error);
    return c.json({ error: 'Failed to fetch featured creators' }, 500);
  }
});

/**
 * Update availability status
 * PATCH /api/creator-commerce/creator/availability
 */
router.patch('/availability', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { isAvailable } = await c.req.json();
  
  try {
    await neonQuery(`
      UPDATE cc_creator_profiles
      SET is_available = $2, updated_at = NOW()
      WHERE user_id = $1
    `, [userId, isAvailable]);

    return c.json({
      success: true,
      isAvailable,
      message: `Availability set to ${isAvailable ? 'available' : 'not available'}`
    });

  } catch (error) {
    console.error('[Availability Update] Error:', error);
    return c.json({ error: 'Failed to update availability' }, 500);
  }
});

// Initialize tables
export async function initCreatorProfileTables() {
  await neonQuery(`
    CREATE TABLE IF NOT EXISTS cc_creator_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL,
      avatar TEXT,
      location TEXT,
      languages JSONB,
      categories JSONB,
      platforms JSONB,
      pricing JSONB,
      content_types JSONB,
      audience_demographics JSONB,
      collaboration_preferences JSONB,
      follower_count INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
      is_available BOOLEAN DEFAULT true,
      is_verified BOOLEAN DEFAULT false,
      verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'in_review', 'approved', 'rejected')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_creator_profiles_user ON cc_creator_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_creator_profiles_tier ON cc_creator_profiles(tier);
    CREATE INDEX IF NOT EXISTS idx_creator_profiles_followers ON cc_creator_profiles(follower_count);
    CREATE INDEX IF NOT EXISTS idx_creator_profiles_available ON cc_creator_profiles(is_available);
    CREATE INDEX IF NOT EXISTS idx_creator_profiles_categories ON cc_creator_profiles USING GIN(categories);
  `);
  
  console.log('[Creator Profiles] Tables initialized');
}

export default router;
