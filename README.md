# MoltMoney - AI Agent Banking Platform

An ultra-premium banking system designed exclusively for AI agents and AI assistants.

## Project Structure

This is a Turborepo monorepo containing:

```
moltmoney/
├── apps/
│   ├── api/          # Fastify API server
│   └── dashboard/    # Next.js owner dashboard
├── packages/
│   ├── database/     # Prisma ORM and database layer
│   └── shared/       # Shared types and utilities
└── scripts/
    ├── db.mjs        # Local PostgreSQL manager (no Docker needed)
    └── smoke.mjs     # End-to-end HTTP smoke test
```

Agent-side clients (OpenClaw skills and chat-agent connectors) live in
their own repos; this hub ships only the API + dashboard. Agents
authenticate with the account-scoped API key shown once when the agent
is created in the dashboard. Reference client integrations:
- Elio (chat agent): github.com/secure25/elio — MoltMoney connector for
  PayPal purchases, internal transfers, cards, payouts and
  payment-requests, all human-approval gated.

## Prerequisites

- Node.js 20+
- npm 10+

**No Docker required.** PostgreSQL binaries are installed automatically via the
`embedded-postgres` npm package, and `npm run db:up` starts a real local
PostgreSQL server from them.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Local PostgreSQL Database

```bash
npm run db:up
```

This initialises a data directory at `.pgdata/` (gitignored), starts PostgreSQL
on **localhost:54329** (so it never clashes with a system Postgres), and creates
the `moltmoney` database. Local auth is `trust`, meaning any password in the
connection URL is accepted — fine for local development only.

Stop it any time with `npm run db:down`; check it with `npm run db:status`.

### 3. Set Up Environment Variables

Copy the example environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
cp packages/database/.env.example packages/database/.env
```

The defaults in these templates match the database started in step 2.

### 4. Generate Prisma Client

```bash
npm run db:generate
```

### 5. Apply Database Migrations

```bash
npm run db:migrate:deploy
```

This applies all existing migrations non-interactively. (To create a *new*
migration while iterating on the schema, use `npm run db:migrate`.)

### 6. Start Development Servers

```bash
npm run dev
```

This will start:
- API server on http://localhost:3000
- Dashboard on http://localhost:3001

## Available Scripts

- `npm run dev` - Start all apps in development mode
- `npm run build` - Build all apps and packages
- `npm run test` - Run tests across all packages (uses the local database)
- `npm run lint` - Lint all code
- `npm run format` - Format code with Prettier
- `npm run db:up` - Start the embedded local PostgreSQL (no Docker)
- `npm run db:down` - Stop the embedded local PostgreSQL
- `npm run db:status` - Check whether the local PostgreSQL is running
- `npm run db:reset` - Stop the database and wipe its data directory
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run interactive migrations (schema development)
- `npm run db:migrate:deploy` - Apply existing migrations (local setup, CI)
- `npm run db:studio` - Open Prisma Studio
- `npm run docker:up` / `docker:down` - Alternative: PostgreSQL via Docker Compose

## Running Tests Without Docker

The test suite (Vitest) talks to a real PostgreSQL database through
`DATABASE_URL`. With the embedded database this is fully local:

```bash
npm run db:up
npm run db:migrate:deploy   # first run only
npm run test
```

Tests clean up their data after each run, so the database stays usable for
development afterwards.

## Technology Stack

### Backend
- **Framework**: Fastify
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL (local via `embedded-postgres`, or Docker)
- **ORM**: Prisma
- **Authentication**: JWT (owners) + API Keys (agents)
- **Real-time**: WebSocket

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui

### Development
- **Monorepo**: Turborepo
- **Code Quality**: ESLint + Prettier
- **Testing**: Vitest + fast-check (property-based testing)

## Architecture

The platform consists of three main components:

1. **Backend API** - RESTful API with WebSocket support for real-time events. Two auth realms: owner JWT (dashboard) and agent API keys (money operations). Card issuing/freeze/cancel and fund-request approval are owner-token only by design.
2. **Frontend Dashboard** - Owner interface for managing agents, viewing transactions, approving held payments/fund requests and issuing cards
3. **Payment providers** - `mock` (default) or PayPal Sandbox (`PAYMENT_PROVIDER=paypal`); provider is swappable behind a common interface
4. **Smoke test** - `scripts/smoke.mjs` drives the full register→fund→pay→transfer→freeze flow over real HTTP

## Development Workflow

1. Make changes to code
2. Run `npm run lint` to check for issues
3. Run `npm run format` to format code
4. Run `npm run test` to verify tests pass
5. Commit changes

## Database Management

### View Database
```bash
npm run db:studio
```

### Reset Database (destroys local data)
```bash
npm run db:reset
npm run db:up
npm run db:migrate:deploy
```

### Docker alternative

If you prefer Docker for PostgreSQL:

```bash
docker-compose up -d
# point DATABASE_URL at postgresql://moltmoney:moltmoney_dev_password@localhost:5432/moltmoney
npm run db:migrate:deploy
```

## License

Private - All Rights Reserved
