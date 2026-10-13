# MoltMoney — Premium Banking for AI Agents

MoltMoney is a banking platform designed exclusively for AI agents, and **Elio**
is the personal AI agent that uses it. Together they demonstrate agentic
commerce end-to-end: a chat agent that shops and pays through PayPal — with a
spending-policy engine and explicit human approval gating every money movement.

> **Built for the PayPal AI Hackathon** — the project meaningfully integrates
> the PayPal developer platform (Orders v2 in the **free sandbox**) and AI
> (LLM-driven agent + policy engine), developed significantly during the
> submission period.

```
┌──────────┐  chat/tasks  ┌──────────────┐  REST + agent keys + Sentinel  ┌────────────┐  Orders v2 (sandbox)  ┌──────────┐
│  Elio    │ ───────────▶ │  MoltMoney   │ ─────────────────────────────▶ │   PayPal   │ ────────▶ user approves
│ (agent)  │ ◀─────────── │  API + DB    │ ◀───────────────────────────── │  Sandbox   │            in sandbox,
└──────────┘  receipts    └──────────────┘  approval cards via dashboard/    └────────────┘          webhook,
                                        Telegram; policy verdicts, ledger,                                     capture
                                        PayPal webhooks + OAuth
```

- **Elio never sees PayPal credentials, card data, or webhooks.** MoltMoney owns
  all of it: OAuth tokens, `PayPal-Request-Id` idempotency, webhook
  verification, spending policy enforcement, and the ledger.
- Every money-moving action is **Sentinel-gated**: the agent asks, the policy
  engine classifies (allow / ask / deny), and the owner approves in the
  dashboard or Telegram before anything executes.

## Repository structure

This is an npm-workspaces + Turborepo monorepo:

```
moltmoney/
├── apps/
│   ├── api/          # Fastify API server (owner JWT + account-scoped agent keys)
│   ├── dashboard/    # Next.js owner dashboard (approvals, agents, cards, policies)
│   └── elio/         # Elio personal AI agent (Next.js 15) — MoltMoney connector,
│                     #   Sentinel policy engine, Telegram/chat surfaces
├── packages/
│   ├── database/     # Prisma ORM schema + migrations
│   └── shared/       # Shared types and utilities
└── scripts/
    ├── db.mjs        # Local PostgreSQL manager (no Docker needed)
    └── smoke.mjs     # End-to-end HTTP smoke test
```

## Prerequisites

- Node.js 20+
- npm 10+

**No Docker required.** PostgreSQL binaries are installed automatically via the
`embedded-postgres` npm package, and `npm run db:up` starts a real local
PostgreSQL server from them.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local PostgreSQL database

```bash
npm run db:up
```

Initialises a data directory at `.pgdata/` (gitignored), starts PostgreSQL on
**localhost:54329**, and creates the `moltmoney` database. Local auth is
`trust` — fine for local development only.

Stop it any time with `npm run db:down`; check it with `node scripts/db.mjs status`.

### 3. Set up environment variables

Copy the example environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
cp packages/database/.env.example packages/database/.env
```

The defaults in these templates match the database started in step 2.

By default the API uses the in-process **mock payment provider** — no PayPal
keys needed to run the full demo stack locally.

### 4. (Optional) PayPal Sandbox

To run real PayPal purchases instead of the mock provider, fill in
`apps/api/.env`:

```
PAYMENT_PROVIDER=paypal
PAYPAL_CLIENT_ID=<sandbox client id>      # developer.paypal.com → Apps & Credentials → Sandbox
PAYPAL_CLIENT_SECRET=<sandbox secret>
PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=<sandbox webhook id>
BASE_URL=http://localhost:3000
```

Only sandbox credentials belong here — the integrations are against the free
PayPal sandbox and move no real money.

### 5. Generate the Prisma client

```bash
npm run db:generate
```

### 6. Apply database migrations

```bash
npm run db:migrate:deploy
```

(To create a *new* migration while iterating, use `npm run db:migrate`.)

### 7. Start the development servers

```bash
npm run dev
```

This starts:

- API server on http://localhost:3000
- Owner dashboard on http://localhost:3001

### 8. (Optional) Run Elio

Elio is self-contained (SQLite — no extra database). From `apps/elio`:

```bash
cp .env.example .env    # then set LLM_PROVIDER / GEMINI_API_KEY and VAULT_SECRET
npm run dev             # http://localhost:3210
```

See [`apps/elio/README.md`](apps/elio/README.md) for full setup (LLM keys are
free-tier; no credit card needed). Connect Elio to MoltMoney by creating an
agent in the MoltMoney dashboard (it issues a one-time, account-scoped API key)
and setting `MOLTMONEY_API_URL` / `MOLTMONEY_API_KEY` / `MOLTMONEY_ACCOUNT_ID`
in `apps/elio/.env`. All money-moving Elio tools are Sentinel-gated and show
approval cards in the dashboard and Telegram.

## Demo walkthrough (what judges should run)

1. **Register an owner** at the dashboard (http://localhost:3001) and create an
   agent ("Elio") — copy its one-time API key.
2. **Fund the account** (Add Funds — in mock mode this is instant simulated
   money).
3. **Check Elio's spending policy** on the agent page: per-transaction limits,
   daily budgets, blocked categories, require-approval thresholds.
4. **Chatt with Elio** (http://localhost:3210) and ask it to buy something
   (e.g. "buy a $5 book from the bookstore"). Elio classifies it, checks the
   policy, and queues a **Sentinel approval**.
5. **Approve it** — the request appears as an approval card in the MoltMoney
   dashboard *and* is pushed to your connected Telegram with Approve/Decline
   buttons.
6. Once approved, MoltMoney creates the PayPal order (sandbox), you approve at
   the sandbox checkout, MoltMoney captures the payment, and the receipt lands
   back in the chat. The transaction shows in the dashboard ledger with the
   PayPal order id.

## Available scripts

- `npm run dev` — start API + dashboard in development mode
- `npm run build` — build all apps and packages
- `npm run test` — run tests across all workspace packages
- `npm run lint` / `npm run format` — code quality
- `npm run db:up|down|status|reset` — embedded local PostgreSQL lifecycle
- `npm run db:generate|db:migrate|db:migrate:deploy` — Prisma client + migrations
- `npm run db:studio` — Prisma Studio
- `npm run docker:up|docker:down` — alternative PostgreSQL via Docker Compose

## Running tests without Docker

```bash
npm run db:up
npm run db:migrate:deploy   # first run only
npm run test
```

`apps/elio` has its own suite (SQLite, no server needed): `cd apps/elio && npm test`.

## Technology stack

**Backend** — Fastify, TypeScript (strict), PostgreSQL + Prisma, JWT (owners) +
account-scoped API keys (agents), WebSocket, PayPal Orders v2 (sandbox).
**Frontend** — Next.js 14 (App Router) + Tailwind + shadcn/ui (dashboard);
Next.js 15 + Tailwind 4 (Elio). **Agent** — Sentinel policy engine, AES-256-GCM
credential vault (surrogation), Playwright browser sub-agent. **Monorepo** —
Turborepo, Vitest, ESLint + Prettier.

## License

MIT — see [LICENSE](LICENSE).
