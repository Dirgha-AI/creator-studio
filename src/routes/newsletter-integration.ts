import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';

const router = new Hono();
router.use('*', authMiddleware);

router.get('/suggestions', async (c) => {
  const user = (c as any).get('user') as { id: string; email: string; role: string; plan: string };
  const timeframe = c.req.query('timeframe') || '30 days';

  const booksResult = await neonQuery(
    `SELECT b.id, b.title, b.author, h.highlight_count, h.last_highlight_at
     FROM books b
     LEFT JOIN (
       SELECT book_id, COUNT(*) as highlight_count, MAX(created_at) as last_highlight_at
       FROM highlights WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${timeframe}'
       GROUP BY book_id
     ) h ON h.book_id = b.id
     WHERE b.user_id = $1 AND (h.highlight_count > 0 OR b.updated_at > NOW() - INTERVAL '${timeframe}')
     ORDER BY h.last_highlight_at DESC NULLS LAST, b.updated_at DESC LIMIT 5`,
    [user.id]
  );

  const suggestions: any[] = booksResult.rows.map(book => ({
    type: 'book_review',
    title: `Newsletter: ${book.title}`,
    subtitle: `Key insights from ${book.author}`,
    bookId: book.id,
    highlightCount: book.highlight_count || 0,
    angle: book.highlight_count > 5 ? 'deep_dive' : 'quick_review'
  }));

  const notesResult = await neonQuery(
    `SELECT COUNT(*) as total, string_agg(DISTINCT topic, ', ') as topics
     FROM reading_notes WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${timeframe}'`,
    [user.id]
  );

  if (parseInt(notesResult.rows[0]?.total || '0') > 3) {
    suggestions.push({
      type: 'reading_roundup',
      title: 'Monthly Reading Roundup',
      subtitle: `Collection of ${notesResult.rows[0].total} notes`,
      angle: 'roundup'
    });
  }

  return c.json({ suggestions, timeframe, generatedAt: new Date().toISOString() });
});

router.post('/generate-from-reading', async (c) => {
  const user = (c as any).get('user') as { id: string; email: string; role: string; plan: string };
  const { bookIds, newsletterTitle, tone = 'curious', sections = ['summary', 'highlights', 'reflection'] } = await c.req.json();

  if (!bookIds || !Array.isArray(bookIds) || bookIds.length === 0) {
    return c.json({ error: 'Missing required field: bookIds (array)' }, 400);
  }

  const highlightsResult = await neonQuery(
    `SELECT h.text, h.note, h.created_at, b.title, b.author
     FROM highlights h JOIN books b ON h.book_id = b.id
     WHERE h.user_id = $1 AND h.book_id = ANY($2::uuid[])
     ORDER BY h.created_at DESC LIMIT 20`,
    [user.id, bookIds]
  );

  if (highlightsResult.rows.length === 0) {
    return c.json({ error: 'No highlights found for selected books' }, 404);
  }

  const newsletterId = crypto.randomUUID();
  const title = newsletterTitle || `Reading Notes: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  const uniqueTitles = [...new Set(highlightsResult.rows.map(h => h.title))];

  const content = {
    title,
    introduction: `Generated from ${highlightsResult.rows.length} highlights across ${bookIds.length} book(s).`,
    sections: sections.map((section: string) => ({
      type: section,
      content: section === 'highlights'
        ? highlightsResult.rows.slice(0, 5).map((h: any) => `"${h.text.substring(0, 150)}..." — ${h.title}`)
        : section === 'summary' ? `Exploring themes from ${uniqueTitles.join(', ')}` : 'Reflections...'
    })),
    tone,
    sources: highlightsResult.rows.map((h: any) => ({ title: h.title, author: h.author })).filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.title === v.title) === i)
  };

  await neonQuery(
    `INSERT INTO newsletters (id, user_id, title, content, status, source_books, created_at)
     VALUES ($1, $2, $3, $4, 'draft', $5, NOW())`,
    [newsletterId, user.id, title, JSON.stringify(content), bookIds]
  );

  return c.json({ success: true, newsletterId, title, highlightCount: highlightsResult.rows.length, sections: sections.length, status: 'draft' }, 201);
});

export default router;
