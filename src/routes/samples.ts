/**
 * Creator Commerce: Sample Request System (CC-1)
 * G2 + Aspire model - Product samples for creators
 * 
 * Flow:
 * 1. Creator browses products from connected shops
 * 2. Creator requests sample (specifying use case)
 * 3. Brand approves/denies request
 * 4. Order syncs to connected shop for fulfillment
 * 5. Creator receives sample → creates review/UGC
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';
import { getRedis } from '../services/redis-client';

const router = new Hono();

// Schemas
const createRequestSchema = z.object({
  productId: z.string().uuid(),
  shopId: z.string(),
  useCase: z.enum(['review', 'social_post', 'video_content', 'blog_feature', 'comparison', 'other']),
  description: z.string().min(50).max(1000),
  deliverables: z.object({
    review: z.boolean().optional(),
    video: z.boolean().optional(),
    photos: z.boolean().optional(),
    socialPosts: z.number().min(0).max(10).optional(),
    timeline: z.enum(['1_week', '2_weeks', '1_month']).optional()
  }),
  shippingAddress: z.object({
    fullName: z.string(),
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string(),
    phone: z.string()
  })
});

const reviewRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(500).optional(),
  brandNotes: z.string().max(500).optional()
});

/**
 * Browse products available for sample requests
 * GET /api/creator-commerce/products
 */
router.get('/products', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { category, shop, limit = '20', offset = '0' } = c.req.query();
  
  try {
    // Get products from connected shops with sample eligibility
    const result = await neonQuery(`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.currency,
        p.images,
        p.category,
        s.id as shop_id,
        s.name as shop_name,
        s.logo as shop_logo,
        p.sample_eligible,
        p.sample_quota,
        p.samples_requested,
        p.samples_approved
      FROM cc_products p
      JOIN cc_shops s ON p.shop_id = s.id
      WHERE p.sample_eligible = true
        AND p.sample_quota > p.samples_approved
        AND s.is_active = true
        ${category ? `AND p.category = $4` : ''}
        ${shop ? `AND s.id = $5` : ''}
      ORDER BY p.samples_approved ASC, p.created_at DESC
      LIMIT $2 OFFSET $3
    `, category && shop ? [userId, parseInt(limit), parseInt(offset), category, shop] :
       category ? [userId, parseInt(limit), parseInt(offset), category] :
       shop ? [userId, parseInt(limit), parseInt(offset), shop] :
       [userId, parseInt(limit), parseInt(offset)]);

    return c.json({
      products: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Creator Products] Error:', error);
    return c.json({ error: 'Failed to fetch products' }, 500);
  }
});

/**
 * Submit sample request
 * POST /api/creator-commerce/samples/request
 */
router.post('/samples/request', authMiddleware, zValidator('json', createRequestSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const body = c.req.valid('json');
  
  try {
    // Check if user already has pending request for this product
    const existing = await neonQuery(`
      SELECT id FROM cc_sample_requests
      WHERE creator_id = $1 AND product_id = $2 AND status IN ('pending', 'approved')
    `, [userId, body.productId]);

    if (existing.rows.length > 0) {
      return c.json({
        error: 'Duplicate request',
        message: 'You already have a pending or approved request for this product'
      }, 400);
    }

    // Check creator eligibility
    const creatorProfile = await neonQuery(`
      SELECT follower_count, platform, content_category
      FROM cc_creator_profiles WHERE user_id = $1
    `, [userId]);

    if (creatorProfile.rows.length === 0) {
      return c.json({
        error: 'Profile incomplete',
        message: 'Complete your creator profile to request samples'
      }, 403);
    }

    // Create request
    const requestId = crypto.randomUUID();
    
    await neonQuery(`
      INSERT INTO cc_sample_requests (
        id, creator_id, product_id, shop_id, status,
        use_case, description, deliverables, shipping_address,
        creator_metrics, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [
      requestId,
      userId,
      body.productId,
      body.shopId,
      'pending',
      body.useCase,
      body.description,
      JSON.stringify(body.deliverables),
      JSON.stringify(body.shippingAddress),
      JSON.stringify({
        followerCount: creatorProfile.rows[0].follower_count,
        platform: creatorProfile.rows[0].platform,
        contentCategory: creatorProfile.rows[0].content_category
      })
    ]);

    // Notify brand/shop owner
    await notifyBrand(body.shopId, {
      type: 'sample.requested',
      requestId,
      productId: body.productId,
      creatorId: userId,
      creatorMetrics: creatorProfile.rows[0]
    });

    return c.json({
      success: true,
      requestId,
      status: 'pending',
      message: 'Sample request submitted for brand review'
    });

  } catch (error) {
    console.error('[Sample Request] Error:', error);
    return c.json({ error: 'Failed to submit request' }, 500);
  }
});

/**
 * Brand reviews sample request
 * POST /api/creator-commerce/samples/:id/review
 */
router.post('/samples/:id/review', authMiddleware, zValidator('json', reviewRequestSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const requestId = c.req.param('id');
  const body = c.req.valid('json');
  
  try {
    // Verify request belongs to user's shop
    const requestResult = await neonQuery(`
      SELECT sr.*, s.owner_id
      FROM cc_sample_requests sr
      JOIN cc_shops s ON sr.shop_id = s.id
      WHERE sr.id = $1
    `, [requestId]);

    if (requestResult.rows.length === 0) {
      return c.json({ error: 'Request not found' }, 404);
    }

    const request = requestResult.rows[0];
    
    if (request.owner_id !== userId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (request.status !== 'pending') {
      return c.json({ error: 'Request already processed' }, 400);
    }

    // Update request
    await neonQuery(`
      UPDATE cc_sample_requests
      SET status = $2,
          reviewed_by = $3,
          reviewed_at = NOW(),
          review_reason = $4,
          brand_notes = $5
      WHERE id = $1
    `, [requestId, body.decision, userId, body.reason || null, body.brandNotes || null]);

    // Update product stats
    if (body.decision === 'approved') {
      await neonQuery(`
        UPDATE cc_products
        SET samples_approved = samples_approved + 1
        WHERE id = $1
      `, [request.product_id]);

      // Create order in connected shop
      const orderId = await createSampleOrder(request);
      
      // Update request with order ID
      await neonQuery(`
        UPDATE cc_sample_requests SET order_id = $2 WHERE id = $1
      `, [requestId, orderId]);

      // Notify creator
      await notifyCreator(request.creator_id, {
        type: 'sample.approved',
        requestId,
        productId: request.product_id,
        orderId,
        brandNotes: body.brandNotes
      });
    } else {
      // Notify creator of rejection
      await notifyCreator(request.creator_id, {
        type: 'sample.rejected',
        requestId,
        productId: request.product_id,
        reason: body.reason
      });
    }

    return c.json({
      success: true,
      requestId,
      decision: body.decision,
      message: `Request ${body.decision}`
    });

  } catch (error) {
    console.error('[Review Request] Error:', error);
    return c.json({ error: 'Failed to process review' }, 500);
  }
});

/**
 * Get creator's sample requests
 * GET /api/creator-commerce/samples/my-requests
 */
router.get('/samples/my-requests', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { status, limit = '20', offset = '0' } = c.req.query();
  
  try {
    const result = await neonQuery(`
      SELECT 
        sr.id,
        sr.status,
        sr.use_case,
        sr.description,
        sr.deliverables,
        sr.created_at,
        sr.reviewed_at,
        sr.review_reason,
        sr.brand_notes,
        sr.order_id,
        p.id as product_id,
        p.name as product_name,
        p.images as product_images,
        s.name as shop_name,
        s.logo as shop_logo
      FROM cc_sample_requests sr
      JOIN cc_products p ON sr.product_id = p.id
      JOIN cc_shops s ON sr.shop_id = s.id
      WHERE sr.creator_id = $1
        ${status ? `AND sr.status = $4` : ''}
      ORDER BY sr.created_at DESC
      LIMIT $2 OFFSET $3
    `, status ? [userId, parseInt(limit), parseInt(offset), status] :
       [userId, parseInt(limit), parseInt(offset)]);

    return c.json({
      requests: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[My Requests] Error:', error);
    return c.json({ error: 'Failed to fetch requests' }, 500);
  }
});

/**
 * Get brand's incoming sample requests
 * GET /api/creator-commerce/samples/incoming
 */
router.get('/samples/incoming', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { status = 'pending', limit = '20', offset = '0' } = c.req.query();
  
  try {
    const result = await neonQuery(`
      SELECT 
        sr.id,
        sr.status,
        sr.use_case,
        sr.description,
        sr.deliverables,
        sr.creator_metrics,
        sr.created_at,
        p.id as product_id,
        p.name as product_name,
        p.images as product_images,
        cp.user_id as creator_id,
        cp.display_name as creator_name,
        cp.avatar as creator_avatar,
        cp.follower_count,
        cp.platform,
        cp.content_category
      FROM cc_sample_requests sr
      JOIN cc_products p ON sr.product_id = p.id
      JOIN cc_shops s ON sr.shop_id = s.id
      JOIN cc_creator_profiles cp ON sr.creator_id = cp.user_id
      WHERE s.owner_id = $1
        AND sr.status = $4
      ORDER BY sr.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), parseInt(offset), status]);

    return c.json({
      requests: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Incoming Requests] Error:', error);
    return c.json({ error: 'Failed to fetch requests' }, 500);
  }
});

// Helper functions
async function notifyBrand(shopId: string, notification: any) {
  const redis = getRedis();
  await redis.publish('notifications:brand', JSON.stringify({
    shopId,
    ...notification
  }));
}

async function notifyCreator(creatorId: string, notification: any) {
  const redis = getRedis();
  await redis.publish('notifications:creator', JSON.stringify({
    userId: creatorId,
    ...notification
  }));
}

async function createSampleOrder(request: any): Promise<string> {
  // Create order in connected commerce system
  // This would integrate with Medusa/Shopify/other shop backend
  const orderId = crypto.randomUUID();
  
  // TODO: Integrate with commerce backend
  console.log('[Sample Order] Created order', orderId, 'for request', request.id);
  
  return orderId;
}

// Initialize tables
export async function initSampleRequestTables() {
  await neonQuery(`
    CREATE TABLE IF NOT EXISTS cc_sample_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id TEXT NOT NULL,
      product_id UUID NOT NULL,
      shop_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'shipped', 'received', 'completed')),
      use_case TEXT NOT NULL,
      description TEXT NOT NULL,
      deliverables JSONB,
      shipping_address JSONB,
      creator_metrics JSONB,
      order_id TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMP,
      review_reason TEXT,
      brand_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_sample_req_creator ON cc_sample_requests(creator_id);
    CREATE INDEX IF NOT EXISTS idx_sample_req_product ON cc_sample_requests(product_id);
    CREATE INDEX IF NOT EXISTS idx_sample_req_shop ON cc_sample_requests(shop_id);
    CREATE INDEX IF NOT EXISTS idx_sample_req_status ON cc_sample_requests(status);
    CREATE INDEX IF NOT EXISTS idx_sample_req_created ON cc_sample_requests(created_at DESC);
  `);
  
  console.log('[Creator Samples] Tables initialized');
}

export default router;
