# Creator Studio

**Open-source creator monetization and social platform API.**

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-ec4899?style=flat-square)](https://dirgha.ai/contribute)

---

Creator Studio is the backend API for the Dirgha OS creator economy. 16 route files, pluggable auth, Postgres storage.

It handles the full creator lifecycle: monetize content, run campaigns, manage digital products and memberships, publish apps, integrate social platforms, and analyze audience engagement.

## What it does

| Module | Endpoint Prefix | Description |
|--------|----------------|-------------|
| **Campaigns** | `/api/creator/campaigns` | Brand campaign creation + creator discovery |
| **Marketplace** | `/api/creator/marketplace` | Creator marketplace listings |
| **Digital Products** | `/api/creator/products` | Sell digital downloads |
| **Memberships** | `/api/creator/memberships` | Subscription tiers |
| **Samples** | `/api/creator/samples` | Content sample management |
| **Reviews** | `/api/creator/reviews` | Creator review system |
| **Creator Apps** | `/api/creator/apps` | App publishing + discovery |
| **Creator Profile** | `/api/creator/profile` | Creator profile management |
| **Public Profile** | `/api/creator/profile-pub` | Public creator pages |
| **Dashboard** | `/api/creator/dashboard` | Revenue + analytics overview |
| **Social Integration** | `/api/creator/social` | Cross-platform post scheduling |
| **Newsletter** | `/api/creator/newsletter` | Newsletter content suggestions |
| **Writer Integration** | `/api/creator/writer` | Writer Studio content bridge |
| **Avatar Checkout** | `/api/creator/avatar` | AI avatar training checkout |
| **App Publisher** | `/api/creator/app-publisher` | App store publishing flow |

## Quick start

```bash
git clone https://github.com/dirghaai/creator-studio.git
cd creator-studio
npm install

# Required
export DATABASE_URL=postgres://user:pass@host:5432/creator

# Auth
export CREATOR_API_KEYS=key1,key2   # comma-separated allowlist
# or: CREATOR_OPEN=true             # open mode (no auth, dev only)

npm run dev
```

Server starts on port 3012 (override with `PORT=...`).

## Configuration

```bash
# Database
DATABASE_URL=postgres://...          # required

# Auth
CREATOR_API_KEYS=key1,key2,key3      # Bearer token allowlist
CREATOR_OPEN=true                    # disable auth (dev only)

# Payments
STRIPE_SECRET_KEY=sk_...             # Stripe for avatar training checkout
APP_URL=https://app.dirgha.ai        # redirect base for Stripe sessions

# Optional
PORT=3012                            # default port
```

## Auth

Default auth reads `CREATOR_API_KEYS`. Each request must include:

```http
Authorization: Bearer <api-key>
```

Or bypass with `CREATOR_OPEN=true` (for local dev only).

Replace `src/middleware/auth.ts` to wire in Supabase, Firebase, Better-auth, or any other system. The interface is minimal:

```typescript
export async function getUser(c: Context): Promise<AuthUser | null>
```

## Source structure

```
src/
├── server.ts              # Hono server + route registration
├── routes/                # 16 route files (one per domain)
│   ├── campaigns.ts       # Brand campaign + creator discovery
│   ├── creator-marketplace.ts  # Marketplace listings
│   ├── digital-products.ts     # Digital product sales
│   ├── memberships.ts     # Subscription tiers
│   ├── samples.ts         # Content samples
│   ├── reviews.ts         # Review system
│   ├── creator-apps.ts    # App management
│   ├── creator-profile.ts # Profile CRUD
│   └── ...                # 8 more
├── services/
│   ├── neon.ts            # Postgres connection pool
│   ├── redis-client.ts    # Redis client (stub for dev)
│   ├── credit-manager.ts  # Credit deduction hooks
│   ├── stripe.ts          # Stripe checkout
│   ├── content-repurposer.ts   # AI content repurposing
│   ├── hashtag-generator.ts    # Platform hashtag optimization
│   ├── timing-optimizer.ts     # Post timing AI
│   ├── trend-detector.ts       # Trend analysis
│   └── viral-predictor.ts      # Viral potential scoring
├── interfaces/
│   └── ContentTypes.ts    # Shared content type definitions
└── middleware/
    ├── auth.ts            # Auth (replace with your system)
```

## Development

```bash
npm install
npm run dev          # tsx watch src/server.ts (hot-reload)
npm run build        # tsc → dist/
npm run typecheck    # 0 errors
```

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md). New monetization adapters and social platform integrations are especially welcome.

## License

**Apache License 2.0.** Full text in [`LICENSE`](./LICENSE).

Commercial support, managed hosting, enterprise auth integrations: email `sales@dirgha.ai`.

## Security

Found a vulnerability? Email `security@dirgha.ai`. Do NOT open a public issue.

---

Built by Dirgha LLC. Part of the Dirgha OS writing platform.

Website: https://dirgha.ai/creator  
Issues: https://github.com/dirghaai/creator-studio/issues

Copyright 2026 Dirgha LLC.
