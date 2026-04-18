/**
 * creator-profile-pub.ts — Public creator profile pages
 *
 * GET  /api/creator-profile/top       — top creators list (by subscriber count)
 * GET  /api/creator-profile/:handle   — public profile + apps for creator page
 */
import { Hono } from 'hono';
import { query } from '../services/neon';

export const creatorProfilePubRouter = new Hono();

// ── GET /top — leaderboard of top creators (MUST come before /:handle) ────────
creatorProfilePubRouter.get('/top', async (c) => {
  const { limit = '12' } = c.req.query();
  try {
    const { rows } = await query(
      `SELECT p.user_id, p.display_name, p.avatar_url, p.badge_level,
              p.github_handle, p.total_subscribers, p.github_stars_total,
              COUNT(a.id)::int AS app_count
       FROM creator_profiles p
       LEFT JOIN creator_apps a ON a.creator_id = p.user_id::TEXT AND a.status = 'approved'
       GROUP BY p.user_id, p.display_name, p.avatar_url, p.badge_level,
                p.github_handle, p.total_subscribers, p.github_stars_total
       HAVING COUNT(a.id) > 0
       ORDER BY p.total_subscribers DESC, p.github_stars_total DESC
       LIMIT $1`,
      [parseInt(limit)]
    );
    return c.json({ creators: rows });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── GET /:handle — public creator profile + all approved apps ──────────────────
creatorProfilePubRouter.get('/:handle', async (c) => {
  const { handle } = c.req.param();
  try {
    // Try to find creator by github_handle or by display_name slug
    const { rows: [profile] } = await query(
      `SELECT * FROM creator_profiles
       WHERE github_handle = $1 OR LOWER(REPLACE(display_name, ' ', '-')) = $1`,
      [handle.toLowerCase()]
    );
    if (!profile) return c.json({ error: 'Creator not found' }, 404);

    const { rows: apps } = await query(
      `SELECT id, slug, name, tagline, logo_url, category, price_cents,
              subscriber_count, github_stars, github_url, featured
       FROM creator_apps
       WHERE creator_id = $1::TEXT AND status = 'approved'
       ORDER BY featured DESC, subscriber_count DESC`,
      [profile.user_id]
    );

    return c.json({ creator: profile, apps });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});
