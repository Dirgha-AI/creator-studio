# Contributing to Creator Studio

Thanks for helping. Creator Studio is open-source creator monetization infrastructure.

## Before your first PR

Include in your PR description:
> I have read and agree to the Dirgha AI Contributor License Agreement
> at CLA.md, and I submit this Contribution under those terms.

## What belongs here

- New route files (new platform integrations, monetization models)
- Social platform adapters in `src/routes/social-integration.ts`
- Database schema improvements
- Auth middleware implementations (Supabase, Better-auth, Clerk, etc.)
- Payment provider integrations (Stripe, Razorpay, etc.)

## Pull requests

- Branch from `main`
- `npm run typecheck` — zero TypeScript errors
- One PR per concern
- Document new environment variables in README

## Questions

- Issues: https://github.com/dirghaai/creator-studio/issues
- Security: security@dirgha.ai
- General: team@dirgha.ai
