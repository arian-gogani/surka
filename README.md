# Surka

[![CI](https://github.com/arian-gogani/surka/actions/workflows/ci.yml/badge.svg)](https://github.com/arian-gogani/surka/actions/workflows/ci.yml)
[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0-blue.svg)](LICENSE)

[![Surka: partner swaps that actually happen](https://surka.vercel.app/opengraph-image)](https://surka.vercel.app)

**Partner swaps that actually happen.** Two founders agree to promote each other, and Surka helps run the swap from yes to results: the terms, the deadlines, follow-up, a check that each side delivered, and what the swap produced. During the first pilot, follow-up is manual; automated email delivery has not been verified in production.

[**Live site**](https://surka.vercel.app) · [How a swap runs](#how-a-swap-runs) · [Run it locally](#quick-start)

No database to install and no accounts to create. It runs locally on Postgres compiled to WebAssembly, the integration tests run against a real Postgres in memory, and every form works with JavaScript turned off.

This repository is Phase 1 of the [master plan](#where-this-fits): the deal sheet and the swap runner, built to make the manual pilot faster. You, the operator, still decide every swap; the software holds the terms, chases deadlines, checks proof, and keeps score.

## How a swap runs

1. **Create it.** In the operator dashboard, add the two businesses and write what each gives and by when. Both sides must give something, or Surka refuses the swap: no trade, no swap.
2. **Send it.** Each side gets a private link, with no account needed. Send the partner theirs, then mark the swap as sent.
3. **The partner answers.** Their link shows the deal sheet: both sides of the trade, meeting in the middle, with each side's track record. They accept, suggest changes, or decline. A counter reopens the terms for you to rework and send again.
4. **Both sides deliver.** Each side marks its own commitments delivered, with a link that proves it, like the newsletter archive or the live listing. The cron computes who is due three days and one day before each deadline, and once if it's overdue. Delivery needs `RESEND_API_KEY` and `EMAIL_FROM`. Without them the reminder is written to the server log and stays due rather than being marked sent, so nothing is lost by turning email on later.
5. **You check it.** Mark each commitment kept or missed against its proof. When everything is checked, the swap completes on its own.
6. **Everyone sees the result.** Tracking links count clicks for each placement, and either side can report installs or signups. Results are shared only between the two sides.

Reputation counts **commitments kept, never results**: a partner controls whether they deliver, not whether an audience clicks. Old outcomes fade with a 180-day half-life, so one bad swap doesn't follow anyone forever.

## Quick start

Requires Node 20 or newer. No database to install: locally, Surka runs on [PGlite](https://pglite.dev), real Postgres compiled to WebAssembly, stored in `./.pglite`.

```bash
npm install
cp .env.example .env.local   # then set ADMIN_PASSWORD and SESSION_SECRET
npm run db:seed              # optional: three demo swaps at different stages
npm run dev
```

Open http://localhost:3000 for the landing page, and http://localhost:3000/admin for the operator dashboard. The seed script prints private links for each demo swap.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript, strict mode |
| `npm test` | Unit tests for the rules, plus integration tests against an in-memory Postgres |
| `npm run smoke` | Starts the production build and runs a whole swap through the real forms. Run `npm run build` first. |
| `npm run db:generate` | New migration from changes to `src/db/schema.ts` |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL` |
| `npm run db:seed` | Demo data, only into an empty database |

## Deploying

Surka runs on Vercel with a hosted Postgres. Every deploy applies any new database migrations before building (`npm run vercel-build`), so the database never falls behind the code.

1. **Create the project.** Import the GitHub repository in Vercel, or run `vercel link` in this folder.
2. **Connect a database.** In the Vercel project, open Storage, choose Create Database, and pick Neon. Vercel's own Postgres product was retired, so Postgres now comes from the Marketplace; Neon is the serverless Postgres that replaced it. Vercel adds `DATABASE_URL` to the project for you.
3. **Set the secrets.** Run `npm run setup:vercel` yourself. It generates the session and cron secrets, sets a random operator password, and shows that password once.
4. **Deploy.** Push to `main`, or run `vercel deploy --prod`. The daily reminder job in `vercel.json` starts with the first production deploy, and Vercel Cron sends `CRON_SECRET` as a bearer token automatically.

Without `DATABASE_URL`, a Vercel deployment refuses to start and says why, instead of falling back to a local database that can't work there.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | In production | Postgres connection string. Empty means local PGlite. |
| `APP_URL` | No | Public URL for links and emails. Defaults to the Vercel production domain; set it for a custom domain. |
| `ADMIN_PASSWORD` | Yes | Operator dashboard password |
| `SESSION_SECRET` | Yes | 16+ random characters for signing the operator session |
| `CRON_SECRET` | Yes | Protects `/api/cron/reminders` |
| `PREVIEW_DATABASE_URL` | On Vercel previews | A Neon branch for preview deployments. The Neon integration scopes one `DATABASE_URL` to both Preview and Production, so without this a preview reads and writes live swaps. Previews refuse to start without it; set `ALLOW_PRODUCTION_DB_IN_PREVIEW=1` to override on purpose. |
| `RESEND_API_KEY`, `EMAIL_FROM` | To send any reminder | Both, or neither. `EMAIL_FROM` must be on a domain you've verified with Resend. Without them, reminders print to the server log, stay due, and the cron answers 503. |
| `CONTACT_EMAIL` | No | Where "Run your first swap" on the landing page goes |

## How it's built

- **Next.js 15** App Router with server components and server actions. Every form works without JavaScript.
- **Drizzle ORM** over Postgres in production and PGlite locally and in tests, through one schema and one set of migrations (`src/db`).
- **A pure rules layer** (`src/lib/swap-rules.ts`, `reputation.ts`, `reminders.ts`) with no database or framework code, so the rules are easy to read and test.
- **A service layer** (`src/lib/services`) that validates every input with Zod and writes every change to an append-only timeline. Pages and actions call services; services never import Next.js.
- **Private links, not accounts.** Each side's link carries a 144-bit random token. Swap pages are excluded from search engines and never leak through the Referer header.
- **Operator auth** is a password plus an expiring session cookie signed with HMAC-SHA256, checked in middleware and again in every operator action.

```
src/
  app/                 pages, server actions, the tracking redirect, the reminder cron
  components/          logo, deal sheet, form and status components
  db/                  schema and the Postgres/PGlite client
  lib/                 rules, validation, sessions, email
  lib/services/        swaps, metrics, reminders
drizzle/               SQL migrations
scripts/               migrate, seed, end-to-end smoke test
tests/                 unit and integration tests
```

## Where this fits

| Phase | What it is | Gate to the next |
| --- | --- | --- |
| 0. Manual pilot | Five swaps run by hand | 3 of 5 swaps on time, 3 of 5 founders want another |
| **1. Deal sheet and runner (this code)** | Deal sheets, reminders, proof, results, and the pilot scoreboard | 10 more swaps, with operator time per swap cut in half |
| 2. The agent | AI drafts terms and copy from a link, chases both sides, suggests partners | Swaps finish without the operator, and the first founder pays |
| 3. The network | Reputation from kept commitments, suggestions from real results, billing | New founders arrive through deal sheets |

The dashboard tracks the Phase 0 and 1 numbers directly: completed swaps, the on-time rate, the share of partners who accept, operator minutes per swap, and businesses that come back for another.
