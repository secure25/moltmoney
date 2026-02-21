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
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker and Docker Compose
- PostgreSQL 15+ (via Docker)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Start PostgreSQL Database

```bash
npm run docker:up
```

### 3. Set Up Environment Variables

Copy the example environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
```

### 4. Generate Prisma Client

```bash
npm run db:generate
```

### 5. Run Database Migrations

```bash
npm run db:migrate
```

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
- `npm run test` - Run tests across all packages
- `npm run lint` - Lint all code
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start PostgreSQL container
- `npm run docker:down` - Stop PostgreSQL container
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio

## Technology Stack

### Backend
- **Framework**: Fastify
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 15
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

1. **Backend API** - RESTful API with WebSocket support for real-time events
2. **Frontend Dashboard** - Owner interface for managing agents and viewing transactions
3. **Mock Payment Provider** - Internal module simulating card issuer functionality

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

### Create Migration
```bash
npm run db:migrate
```

### Reset Database
```bash
docker-compose down -v
docker-compose up -d
npm run db:migrate
```

## License

Private - All Rights Reserved
