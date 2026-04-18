/**
 * Creator Commerce: Campaign Manager (CC-4)
 * Brand campaign creation and management for creator collaborations
 * 
 * Features:
 * - Create campaigns (Product Reviews, Sponsored Content, Affiliate)
 * - Creator discovery and outreach
 * - Campaign tracking and analytics
 * - Payment management
 * - Deliverables tracking
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';
import { getRedis } from '../services/redis-client';
import { deductCredits } from '../services/credit-manager';

const router = new Hono();

// Campaign creation schema
const createCampaignSchema = z.object({
  name: z.string().min(5).max(200),
  type: z.enum(['product_reviews', 'sponsored_content', 'affiliate', 'brand_ambassador', 'event_coverage']),
  description: z.string().min(100).max(2000),
  budget: z.object({
    total: z.number().min(100),
    currency: z.string().default('USD'),
    perCreatorMin: z.number().optional(),
    perCreatorMax: z.number().optional()
  }),
  requirements: z.object({
    minFollowers: z.number().min(0),
    platforms: z.array(z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin', 'blog'])),
    contentTypes: z.array(z.enum(['video', 'photo', 'story', 'reel', 'post', 'article'])),
    deliverables: z.array(z.object({
      type: z.string(),
      quantity: z.number(),
      requirements: z.string().optional()
    })),
    timeline: z.object({
      startDate: z.string(),
      endDate: z.string(),
      deliverBy: z.string()
    })
  }),
  products: z.array(z.object({
    productId: z.string(),
    quantity: z.number().default(1),
    notes: z.string().optional()
  })).optional(),
  targeting: z.object({
    categories: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    demographics: z.object({
      ageMin: z.number().optional(),
      ageMax: z.number().optional(),
      gender: z.array(z.string()).optional()
    }).optional()
  }).optional(),
  compensation: z.object({
    type: z.enum(['product_only', 'fixed_fee', 'performance_based', 'hybrid']),
    details: z.string()
  })
});

const applyToCampaignSchema = z.object({
  proposal: z.string().min(100).max(2000),
  deliverables: z.array(z.object({
    type: z.string(),
    quantity: z.number(),
    timeline: z.string()
  })),
  expectedCompensation: z.number().optional(),
  portfolioLinks: z.array(z.string().url()).optional()
});

const reviewApplicationSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'shortlisted']),
  reason: z.string().max(500).optional(),
  compensationOffered: z.number().optional(),
  notes: z.string().max(500).optional()
});

const updateDeliverableSchema = z.object({
  status: z.enum(['in_progress', 'submitted', 'approved', 'rejected', 'published']),
  contentUrl: z.string().url().optional(),
  notes: z.string().optional(),
  metrics: z.object({
    views: z.number().optional(),
    likes: z.number().optional(),
    comments: z.number().optional(),
    shares: z.number().optional(),
    clicks: z.number().optional(),
    conversions: z.number().optional()
  }).optional()
});

/**
 * Create a new campaign (brand only)
 * POST /api/creator-commerce/campaigns
 */
router.post('/', authMiddleware, zValidator('json', createCampaignSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const body = c.req.valid('json');
  
  try {
    // Verify brand ownership
    const brandResult = await neonQuery(`
      SELECT id FROM cc_shops WHERE owner_id = $1 AND is_active = true
      LIMIT 1
    `, [userId]);

    if (brandResult.rows.length === 0) {
      return c.json({
        error: 'Unauthorized',
        message: 'Only brand owners can create campaigns'
      }, 403);
    }

    const brandId = brandResult.rows[0].id;
    
    // Check credits for campaign creation fee
    const creationFee = 50; // 50 credits
    const hasCredits = await deductCredits(userId, creationFee, 'Campaign creation fee', null);
    
    if (!hasCredits) {
      return c.json({
        error: 'Insufficient credits',
        required: creationFee,
        message: 'Purchase more credits to create campaigns'
      }, 402);
    }

    const campaignId = crypto.randomUUID();
    
    await neonQuery(`
      INSERT INTO cc_campaigns (
        id, brand_id, brand_owner_id, name, type, description,
        budget_total, budget_currency, budget_per_creator_min, budget_per_creator_max,
        requirements_min_followers, requirements_platforms, requirements_content_types,
        requirements_deliverables, requirements_timeline,
        targeting_categories, targeting_locations, targeting_languages, targeting_demographics,
        compensation_type, compensation_details,
        products, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())
    `, [
      campaignId,
      brandId,
      userId,
      body.name,
      body.type,
      body.description,
      body.budget.total,
      body.budget.currency,
      body.budget.perCreatorMin || null,
      body.budget.perCreatorMax || null,
      body.requirements.minFollowers,
      JSON.stringify(body.requirements.platforms),
      JSON.stringify(body.requirements.contentTypes),
      JSON.stringify(body.requirements.deliverables),
      JSON.stringify(body.requirements.timeline),
      JSON.stringify(body.targeting?.categories || []),
      JSON.stringify(body.targeting?.locations || []),
      JSON.stringify(body.targeting?.languages || []),
      JSON.stringify(body.targeting?.demographics || {}),
      body.compensation.type,
      body.compensation.details,
      JSON.stringify(body.products || []),
      'active'
    ]);

    // Index for creator discovery
    await indexCampaignForDiscovery(campaignId, body);

    return c.json({
      success: true,
      campaignId,
      status: 'active',
      message: 'Campaign created successfully'
    });

  } catch (error) {
    console.error('[Campaign Create] Error:', error);
    return c.json({ error: 'Failed to create campaign' }, 500);
  }
});

/**
 * List available campaigns for creators
 * GET /api/creator-commerce/campaigns/discover
 */
router.get('/discover', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { 
    type, 
    platform, 
    minBudget,
    sortBy = 'newest',
    limit = '20',
    offset = '0'
  } = c.req.query();
  
  try {
    // Get creator profile for matching
    const creatorResult = await neonQuery(`
      SELECT follower_count, platform, content_category
      FROM cc_creator_profiles WHERE user_id = $1
    `, [userId]);

    const creator = creatorResult.rows[0] || { follower_count: 0, platform: null };
    
    // Build query with filters
    let orderBy = sortBy === 'budget' ? 'c.budget_total DESC' :
                  sortBy === 'deadline' ? "(c.requirements_timeline->>'endDate') ASC" :
                  'c.created_at DESC';

    const result = await neonQuery(`
      SELECT 
        c.id,
        c.name,
        c.type,
        c.description,
        c.budget_total,
        c.budget_currency,
        c.budget_per_creator_min,
        c.budget_per_creator_max,
        c.requirements_platforms,
        c.requirements_content_types,
        c.requirements_min_followers,
        c.requirements_timeline,
        c.compensation_type,
        c.compensation_details,
        c.targeting_categories,
        c.created_at,
        s.name as brand_name,
        s.logo as brand_logo,
        COUNT(ca.id) as applications_count
      FROM cc_campaigns c
      JOIN cc_shops s ON c.brand_id = s.id
      LEFT JOIN cc_campaign_applications ca ON c.id = ca.campaign_id
      WHERE c.status = 'active'
        AND (c.requirements_min_followers <= $4 OR c.requirements_min_followers IS NULL)
        ${type ? `AND c.type = $5` : ''}
        ${platform ? `AND c.requirements_platforms @> $6::jsonb` : ''}
        ${minBudget ? `AND c.budget_total >= $7` : ''}
        AND NOT EXISTS (
          SELECT 1 FROM cc_campaign_applications 
          WHERE campaign_id = c.id AND creator_id = $1
        )
      GROUP BY c.id, s.name, s.logo
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3
    `, [
      userId,
      parseInt(limit),
      parseInt(offset),
      creator.follower_count,
      ...(type ? [type] : []),
      ...(platform ? [JSON.stringify([platform])] : []),
      ...(minBudget ? [parseInt(minBudget)] : [])
    ].filter(Boolean));

    return c.json({
      campaigns: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Campaign Discover] Error:', error);
    return c.json({ error: 'Failed to fetch campaigns' }, 500);
  }
});

/**
 * Apply to campaign (creator only)
 * POST /api/creator-commerce/campaigns/:id/apply
 */
router.post('/:id/apply', authMiddleware, zValidator('json', applyToCampaignSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const campaignId = c.req.param('id');
  const body = c.req.valid('json');
  
  try {
    // Verify campaign exists and is active
    const campaignResult = await neonQuery(`
      SELECT * FROM cc_campaigns WHERE id = $1 AND status = 'active'
    `, [campaignId]);

    if (campaignResult.rows.length === 0) {
      return c.json({ error: 'Campaign not found or not active' }, 404);
    }

    const campaign = campaignResult.rows[0];

    // Check if creator already applied
    const existing = await neonQuery(`
      SELECT id FROM cc_campaign_applications
      WHERE campaign_id = $1 AND creator_id = $2
    `, [campaignId, userId]);

    if (existing.rows.length > 0) {
      return c.json({ error: 'Already applied to this campaign' }, 400);
    }

    // Check creator eligibility
    const creatorResult = await neonQuery(`
      SELECT follower_count, platform, is_verified
      FROM cc_creator_profiles WHERE user_id = $1
    `, [userId]);

    if (creatorResult.rows.length === 0) {
      return c.json({ error: 'Complete creator profile to apply' }, 403);
    }

    const creator = creatorResult.rows[0];

    if (campaign.requirements_min_followers > creator.follower_count) {
      return c.json({
        error: 'Does not meet requirements',
        message: `This campaign requires ${campaign.requirements_min_followers} followers`
      }, 403);
    }

    // Create application
    const applicationId = crypto.randomUUID();
    
    await neonQuery(`
      INSERT INTO cc_campaign_applications (
        id, campaign_id, creator_id, status, proposal,
        deliverables, expected_compensation, portfolio_links, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      applicationId,
      campaignId,
      userId,
      'pending',
      body.proposal,
      JSON.stringify(body.deliverables),
      body.expectedCompensation || null,
      JSON.stringify(body.portfolioLinks || [])
    ]);

    // Notify brand
    await notifyBrandOwner(campaign.brand_owner_id, {
      type: 'campaign.application_received',
      campaignId,
      applicationId,
      creatorId: userId,
      creatorProfile: creator
    });

    return c.json({
      success: true,
      applicationId,
      status: 'pending',
      message: 'Application submitted'
    });

  } catch (error) {
    console.error('[Campaign Apply] Error:', error);
    return c.json({ error: 'Failed to submit application' }, 500);
  }
});

/**
 * Brand reviews application
 * POST /api/creator-commerce/campaigns/:id/applications/:appId/review
 */
router.post('/:id/applications/:appId/review', authMiddleware, zValidator('json', reviewApplicationSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const campaignId = c.req.param('id');
  const applicationId = c.req.param('appId');
  const body = c.req.valid('json');
  
  try {
    // Verify ownership
    const campaignResult = await neonQuery(`
      SELECT * FROM cc_campaigns WHERE id = $1 AND brand_owner_id = $2
    `, [campaignId, userId]);

    if (campaignResult.rows.length === 0) {
      return c.json({ error: 'Campaign not found or unauthorized' }, 404);
    }

    const applicationResult = await neonQuery(`
      SELECT * FROM cc_campaign_applications WHERE id = $1 AND campaign_id = $2
    `, [applicationId, campaignId]);

    if (applicationResult.rows.length === 0) {
      return c.json({ error: 'Application not found' }, 404);
    }

    const application = applicationResult.rows[0];

    // Update application
    await neonQuery(`
      UPDATE cc_campaign_applications
      SET status = $2,
          review_notes = $3,
          compensation_offered = $4,
          brand_notes = $5,
          reviewed_at = NOW()
      WHERE id = $1
    `, [applicationId, body.decision, body.reason || null, body.compensationOffered || null, body.notes || null]);

    // If approved, create collaboration
    if (body.decision === 'approved') {
      await createCollaboration(campaignId, application);
    }

    // Notify creator
    await notifyCreator(application.creator_id, {
      type: `campaign.application_${body.decision}`,
      campaignId,
      applicationId,
      reason: body.reason,
      compensation: body.compensationOffered
    });

    return c.json({
      success: true,
      decision: body.decision,
      message: `Application ${body.decision}`
    });

  } catch (error) {
    console.error('[Application Review] Error:', error);
    return c.json({ error: 'Failed to review application' }, 500);
  }
});

/**
 * Get campaign details
 * GET /api/creator-commerce/campaigns/:id
 */
router.get('/:id', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const campaignId = c.req.param('id');
  
  try {
    const result = await neonQuery(`
      SELECT 
        c.*,
        s.name as brand_name,
        s.logo as brand_logo,
        COUNT(ca.id) as total_applications,
        COUNT(ca.id) FILTER (WHERE ca.status = 'approved') as approved_applications,
        COUNT(ca.id) FILTER (WHERE ca.status = 'pending') as pending_applications
      FROM cc_campaigns c
      JOIN cc_shops s ON c.brand_id = s.id
      LEFT JOIN cc_campaign_applications ca ON c.id = ca.campaign_id
      WHERE c.id = $1
        AND (c.brand_owner_id = $2 OR EXISTS (
          SELECT 1 FROM cc_campaign_applications 
          WHERE campaign_id = c.id AND creator_id = $2
        ))
      GROUP BY c.id, s.name, s.logo
    `, [campaignId, userId]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404);
    }

    const campaign = result.rows[0];

    // If brand owner, include applications
    if (campaign.brand_owner_id === userId) {
      const appsResult = await neonQuery(`
        SELECT 
          ca.*,
          cp.display_name as creator_name,
          cp.avatar as creator_avatar,
          cp.follower_count,
          cp.platform
        FROM cc_campaign_applications ca
        JOIN cc_creator_profiles cp ON ca.creator_id = cp.user_id
        WHERE ca.campaign_id = $1
        ORDER BY ca.created_at DESC
      `, [campaignId]);

      campaign.applications = appsResult.rows;
    }

    return c.json({ campaign });

  } catch (error) {
    console.error('[Campaign Details] Error:', error);
    return c.json({ error: 'Failed to fetch campaign' }, 500);
  }
});

/**
 * List brand's campaigns
 * GET /api/creator-commerce/campaigns/my-campaigns
 */
router.get('/my-campaigns', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { status, limit = '20', offset = '0' } = c.req.query();
  
  try {
    const result = await neonQuery(`
      SELECT 
        c.id,
        c.name,
        c.type,
        c.status,
        c.budget_total,
        c.budget_currency,
        c.created_at,
        COUNT(ca.id) as total_applications,
        COUNT(ca.id) FILTER (WHERE ca.status = 'approved') as approved_creators,
        SUM(ca.compensation_offered) FILTER (WHERE ca.status = 'approved') as allocated_budget
      FROM cc_campaigns c
      LEFT JOIN cc_campaign_applications ca ON c.id = ca.campaign_id
      WHERE c.brand_owner_id = $1
        ${status ? `AND c.status = $4` : ''}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `, status ? [userId, parseInt(limit), parseInt(offset), status] :
       [userId, parseInt(limit), parseInt(offset)]);

    return c.json({
      campaigns: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[My Campaigns] Error:', error);
    return c.json({ error: 'Failed to fetch campaigns' }, 500);
  }
});

/**
 * Update campaign status
 * PATCH /api/creator-commerce/campaigns/:id/status
 */
router.patch('/:id/status', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const campaignId = c.req.param('id');
  const { status } = await c.req.json();
  
  try {
    const result = await neonQuery(`
      UPDATE cc_campaigns
      SET status = $3, updated_at = NOW()
      WHERE id = $1 AND brand_owner_id = $2
      RETURNING id
    `, [campaignId, userId, status]);

    if (result.rows.length === 0) {
      return c.json({ error: 'Campaign not found or unauthorized' }, 404);
    }

    return c.json({
      success: true,
      message: `Campaign ${status}`
    });

  } catch (error) {
    console.error('[Campaign Status] Error:', error);
    return c.json({ error: 'Failed to update status' }, 500);
  }
});

/**
 * Update deliverable status (creator)
 * PATCH /api/creator-commerce/campaigns/:id/deliverables/:deliverableId
 */
router.patch('/:id/deliverables/:deliverableId', authMiddleware, zValidator('json', updateDeliverableSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const deliverableId = c.req.param('deliverableId');
  const body = c.req.valid('json');
  
  try {
    // Verify deliverable belongs to user's application
    const deliverableResult = await neonQuery(`
      SELECT d.*, ca.creator_id
      FROM cc_campaign_deliverables d
      JOIN cc_campaign_applications ca ON d.application_id = ca.id
      WHERE d.id = $1
    `, [deliverableId]);

    if (deliverableResult.rows.length === 0) {
      return c.json({ error: 'Deliverable not found' }, 404);
    }

    if (deliverableResult.rows[0].creator_id !== userId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    await neonQuery(`
      UPDATE cc_campaign_deliverables
      SET status = $2,
          content_url = COALESCE($3, content_url),
          notes = COALESCE($4, notes),
          metrics = COALESCE($5, metrics),
          updated_at = NOW()
      WHERE id = $1
    `, [deliverableId, body.status, body.contentUrl || null, body.notes || null, 
        body.metrics ? JSON.stringify(body.metrics) : null]);

    // If published, trigger payment if performance-based
    if (body.status === 'published') {
      await processDeliverablePublication(deliverableId, body.metrics);
    }

    return c.json({
      success: true,
      message: 'Deliverable updated'
    });

  } catch (error) {
    console.error('[Deliverable Update] Error:', error);
    return c.json({ error: 'Failed to update deliverable' }, 500);
  }
});

/**
 * Get campaign analytics
 * GET /api/creator-commerce/campaigns/:id/analytics
 */
router.get('/:id/analytics', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const campaignId = c.req.param('id');
  
  try {
    // Verify ownership
    const campaignResult = await neonQuery(`
      SELECT * FROM cc_campaigns WHERE id = $1 AND brand_owner_id = $2
    `, [campaignId, userId]);

    if (campaignResult.rows.length === 0) {
      return c.json({ error: 'Campaign not found' }, 404);
    }

    // Aggregate metrics
    const analyticsResult = await neonQuery(`
      SELECT 
        COUNT(DISTINCT ca.creator_id) as total_creators,
        COUNT(DISTINCT cd.id) as total_deliverables,
        COUNT(DISTINCT cd.id) FILTER (WHERE cd.status = 'published') as published_deliverables,
        COALESCE(SUM((cd.metrics->>'views')::int), 0) as total_views,
        COALESCE(SUM((cd.metrics->>'likes')::int), 0) as total_likes,
        COALESCE(SUM((cd.metrics->>'comments')::int), 0) as total_comments,
        COALESCE(SUM((cd.metrics->>'shares')::int), 0) as total_shares,
        COALESCE(SUM((cd.metrics->>'clicks')::int), 0) as total_clicks,
        COALESCE(SUM((cd.metrics->>'conversions')::int), 0) as total_conversions,
        SUM(ca.compensation_offered) as total_spent
      FROM cc_campaign_applications ca
      LEFT JOIN cc_campaign_deliverables cd ON ca.id = cd.application_id
      WHERE ca.campaign_id = $1 AND ca.status = 'approved'
    `, [campaignId]);

    // Timeline data
    const timelineResult = await neonQuery(`
      SELECT 
        DATE(cd.updated_at) as date,
        COUNT(*) as deliverables_published,
        COALESCE(SUM((cd.metrics->>'views')::int), 0) as daily_views
      FROM cc_campaign_deliverables cd
      JOIN cc_campaign_applications ca ON cd.application_id = ca.id
      WHERE ca.campaign_id = $1 
        AND cd.status = 'published'
        AND cd.updated_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(cd.updated_at)
      ORDER BY date DESC
    `, [campaignId]);

    return c.json({
      overview: analyticsResult.rows[0],
      timeline: timelineResult.rows
    });

  } catch (error) {
    console.error('[Campaign Analytics] Error:', error);
    return c.json({ error: 'Failed to fetch analytics' }, 500);
  }
});

// Helper functions
async function indexCampaignForDiscovery(campaignId: string, campaign: any) {
  const redis = getRedis();
  await redis.setex(
    `campaign:${campaignId}:discovery`,
    86400 * 30, // 30 days
    JSON.stringify({
      id: campaignId,
      type: campaign.type,
      platforms: campaign.requirements.platforms,
      minFollowers: campaign.requirements.minFollowers,
      budget: campaign.budget.total,
      compensation: campaign.compensation.type
    })
  );
}

async function createCollaboration(campaignId: string, application: any) {
  // Create deliverables based on requirements
  const deliverables = JSON.parse(application.deliverables || '[]');
  
  for (const deliverable of deliverables) {
    await neonQuery(`
      INSERT INTO cc_campaign_deliverables (
        id, campaign_id, application_id, creator_id,
        type, quantity, requirements, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      crypto.randomUUID(),
      campaignId,
      application.id,
      application.creator_id,
      deliverable.type,
      deliverable.quantity,
      deliverable.requirements || null,
      'pending'
    ]);
  }
}

async function processDeliverablePublication(deliverableId: string, metrics: any) {
  // Trigger performance-based payments if applicable
  // Update campaign ROI tracking
  console.log(`[Deliverable Published] ${deliverableId}`, metrics);
}

async function notifyBrandOwner(userId: string, notification: any) {
  const redis = getRedis();
  await redis.publish('notifications:brand', JSON.stringify({
    userId,
    ...notification
  }));
}

async function notifyCreator(userId: string, notification: any) {
  const redis = getRedis();
  await redis.publish('notifications:creator', JSON.stringify({
    userId,
    ...notification
  }));
}

// Initialize tables
export async function initCampaignTables() {
  await neonQuery(`
    CREATE TABLE IF NOT EXISTS cc_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL,
      brand_owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      budget_total DECIMAL(12,2) NOT NULL,
      budget_currency TEXT DEFAULT 'USD',
      budget_per_creator_min DECIMAL(12,2),
      budget_per_creator_max DECIMAL(12,2),
      requirements_min_followers INTEGER DEFAULT 0,
      requirements_platforms JSONB,
      requirements_content_types JSONB,
      requirements_deliverables JSONB,
      requirements_timeline JSONB,
      targeting_categories JSONB,
      targeting_locations JSONB,
      targeting_languages JSONB,
      targeting_demographics JSONB,
      compensation_type TEXT NOT NULL,
      compensation_details TEXT,
      products JSONB,
      status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS cc_campaign_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES cc_campaigns(id),
      creator_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shortlisted', 'approved', 'rejected')),
      proposal TEXT NOT NULL,
      deliverables JSONB,
      expected_compensation DECIMAL(12,2),
      portfolio_links JSONB,
      compensation_offered DECIMAL(12,2),
      review_notes TEXT,
      brand_notes TEXT,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS cc_campaign_deliverables (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES cc_campaigns(id),
      application_id UUID NOT NULL REFERENCES cc_campaign_applications(id),
      creator_id TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      requirements TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected', 'published')),
      content_url TEXT,
      notes TEXT,
      metrics JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON cc_campaigns(brand_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON cc_campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaigns_type ON cc_campaigns(type);
    CREATE INDEX IF NOT EXISTS idx_campaign_applications_campaign ON cc_campaign_applications(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_applications_creator ON cc_campaign_applications(creator_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_applications_status ON cc_campaign_applications(status);
  `);
  
  console.log('[Creator Campaigns] Tables initialized');
}

export default router;
