/**
 * Creator profile API — Sprint 19
 * POST /api/creator/profile   → create/update
 * GET  /api/creator/:handle   → public profile + products
 */
import { Hono } from 'hono';
import { query } from '../services/neon';
import { getUser } from '../middleware/auth';

const router = new Hono();

// POST /api/creator/profile
router.post('/profile', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const body = await c.req.json<{
      handle: string; display_name: string; bio?: string;
      avatar_url?: string; banner_url?: string; website_url?: string;
      twitter?: string; instagram?: string;
    }>();

    // Upsert
    const { rows: [profile] } = await query(
      `INSERT INTO creator_profiles (user_id, handle, display_name, bio, avatar_url, banner_url, website_url, twitter, instagram)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name=EXCLUDED.display_name, bio=EXCLUDED.bio,
         avatar_url=EXCLUDED.avatar_url, banner_url=EXCLUDED.banner_url,
         website_url=EXCLUDED.website_url, twitter=EXCLUDED.twitter, instagram=EXCLUDED.instagram
       RETURNING *`,
      [userId, body.handle, body.display_name, body.bio, body.avatar_url,
       body.banner_url, body.website_url, body.twitter, body.instagram]
    );
    return c.json(profile);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/creator/:handle
router.get('/:handle', async (c) => {
  try {
    const { rows: [profile] } = await query(
      `SELECT cp.*, json_agg(dp.* ORDER BY dp.created_at DESC) FILTER (WHERE dp.id IS NOT NULL) as products
       FROM creator_profiles cp
       LEFT JOIN digital_products dp ON dp.creator_id = cp.id AND dp.is_published = TRUE
       WHERE cp.handle = $1
       GROUP BY cp.id`,
      [c.req.param('handle')]
    );
    if (!profile) return c.json({ error: 'Not found' }, 404);
    return c.json(profile);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/creator/me/profile
router.get('/me/profile', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const { rows: [profile] } = await query(
      `SELECT * FROM creator_profiles WHERE user_id=$1 LIMIT 1`, [userId]
    );
    return c.json(profile ?? null);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export { router as creatorProfileRouter };
