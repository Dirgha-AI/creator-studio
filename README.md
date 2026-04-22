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

## Sister projects in the Dirgha OS

This repo is one of five that make up the open-source surface of the Dirgha OS. Each repo stands on its own; together they compose a full stack for builders.

| Repo | What it does | License |
|---|---|---|
| [`dirgha-code`](https://github.com/dirghaai/dirgha-code) | Terminal-native AI coding agent. BYOK, 14 providers, 43 tools, fleet-mode multi-agent. | FSL-1.1-MIT |
| [`writer-studio`](https://github.com/dirghaai/writer-studio) | Backend API for writing — science, fiction, screenplays, research. Binder + AI research + RAG. | Apache-2.0 |
| [`abundance-protocol`](https://github.com/dirghaai/abundance-protocol) | DePIN for distributed AI inference. Peer-to-peer compute, Lightning settlement, on-chain governance. | Apache-2.0 |
| [`arniko`](https://github.com/dirghaai/arniko) | AI security scanning. 36 scanner adapters unified into one stream of typed findings. | Apache-2.0 |

Visit the umbrella org at [github.com/dirghaai](https://github.com/dirghaai) or the product site at [dirgha.ai](https://dirgha.ai).

## License

**Apache License 2.0** — free for any use: personal, commercial, research, hosted, redistributed. No hidden restrictions, no conversion clause. Full text in [`LICENSE`](./LICENSE).

**Dirgha LLC owns the “Dirgha” name, logo, and product family** as registered trademarks. The code is open — the brand isn't. Forks of this repository must rename the product and remove Dirgha branding before distribution. Reasonable nominative use (“a fork of Creator Studio”) is fine.

See [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md) for the full legal text. Related documents:

- [`SECURITY.md`](./SECURITY.md) — vulnerability disclosure policy.
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.
- [`SUPPORT.md`](./SUPPORT.md) — where to ask for help.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to send a PR.


## Contribute

- **Code** — fork, branch, PR against `main`. Recipes in [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- **Bugs** — file an issue using the [bug template](https://github.com/dirghaai/creator-studio/issues/new?template=bug.md).
- **Features** — file an issue using the [feature template](https://github.com/dirghaai/creator-studio/issues/new?template=feature.md).
- **Questions** — open a [Discussion](https://github.com/dirghaai/creator-studio/discussions) rather than an issue.
- **Security** — email `security@dirgha.ai`. Do NOT file a public issue for vulnerabilities.
- **Sponsor** — [dirgha.ai/contribute](https://dirgha.ai/contribute) · Lightning, GitHub Sponsors, OpenCollective.
- **First-time contributor?** Your first PR will ask you to sign the CLA (see [`CLA.md`](./CLA.md)). Small doc fixes don't need one.

## Links

| | |
|---|---|
| Website | [https://dirgha.ai/creator](https://dirgha.ai/creator) |
| Repository | [github.com/dirghaai/creator-studio](https://github.com/dirghaai/creator-studio) |
| Issues | [github.com/dirghaai/creator-studio/issues](https://github.com/dirghaai/creator-studio/issues) |
| Discussions | [github.com/dirghaai/creator-studio/discussions](https://github.com/dirghaai/creator-studio/discussions) |
| Security | `security@dirgha.ai` |
| Enterprise | `enterprise@dirgha.ai` |
| Press / general | `hello@dirgha.ai` |

---

**Creator Studio** is part of the Dirgha OS — open-source infrastructure for builders, shipped by a small bootstrapped team.

Built by [Dirgha LLC](https://dirgha.ai) in India. Open to the world.

Released under **Apache-2.0** · Copyright © 2026 Dirgha LLC · All third-party trademarks are property of their owners.

---

## 🌐 The Dirgha Ecosystem

**[Dirgha AI OS](https://github.com/Dirgha-AI/Rama-I-Dirgha-AI-OS)** — the agentic operating system. *Accelerate Abundance.*

| Repo | What it does |
|---|---|
| [Rama-I-Dirgha-AI-OS](https://github.com/Dirgha-AI/Rama-I-Dirgha-AI-OS) | Vision, architecture, and the Rama I sovereign compute challenge |
| [abundance-protocol](https://github.com/Dirgha-AI/abundance-protocol) | P2P compute mesh for distributed AI inference |
| [arniko](https://github.com/Dirgha-AI/arniko) | Security scanner and red-teaming agent |
| [dirgha-code](https://github.com/Dirgha-AI/dirgha-code) | Autonomous software engineering CLI (`@dirgha/cli`) |
| [creator-studio](https://github.com/Dirgha-AI/creator-studio) | AI-native media production workspace |
| [writer-studio](https://github.com/Dirgha-AI/writer-studio) | AI-native document workspace |
| [.github](https://github.com/Dirgha-AI/.github) | Org profile and community configuration |

- **Live platform:** [dirgha.ai/app](https://dirgha.ai/app) — chat, IDE, writer, research, library, marketplace, creator, education, manufacturing
- **Organization:** [github.com/Dirgha-AI](https://github.com/Dirgha-AI)
- **Partnerships:** [partner@dirgha.ai](mailto:partner@dirgha.ai)

*Dirgha — Accelerate Abundance. Built in India, for the world.*
