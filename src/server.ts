import { Hono } from 'hono';
import { serve } from '@hono/node-server';

import { appPublisherRouter } from './routes/app-publisher';
import avatarCheckout from './routes/avatar-checkout';
import campaigns from './routes/campaigns';
import { creatorAppsExtRouter, creatorAppsBrowseRouter } from './routes/creator-apps-ext';
import { creatorAppsRouter } from './routes/creator-apps';
import creatorDashboard from './routes/creator-dashboard';
import creatorMarketplace from './routes/creator-marketplace';
import { creatorProfilePubRouter } from './routes/creator-profile-pub';
import { creatorProfileRouter } from './routes/creator-profile';
import { digitalProductsRouter } from './routes/digital-products';
import { membershipsRouter } from './routes/memberships';
import newsletterIntegration from './routes/newsletter-integration';
import reviews from './routes/reviews';
import samples from './routes/samples';
import socialIntegration from './routes/social-integration';
import writerIntegration from './routes/writer-integration';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok', service: 'creator-studio' }));

app.route('/api/creator/app-publisher', appPublisherRouter);
app.route('/api/creator/avatar', avatarCheckout);
app.route('/api/creator/campaigns', campaigns);
app.route('/api/creator/apps-ext', creatorAppsExtRouter);
app.route('/api/creator/apps-browse', creatorAppsBrowseRouter);
app.route('/api/creator/apps', creatorAppsRouter);
app.route('/api/creator/dashboard', creatorDashboard);
app.route('/api/creator/marketplace', creatorMarketplace);
app.route('/api/creator/profile-pub', creatorProfilePubRouter);
app.route('/api/creator/profile', creatorProfileRouter);
app.route('/api/creator/products', digitalProductsRouter);
app.route('/api/creator/memberships', membershipsRouter);
app.route('/api/creator/newsletter', newsletterIntegration);
app.route('/api/creator/reviews', reviews);
app.route('/api/creator/samples', samples);
app.route('/api/creator/social', socialIntegration);
app.route('/api/creator/writer', writerIntegration);

const port = parseInt(process.env.PORT || '3012', 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[Creator Studio] Listening on port ${port}`);
});

export default app;
