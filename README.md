# MoltMoney — PayPal-native banking for AI agents

**PayPal is the payment rail this product is built on, not an integration bolted on
at the end.** Every purchase an AI agent makes is a **PayPal order**: MoltMoney
creates it with the **Orders v2 API** in the **sandbox**, the human approves it on
PayPal's own checkout page, MoltMoney captures it, and every PayPal webhook is
signature-verified before it can touch the ledger. **Elio** is the AI agent that
decides what to buy and asks first; **MoltMoney** is the policy, approval and ledger
layer that owns the PayPal relationship.

> **Built for the PayPal AI Hackathon.** The PayPal developer platform is the core
> of the project, not a proof of concept beside it, and it is developed against the
> free **sandbox** — no real money moves anywhere in this repo.

## What we actually use from PayPal

| PayPal capability | How this project uses it |
|---|---|
| **Orders v2 — create** (`POST /v2/checkout/orders`) | Every agent purchase becomes a real PayPal order; `PayPal-Request-Id` carries our transaction id so retries can never double-charge |
| **PayPal-hosted checkout** | The payer approves with a sandbox account — the agent never handles card data or credentials |
| **Orders v2 — capture** (`POST /v2/checkout/orders/{id}/capture`) | MoltMoney captures only after approval, then writes the ledger entry |
| **Webhooks** (`PAYMENT.CAPTURE.*`, `CHECKOUT.ORDER.APPROVED`) | Verified with `POST /v1/notifications/verify-webhook-signature`, deduplicated and reconciled — the webhook, not the HTTP response, is the source of truth |
| **OAuth 2.0 client credentials** | Tokens are fetched, cached in memory and refreshed before expiry; never persisted or returned to a client |
| **Sandbox environment** | All of the above runs against `https://api-m.sandbox.paypal.com` |

Code: [`providers/paypal/paypal-client.ts`](apps/api/src/providers/paypal/paypal-client.ts) ·
[`providers/paypal/paypal-payment-provider.ts`](apps/api/src/providers/paypal/paypal-payment-provider.ts) ·
[`routes/paypal-webhook.routes.ts`](apps/api/src/routes/paypal-webhook.routes.ts) ·
[`routes/payment.routes.ts`](apps/api/src/routes/payment.routes.ts)

## The PayPal loop, in four moves

1. **Elio (AI) asks.** "Buy the $25 hardcover from the bookstore." A LLM-driven agent
   turns the request into a tool call — it never sees PayPal credentials, card data or
   webhooks.
2. **MoltMoney decides.** The policy engine (per-transaction limit, daily budget,
   blocked categories, approval threshold) classifies the request as allow / ask /
   deny. Anything above the threshold becomes a **Sentinel approval** in the dashboard.
3. **PayPal creates the order.** MoltMoney calls Orders v2 and gets back the PayPal order
   id plus the `sandbox.paypal.com/checkoutnow?token=…` approval URL. The owner clears
   the MoltMoney hold, then the payer approves on PayPal's own page.
4. **Capture + webhook close the loop.** MoltMoney captures the order, verifies the
   signed PayPal webhook, settles the ledger and the receipt lands back in Elio's chat.

## Demo accounts (judges — no setup needed)

| App | URL | How to get in |
|---|---|---|
| **MoltMoney dashboard** (approvals, agents, policy, ledger) | <https://moltmoneydashboard-production.up.railway.app> | Click **Explore the demo account** on the sign-in page — or sign in manually with `demo@moltmoney.dev` / `DemoJudge2026!` |
| **Elio** (the AI agent) | <https://elio-production-9b75.up.railway.app/landing> | Same credentials: `demo@moltmoney.dev` / `DemoJudge2026!` (or create your own account) |

Both demos use the same login and are wired to the **same demo money account** — the
`Elio` agent account with a $100/day, $60/transaction policy, approval above $20 and
`gambling`/`crypto` blocked. The demo already contains a completed $12 book purchase and
one **PayPal order waiting for your approval**, so the whole loop can be exercised in
under a minute.

**Telegram is optional.** Approval cards appear in the MoltMoney dashboard by default; a
Telegram bot only *adds* a second place to approve from. Nothing in the demo requires it.

### How the PayPal payment is approved — the two gates

A purchase needs **two separate approvals**, and both are PayPal-shaped:

| Gate | Who approves | Where | What it gates |
|---|---|---|---|
| **1. Owner approval (Sentinel)** | The demo owner | MoltMoney → **Approvals** | Whether the spend is allowed at all. Until it is approved, `capture` is refused server-side (`approvalRequired && !approvedAt`). |
| **2. PayPal payer approval** | The buyer, on PayPal's own page | `sandbox.paypal.com/checkoutnow?token=…` | Whether PayPal releases the money. PayPal rejects capture of an unapproved order. |

**An approval-pending purchase already has a PayPal order.** The policy engine runs
first: a **deny** (blocked category, over the per-transaction limit, over the daily
budget) stops the request before PayPal is ever called. An **ask** verdict — the usual
"above $20" case — still creates the Orders v2 order, and only the *capture* is held
until the owner approves. That is why the approval URL exists while the spend is still
pending, and it appears in **two places**:

- in **Elio's chat reply** (`NEXT STEP — open this PayPal approval URL…`), and
- on the **Approvals** page in the dashboard, as a **Pay on PayPal** button on the review
  card (shown whenever the transaction has a PayPal order behind it).

**You need a PayPal sandbox buyer account to clear gate 2.** That is PayPal's login
screen, not ours — there is no way to approve a hosted-checkout order without signing in
as the payer. Sandbox buyer accounts are disposable and hold no real money:

- **Make one (30 seconds):** <https://developer.paypal.com/dashboard/accounts> →
  **Sandbox** → **Create account** → type **Personal** → then sign in with those
  credentials on the PayPal page. Sandbox buyers are fake: no card, no real money.
- Sandbox buyer logins are disposable test credentials, safe to publish in a submission
  or hand to a judge — they expose no real account and move no real money.

With no sandbox buyer at all, the loop still works up to gate 2: the order is created, the
approval URL loads PayPal's login page, and the dashboard shows the PENDING transaction
with its PayPal order id. Capture only succeeds after a payer approves.

### What is real and what is simulated

| Real | Simulated |
|---|---|
| **PayPal sandbox Orders v2** — create, capture, webhooks, OAuth tokens, signature verification | Account balances and the $12/$25 amounts (play money, no real funds) |
| PayPal order ids, approval URLs, capture ids and webhook event ids on the ledger | Merchants (`Corner Bookstore`) and the agents' identities |
| The owner-approval gate blocking `capture` server-side | Telegram delivery (optional, off by default) |

Nothing in this repo touches a live PayPal account or moves real money.

## Live demo (no install)

- **MoltMoney dashboard** — <https://moltmoneydashboard-production.up.railway.app>
- **Elio** — <https://elio-production-9b75.up.railway.app/landing>

The hosted MoltMoney API runs against the PayPal **sandbox** (`PAYMENT_PROVIDER=paypal`,
`https://api-m.sandbox.paypal.com`); Elio talks to MoltMoney, never to PayPal. Prefer to
run everything yourself? The quickstart below needs no Docker, no PayPal keys and no paid
services.

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

## Demo walkthrough — the PayPal path (60 seconds)

Run this against the hosted demo or a local stack; the steps are identical.

1. **Open the dashboard** <https://moltmoneydashboard-production.up.railway.app> and
   click **Explore the demo account**. You land on the ledger with a completed
   purchase and one pending PayPal order.
2. **See the policy in action.** Open the **Elio** agent: $100/day, $60/transaction,
   approval above $20, `gambling` and `crypto` blocked. This is the gate that sits in
   front of PayPal.
3. **Open Approvals.** The pending card is a live **PayPal sandbox order**: it shows the
   `Pay on PayPal` button and the PayPal order id, because MoltMoney already called
   `POST /v2/checkout/orders` when Elio asked to buy the book. Approve it here to clear
   gate 1 — MoltMoney's own hold — which is what unlocks `capture`.
4. **Clear gate 2 on PayPal.** Click **Pay on PayPal** (`sandbox.paypal.com/checkoutnow?token=…`)
   and sign in with a **sandbox Personal** account (see above to make one in 30s). Click
   through the sandbox checkout to approve. This is PayPal's own page and PayPal's own
   approval — nothing about it is mocked.
5. **Capture and settle.** Open the transaction in **Transactions** and press
   **Capture payment** (or tell Elio to capture it, or
   `POST /payments/paypal/orders/{id}/capture`). MoltMoney calls Orders v2 capture,
   PayPal reports `PAYMENT.CAPTURE.COMPLETED` on the signed webhook, and the row turns
   `COMPLETED` with the PayPal order id and capture id on the ledger. The webhook — not
   the HTTP response — is treated as the source of truth, so a duplicate delivery cannot
   settle twice.
6. **Call it from the API**, exactly like an agent would:

   ```bash
   curl -X POST https://moltmoneyapi-production.up.railway.app/payments/paypal/orders \
     -H "Authorization: Bearer <agent API key>" -H "Content-Type: application/json" \
     -d '{"amount":"5.00","merchantName":"Sandbox Bookstore","merchantCategory":"books"}'
   # → 201 { orderId, approvalUrl, state: "WAITING_FOR_PAYER_APPROVAL" }
   ```

   Swap the PayPal keys in `apps/api/.env` for your own sandbox app to create orders
   under your merchant account; `PAYMENT_PROVIDER=mock` (the local default) produces
   the same state machine without calling PayPal.

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
