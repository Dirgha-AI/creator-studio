import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';

const router = new Hono();

router.use('*', authMiddleware);

router.post('/posts/from-highlight', async (c) => {
  const user = (c as any).get('user') as { id: string; email: string; role: string; plan: string };
  const { highlightId, platform, caption, scheduledAt } = await c.req.json();

  if (!highlightId || !platform) {
    return c.json({ error: 'Missing required fields: highlightId, platform' }, 400);
  }

  const validPlatforms = ['twitter', 'linkedin', 'threads', 'bluesky', 'mastodon'];
  if (!validPlatforms.includes(platform)) {
    return c.json({ error: `Invalid platform. Valid: ${validPlatforms.join(', ')}` }, 400);
  }

  const highlightResult = await neonQuery(
    `SELECT h.id, h.text, h.book_id, b.title as book_title
     FROM highlights h
     JOIN books b ON h.book_id = b.id
     WHERE h.id = $1 AND h.user_id = $2`,
    [highlightId, user.id]
  );

  if (highlightResult.rows.length === 0) {
    return c.json({ error: 'Highlight not found or access denied' }, 404);
  }

  const postId = crypto.randomUUID();
  const postContent = caption || `"${highlightResult.rows[0].text.substring(0, 200)}..." — from ${highlightResult.rows[0].book_title}`;

  await neonQuery(
    `INSERT INTO scheduled_posts (id, user_id, highlight_id, platform, content, status, scheduled_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, NOW())`,
    [postId, user.id, highlightId, platform, postContent, scheduledAt || null]
  );

  return c.json({
    success: true,
    postId,
    platform,
    content: postContent,
    status: scheduledAt ? 'scheduled' : 'draft'
  }, 201);
});

router.post('/posts/reading-update', async (c) => {
  const user = (c as any).get('user') as { id: string; email: string; role: string; plan: string };
  const { bookId, progress, platform, note } = await c.req.json();

  if (!bookId || progress === undefined || !platform) {
    return c.json({ error: 'Missing required fields: bookId, progress, platform' }, 400);
  }

  const bookResult = await neonQuery(
    `SELECT id, title, author, total_pages FROM books WHERE id = $1 AND user_id = $2`,
    [bookId, user.id]
  );

  if (bookResult.rows.length === 0) {
    return c.json({ error: 'Book not found or access denied' }, 404);
  }

  const book = bookResult.rows[0];
  const percentage = Math.round((progress / (book.total_pages || 100)) * 100);
  const content = note
    ? `📚 Reading "${book.title}" by ${book.author}. ${progress}/${book.total_pages || '?'} pages (${percentage}%). ${note}`
    : `📚 Reading "${book.title}" by ${book.author}. ${progress}/${book.total_pages || '?'} pages (${percentage}%) — great insights so far!`;

  const postId = crypto.randomUUID();
  await neonQuery(
    `INSERT INTO scheduled_posts (id, user_id, book_id, platform, content, status, post_type, created_at)
     VALUES ($1, $2, $3, $4, $5, 'draft', 'reading_update', NOW())`,
    [postId, user.id, bookId, platform, content]
  );

  return c.json({
    success: true,
    postId,
    content,
    book: { id: book.id, title: book.title, author: book.author },
    progress: { pages: progress, percentage }
  }, 201);
});

export default router;
