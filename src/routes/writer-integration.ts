import { Hono } from 'hono';
import { authMiddleware, getUser } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';

const router = new Hono();

router.use('*', authMiddleware);

router.post('/drafts/from-book', async (c) => {
  const user = (c as any).get('user') as { id: string; email: string; role: string; plan: string };
  const { bookId, title, format = 'article', tone = 'professional' } = await c.req.json();

  if (!bookId || !title) {
    return c.json({ error: 'Missing required fields: bookId, title' }, 400);
  }

  const bookResult = await neonQuery(
    `SELECT id, title, author, highlights_count FROM books WHERE id = $1 AND user_id = $2`,
    [bookId, user.id]
  );

  if (bookResult.rows.length === 0) {
    return c.json({ error: 'Book not found or access denied' }, 404);
  }

  const draftId = crypto.randomUUID();
  await neonQuery(
    `INSERT INTO writer_drafts (id, user_id, book_id, title, format, tone, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
    [draftId, user.id, bookId, title, format, tone]
  );

  return c.json({
    success: true,
    draftId,
    message: `Draft '${title}' created from book '${bookResult.rows[0].title}'`,
    status: 'pending'
  }, 201);
});

router.get('/drafts/book-suggestions', async (c) => {
  const user = (c as any).get('user') as { id: string; email: string; role: string; plan: string };
  const limit = Math.min(parseInt(c.req.query('limit') || '5'), 10);

  const booksResult = await neonQuery(
    `SELECT b.id, b.title, b.author, COUNT(h.id) as highlight_count
     FROM books b
     LEFT JOIN highlights h ON h.book_id = b.id AND h.user_id = b.user_id
     WHERE b.user_id = $1 AND b.status IN ('reading', 'completed')
     GROUP BY b.id, b.title, b.author
     HAVING COUNT(h.id) > 0
     ORDER BY b.updated_at DESC
     LIMIT $2`,
    [user.id, limit]
  );

  const suggestions = booksResult.rows.map(book => ({
    bookId: book.id,
    title: book.title,
    author: book.author,
    highlightCount: book.highlight_count,
    ideas: [
      `Article: Key lessons from "${book.title}"`,
      `Deep dive: ${book.author}'s methodology`,
      `Comparison: ${book.title} and related works`,
      `Summary: Essential takeaways from "${book.title}"`
    ]
  }));

  return c.json({ suggestions, count: suggestions.length });
});

export default router;
