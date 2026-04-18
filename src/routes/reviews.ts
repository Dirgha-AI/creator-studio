/**
 * Creator Commerce: Reviews System (CC-2)
 * Product reviews and UGC content from creators
 * 
 * Features:
 * - Review submission (text, photos, videos)
 * - Review moderation and approval
 * - Review syndication to Shop pages
 * - Review analytics and sentiment analysis
 * - Creator reputation tracking
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';
import { getRedis } from '../services/redis-client';

const router = new Hono();

// Schemas
const submitReviewSchema = z.object({
  sampleRequestId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  title: z.string().min(5).max(200),
  content: z.string().min(100).max(5000),
  pros: z.array(z.string().max(200)).max(5),
  cons: z.array(z.string().max(200)).max(5),
  media: z.array(z.object({
    type: z.enum(['image', 'video']),
    url: z.string().url(),
    caption: z.string().max(200).optional()
  })).max(10),
  tags: z.array(z.string()).max(10),
  verifiedPurchase: z.boolean().default(true),
  syndicateToShop: z.boolean().default(true),
  syndicateToSocial: z.boolean().default(false)
});

const moderateReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'flagged']),
  reason: z.string().max(500).optional(),
  notes: z.string().max(500).optional()
});

/**
 * Submit a product review
 * POST /api/creator-commerce/reviews/submit
 */
router.post('/submit', authMiddleware, zValidator('json', submitReviewSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const body = c.req.valid('json');
  
  try {
    // Verify sample request exists and belongs to user
    const requestResult = await neonQuery(`
      SELECT sr.*, p.id as product_id, p.name as product_name, s.id as shop_id
      FROM cc_sample_requests sr
      JOIN cc_products p ON sr.product_id = p.id
      JOIN cc_shops s ON sr.shop_id = s.id
      WHERE sr.id = $1 AND sr.creator_id = $2 AND sr.status = 'received'
    `, [body.sampleRequestId, userId]);

    if (requestResult.rows.length === 0) {
      return c.json({
        error: 'Invalid request',
        message: 'Sample request not found or not eligible for review'
      }, 404);
    }

    const request = requestResult.rows[0];

    // Check if review already submitted for this request
    const existing = await neonQuery(`
      SELECT id FROM cc_reviews WHERE sample_request_id = $1
    `, [body.sampleRequestId]);

    if (existing.rows.length > 0) {
      return c.json({
        error: 'Duplicate review',
        message: 'Review already submitted for this sample'
      }, 400);
    }

    // Create review
    const reviewId = crypto.randomUUID();
    
    await neonQuery(`
      INSERT INTO cc_reviews (
        id, creator_id, sample_request_id, product_id, shop_id,
        rating, title, content, pros, cons, media, tags,
        verified_purchase, syndicate_to_shop, syndicate_to_social,
        status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    `, [
      reviewId,
      userId,
      body.sampleRequestId,
      request.product_id,
      request.shop_id,
      body.rating,
      body.title,
      body.content,
      JSON.stringify(body.pros),
      JSON.stringify(body.cons),
      JSON.stringify(body.media),
      JSON.stringify(body.tags),
      body.verifiedPurchase,
      body.syndicateToShop,
      body.syndicateToSocial,
      'pending' // Awaiting moderation
    ]);

    // Trigger AI sentiment analysis
    await analyzeReviewSentiment(reviewId, body.content);

    // Update request status
    await neonQuery(`
      UPDATE cc_sample_requests SET status = 'completed' WHERE id = $1
    `, [body.sampleRequestId]);

    // Update creator stats
    await updateCreatorStats(userId);

    return c.json({
      success: true,
      reviewId,
      status: 'pending',
      message: 'Review submitted for moderation'
    });

  } catch (error) {
    console.error('[Review Submit] Error:', error);
    return c.json({ error: 'Failed to submit review' }, 500);
  }
});

/**
 * Brand moderates review
 * POST /api/creator-commerce/reviews/:id/moderate
 */
router.post('/:id/moderate', authMiddleware, zValidator('json', moderateReviewSchema), async (c) => {
  const userId = (c as any).get('userId') as string;
  const reviewId = c.req.param('id');
  const body = c.req.valid('json');
  
  try {
    // Verify review belongs to brand's product
    const reviewResult = await neonQuery(`
      SELECT r.*, s.owner_id
      FROM cc_reviews r
      JOIN cc_shops s ON r.shop_id = s.id
      WHERE r.id = $1
    `, [reviewId]);

    if (reviewResult.rows.length === 0) {
      return c.json({ error: 'Review not found' }, 404);
    }

    if (reviewResult.rows[0].owner_id !== userId) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const currentStatus = reviewResult.rows[0].status;
    if (currentStatus !== 'pending' && currentStatus !== 'flagged') {
      return c.json({ error: 'Review already moderated' }, 400);
    }

    // Update review
    await neonQuery(`
      UPDATE cc_reviews
      SET status = $2,
          moderated_by = $3,
          moderated_at = NOW(),
          moderation_reason = $4,
          moderation_notes = $5
      WHERE id = $1
    `, [reviewId, body.decision, userId, body.reason || null, body.notes || null]);

    const review = reviewResult.rows[0];

    if (body.decision === 'approved') {
      // Syndicate to shop if enabled
      if (review.syndicate_to_shop) {
        await syndicateToShop(reviewId, review);
      }

      // Update product rating
      await updateProductRating(review.product_id);

      // Notify creator
      await notifyCreator(review.creator_id, {
        type: 'review.approved',
        reviewId,
        productId: review.product_id,
        rating: review.rating
      });
    } else if (body.decision === 'rejected') {
      // Notify creator with reason
      await notifyCreator(review.creator_id, {
        type: 'review.rejected',
        reviewId,
        productId: review.product_id,
        reason: body.reason,
        notes: body.notes
      });
    }

    return c.json({
      success: true,
      reviewId,
      decision: body.decision,
      message: `Review ${body.decision}`
    });

  } catch (error) {
    console.error('[Review Moderate] Error:', error);
    return c.json({ error: 'Failed to moderate review' }, 500);
  }
});

/**
 * Get product reviews (public)
 * GET /api/creator-commerce/reviews/product/:productId
 */
router.get('/product/:productId', async (c) => {
  const productId = c.req.param('productId');
  const { limit = '10', offset = '0', sort = 'newest' } = c.req.query();
  
  try {
    const orderBy = sort === 'newest' ? 'r.created_at DESC' :
                    sort === 'rating' ? 'r.rating DESC, r.created_at DESC' :
                    sort === 'helpful' ? 'r.helpful_count DESC, r.created_at DESC' :
                    'r.created_at DESC';

    const result = await neonQuery(`
      SELECT 
        r.id,
        r.rating,
        r.title,
        r.content,
        r.pros,
        r.cons,
        r.media,
        r.tags,
        r.verified_purchase,
        r.helpful_count,
        r.created_at,
        cp.display_name as creator_name,
        cp.avatar as creator_avatar,
        cp.platform as creator_platform,
        cp.follower_count as creator_followers
      FROM cc_reviews r
      JOIN cc_creator_profiles cp ON r.creator_id = cp.user_id
      WHERE r.product_id = $1
        AND r.status = 'approved'
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3
    `, [productId, parseInt(limit), parseInt(offset)]);

    // Get aggregate rating
    const statsResult = await neonQuery(`
      SELECT 
        COUNT(*) as total,
        AVG(rating) as avg_rating,
        COUNT(*) FILTER (WHERE rating = 5) as five_star,
        COUNT(*) FILTER (WHERE rating = 4) as four_star,
        COUNT(*) FILTER (WHERE rating = 3) as three_star,
        COUNT(*) FILTER (WHERE rating = 2) as two_star,
        COUNT(*) FILTER (WHERE rating = 1) as one_star
      FROM cc_reviews
      WHERE product_id = $1 AND status = 'approved'
    `, [productId]);

    return c.json({
      reviews: result.rows,
      stats: statsResult.rows[0],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[Product Reviews] Error:', error);
    return c.json({ error: 'Failed to fetch reviews' }, 500);
  }
});

/**
 * Get creator's reviews
 * GET /api/creator-commerce/reviews/my-reviews
 */
router.get('/my-reviews', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { status, limit = '20', offset = '0' } = c.req.query();
  
  try {
    const result = await neonQuery(`
      SELECT 
        r.id,
        r.rating,
        r.title,
        r.content,
        r.media,
        r.status,
        r.verified_purchase,
        r.helpful_count,
        r.created_at,
        r.moderated_at,
        r.moderation_reason,
        p.id as product_id,
        p.name as product_name,
        p.images as product_images,
        s.name as shop_name
      FROM cc_reviews r
      JOIN cc_products p ON r.product_id = p.id
      JOIN cc_shops s ON r.shop_id = s.id
      WHERE r.creator_id = $1
        ${status ? `AND r.status = $4` : ''}
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, status ? [userId, parseInt(limit), parseInt(offset), status] :
       [userId, parseInt(limit), parseInt(offset)]);

    return c.json({
      reviews: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('[My Reviews] Error:', error);
    return c.json({ error: 'Failed to fetch reviews' }, 500);
  }
});

/**
 * Mark review as helpful
 * POST /api/creator-commerce/reviews/:id/helpful
 */
router.post('/:id/helpful', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const reviewId = c.req.param('id');
  
  try {
    // Check if already marked helpful
    const existing = await neonQuery(`
      SELECT id FROM cc_review_helpful WHERE review_id = $1 AND user_id = $2
    `, [reviewId, userId]);

    if (existing.rows.length > 0) {
      return c.json({ error: 'Already marked helpful' }, 400);
    }

    // Add helpful mark
    await neonQuery(`
      INSERT INTO cc_review_helpful (review_id, user_id, created_at)
      VALUES ($1, $2, NOW())
    `, [reviewId, userId]);

    // Update count
    await neonQuery(`
      UPDATE cc_reviews 
      SET helpful_count = helpful_count + 1 
      WHERE id = $1
    `, [reviewId]);

    return c.json({ success: true });

  } catch (error) {
    console.error('[Helpful] Error:', error);
    return c.json({ error: 'Failed to mark helpful' }, 500);
  }
});

/**
 * Get review analytics for brand
 * GET /api/creator-commerce/reviews/analytics
 */
router.get('/analytics', authMiddleware, async (c) => {
  const userId = (c as any).get('userId') as string;
  const { period = '30' } = c.req.query(); // days
  
  try {
    const result = await neonQuery(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'approved') as approved_reviews,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_reviews,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_reviews,
        AVG(rating) FILTER (WHERE status = 'approved') as avg_rating,
        SUM(helpful_count) as total_helpful,
        COUNT(DISTINCT product_id) as products_reviewed
      FROM cc_reviews r
      JOIN cc_shops s ON r.shop_id = s.id
      WHERE s.owner_id = $1
        AND r.created_at > NOW() - INTERVAL '${period} days'
    `, [userId]);

    const sentimentResult = await neonQuery(`
      SELECT 
        sentiment,
        COUNT(*) as count
      FROM cc_reviews r
      JOIN cc_shops s ON r.shop_id = s.id
      WHERE s.owner_id = $1
        AND r.created_at > NOW() - INTERVAL '${period} days'
        AND sentiment IS NOT NULL
      GROUP BY sentiment
    `, [userId]);

    return c.json({
      overview: result.rows[0],
      sentiment: sentimentResult.rows,
      period
    });

  } catch (error) {
    console.error('[Review Analytics] Error:', error);
    return c.json({ error: 'Failed to fetch analytics' }, 500);
  }
});

// Helper functions
async function analyzeReviewSentiment(reviewId: string, content: string) {
  // Trigger AI sentiment analysis
  const redis = getRedis();
  await redis.lpush('ai:queue:sentiment', JSON.stringify({
    type: 'review_sentiment',
    reviewId,
    content
  }));
}

async function syndicateToShop(reviewId: string, review: any) {
  // Push review to shop storefront
  const redis = getRedis();
  await redis.publish('shop:reviews', JSON.stringify({
    reviewId,
    productId: review.product_id,
    action: 'add'
  }));
}

async function updateProductRating(productId: string) {
  // Recalculate product rating
  await neonQuery(`
    UPDATE cc_products
    SET avg_rating = (
      SELECT AVG(rating) FROM cc_reviews 
      WHERE product_id = $1 AND status = 'approved'
    ),
    review_count = (
      SELECT COUNT(*) FROM cc_reviews 
      WHERE product_id = $1 AND status = 'approved'
    )
    WHERE id = $1
  `, [productId]);
}

async function updateCreatorStats(userId: string) {
  // Update creator reputation
  await neonQuery(`
    UPDATE cc_creator_profiles
    SET reviews_count = (
      SELECT COUNT(*) FROM cc_reviews WHERE creator_id = $1 AND status = 'approved'
    ),
    avg_rating = (
      SELECT AVG(rating) FROM cc_reviews WHERE creator_id = $1 AND status = 'approved'
    ),
    updated_at = NOW()
    WHERE user_id = $1
  `, [userId]);
}

async function notifyCreator(userId: string, notification: any) {
  const redis = getRedis();
  await redis.publish('notifications:creator', JSON.stringify({
    userId,
    ...notification
  }));
}

// Initialize tables
export async function initReviewTables() {
  await neonQuery(`
    CREATE TABLE IF NOT EXISTS cc_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id TEXT NOT NULL,
      sample_request_id UUID NOT NULL,
      product_id UUID NOT NULL,
      shop_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pros JSONB,
      cons JSONB,
      media JSONB,
      tags JSONB,
      verified_purchase BOOLEAN DEFAULT true,
      syndicate_to_shop BOOLEAN DEFAULT true,
      syndicate_to_social BOOLEAN DEFAULT false,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
      sentiment TEXT,
      sentiment_score DECIMAL(3,2),
      helpful_count INTEGER DEFAULT 0,
      moderated_by TEXT,
      moderated_at TIMESTAMP,
      moderation_reason TEXT,
      moderation_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS cc_review_helpful (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL REFERENCES cc_reviews(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(review_id, user_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON cc_reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_creator ON cc_reviews(creator_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_shop ON cc_reviews(shop_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON cc_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_rating ON cc_reviews(rating);
    CREATE INDEX IF NOT EXISTS idx_reviews_created ON cc_reviews(created_at DESC);
  `);
  
  console.log('[Creator Reviews] Tables initialized');
}

export default router;
