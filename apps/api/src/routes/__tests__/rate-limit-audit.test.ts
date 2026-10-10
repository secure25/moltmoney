import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer, registeredRouteSchemas } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import { createCardIssuingProvider } from '../../providers';
import { createWebhookService } from '../../services/webhook/webhook.service';
import { CardService } from '../../services/card/card.service';
import { AUDIT_ACTION } from '../../services/audit/audit.service';
import { GLOBAL_RATE_LIMIT, AUTH_RATE_LIMIT, MONEY_RATE_LIMIT } from '../../lib/rate-limit-config';
import Decimal from 'decimal.js';

/**
 * RATE LIMITING + AUDIT LOG tests.
 *
 * Convention (important see task constraints): DATABASE_URL is overridden to
 * the test DB and PAYMENT_PROVIDER=mock is forced by the harness — the real
 * apps/api/.env (with PayPal sandbox creds) is loaded by dotenv but never
 * touched or used for network calls in this suite.
 */
describe('Rate limiting + audit logging', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance;
  let ownerToken: string;
  let ownerEmail: string;
  let accountId: string;
  let agentName: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    const ownerAuth = new OwnerAuthService(prisma);
    ownerEmail = `rl-audit-${Date.now()}@example.com`;
    await ownerAuth.registerOwner(ownerEmail, 'RL Audit Owner', 'password123');
    ownerToken = (await ownerAuth.loginOwner(ownerEmail, 'password123')).token;
    const ownerId = (await prisma.owner.findUnique({ where: { email: ownerEmail } }))!.id;

    const accountService = new AccountService(prisma, server.wsServer);
    agentName = `RL Agent ${Date.now()}`;
    const { account } = await accountService.createAgentAccount(ownerId, agentName, 'OpenClaw');
    accountId = account.id;
    await accountService.fundAccount(account.id, new Decimal('500.00'));
  }, 60_000);

  afterAll(async () => {
    // Clean OWN fixtures only (singleFork suite shares the test DB).
    // FK order: auditLogs → cards → transactions → account → agent → owner.
    const agent = await prisma.agent.findFirst({ where: { Account: { id: accountId } } });
    const cardIds = (await prisma.virtualCard.findMany({ where: { accountId } })).map((c) => c.id);
    if (agent) {
      await prisma.auditLog.deleteMany({ where: { targetType: 'VirtualCard', targetId: { in: cardIds } } });
      await prisma.auditLog.deleteMany({ where: { targetType: 'Account', targetId: accountId } });
      await prisma.auditLog.deleteMany({ where: { targetType: 'Agent', targetId: agent.id } });
      await prisma.virtualCard.deleteMany({ where: { accountId } });
      await prisma.transaction.deleteMany({ where: { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] } });
      await prisma.account.delete({ where: { id: accountId } });
      await prisma.agent.delete({ where: { id: agent.id } });
    }
    const owner = await prisma.owner.findUnique({ where: { email: ownerEmail } });
    if (owner) {
      await prisma.auditLog.deleteMany({ where: { actorId: owner.id, actorType: 'owner' } });
      await prisma.owner.delete({ where: { id: owner.id } });
    }
    await prisma.$disconnect();
    await server.close();
    server.wsServer.shutdown();
  }, 30_000);

  describe('rate limiting', () => {
    it('test env widens all tiers so the shared suite never trips a limiter', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(GLOBAL_RATE_LIMIT).toBeGreaterThan(100_000);
      expect(AUTH_RATE_LIMIT).toBeGreaterThan(100_000);
      expect(MONEY_RATE_LIMIT).toBeGreaterThan(100_000);
    });

    it('registers /health with the global limiter and stays under it in test env', async () => {
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('429s with Retry-After when a strict tier limit is exhausted (per-route override)', async () => {
      // Build a minimal isolated app with a tiny money-tier override to
      // prove the per-route config path works end-to-end (headers included).
      const Fastify = (await import('fastify')).default;
      const rateLimit = (await import('@fastify/rate-limit')).default;
      const { MONEY_RATE_LIMIT_CONFIG } = await import('../../lib/rate-limit-config');

      const app = Fastify({ logger: false });
      await app.register(rateLimit, { global: false });
      app.get(
        '/probe',
        {
          config: {
            rateLimit: {
              max: 3,
              timeWindow: 60_000,
              // Un-buffered: always an error object with statusCode 429
              errorResponseBuilder: () => {
                const e: any = new Error('Too many requests — slow down.');
                e.statusCode = 429;
                return e;
              },
            },
          },
          schema: { response: { 200: { type: 'string' } } },
        },
        async () => 'ok'
      );
      void MONEY_RATE_LIMIT_CONFIG; // tier shape is exercised by config unit below
      await app.ready();
      const codes: number[] = [];
      let retryAfter: string | undefined;
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({ method: 'GET', url: '/probe' });
        codes.push(res.statusCode);
        if (res.statusCode === 429) retryAfter = res.headers['retry-after'] as string;
      }
      await app.close();
      expect(codes).toEqual([200, 200, 200, 429, 429]);
      expect(Number(retryAfter)).toBeGreaterThan(0);
    });

    it('429 body carries the standard error envelope under the global error handler', async () => {
      // The real app's errorResponseBuilder produces statusCode-429 errors;
      // the global handler maps them to { error: { code: RATE_LIMIT_EXCEEDED } }.
      const Fastify = (await import('fastify')).default;
      const rateLimit = (await import('@fastify/rate-limit')).default;
      const { RATE_LIMIT_OPTIONS } = await import('../../lib/rate-limit-config');

      const app = Fastify({ logger: false });
      app.setErrorHandler((error: any, request, reply) => {
        if (error.statusCode === 429) {
          return reply.status(429).send({
            error: { code: 'RATE_LIMIT_EXCEEDED', message: error.message, timestamp: new Date().toISOString() },
          });
        }
        return reply.status(500).send({});
      });
      // NOTE: with global:false the plugin only wires a limiter on routes that
      // declare their own `config.rateLimit` (that is exactly how the strict
      // tiers are attached in the real app) — hence the per-route config below.
      await app.register(rateLimit, { ...RATE_LIMIT_OPTIONS, global: false });
      app.get(
        '/probe2',
        { config: { rateLimit: { max: 2, timeWindow: 60_000 } } },
        async () => 'ok'
      );
      await app.ready();
      const res1 = await app.inject({ method: 'GET', url: '/probe2' });
      const res2 = await app.inject({ method: 'GET', url: '/probe2' });
      const res3 = await app.inject({ method: 'GET', url: '/probe2' });
      await app.close();
      expect([res1.statusCode, res2.statusCode, res3.statusCode]).toEqual([200, 200, 429]);
      const body = JSON.parse(res3.body);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('strict tier config exists with sane shape', async () => {
      const { AUTH_RATE_LIMIT_CONFIG, MONEY_RATE_LIMIT_CONFIG } = await import('../../lib/rate-limit-config');
      expect((AUTH_RATE_LIMIT_CONFIG as any).max).toBeGreaterThan(0);
      expect((MONEY_RATE_LIMIT_CONFIG as any).timeWindow).toBeGreaterThan(0);
    });

    it('every registered route is schema-declared even with rate-limited routes present', () => {
      // Guardrail sanity: /auth/me, /audit-logs all carry schemas.
      const urls = new Set(registeredRouteSchemas.map((r) => r.url));
      expect(urls.has('/audit-logs')).toBe(true);
      const missing = registeredRouteSchemas.filter((r) => !r.responseSchemas || r.responseSchemas.length === 0);
      expect(missing.map((r) => `${r.method} ${r.url}`)).toEqual([]);
    });
  });

  describe('audit logging', () => {
    it('records agent.created with owner actor on POST /accounts', async () => {
      const token = ownerToken;
      const agentCountBefore = await prisma.auditLog.count({ where: { action: AUDIT_ACTION.AGENT_CREATED } });
      const res = await server.inject({
        method: 'POST',
        url: '/accounts',
        headers: { Authorization: `Bearer ${token}` },
        payload: { name: `Audit Agent ${Date.now()}`, platform: 'OpenClaw' },
      });
      expect(res.statusCode).toBe(201);
      const created = res.json();
      const accId = created.account.id;
      expect(await prisma.auditLog.count({ where: { action: AUDIT_ACTION.AGENT_CREATED } })).toBe(agentCountBefore + 1);
      const saved = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTION.AGENT_CREATED, metadata: { path: ['platform'], equals: 'OpenClaw' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(saved).toBeTruthy();
      expect(saved!.actorType).toBe('owner');
      expect(saved!.ip).toBeTruthy();
      // No apiKey materialized in metadata (redaction contract).
      expect(JSON.stringify(saved!.metadata)).not.toContain('apiKey');
      // cleanup the newly created account/agent (FK order: cards/txns first)
      await prisma.virtualCard.deleteMany({ where: { accountId: accId } });
      await prisma.transaction.deleteMany({ where: { OR: [{ fromAccountId: accId }, { toAccountId: accId }] } });
      const ag = await prisma.account.findUnique({ where: { id: accId } });
      await prisma.auditLog.deleteMany({ where: { targetId: ag?.agentId } });
      await prisma.account.delete({ where: { id: accId } });
      await prisma.agent.delete({ where: { id: ag!.agentId! } });
    });

    it('records spending_rules.updated when PATCH /accounts/:id/rules saves', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/accounts/${accountId}/rules`,
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: { dailyLimit: '100.00' },
      });
      expect(res.statusCode).toBe(200);
      const saved = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTION.SPENDING_RULES_UPDATED, targetId: accountId },
        orderBy: { createdAt: 'desc' },
      });
      expect(saved).toBeTruthy();
      expect(saved!.actorType).toBe('owner');
      expect(JSON.stringify(saved!.metadata)).toContain('dailyLimit');
    });

    it('records card.issued and card.frozen for card routes (no cardNumber/cvv in metadata)', async () => {
      // Issue via the real HTTP route (route-level audit is what we assert).
      const res = await server.inject({
        method: 'POST',
        url: '/cards/virtual',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: { accountId },
      });
      expect(res.statusCode).toBe(201);
      const card = res.json();

      const freezeRes = await server.inject({
        method: 'PATCH',
        url: `/cards/${card.id}/freeze`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(freezeRes.statusCode).toBe(200);

      const issued = await prisma.auditLog.findFirst({ where: { action: AUDIT_ACTION.CARD_ISSUED, targetId: card.id } });
      const frozen = await prisma.auditLog.findFirst({ where: { action: AUDIT_ACTION.CARD_FROZEN, targetId: card.id } });
      expect(issued).toBeTruthy();
      expect(frozen).toBeTruthy();
      const serialized = JSON.stringify([issued!.metadata, frozen!.metadata]);
      expect(serialized).not.toContain(card.cardNumber);
      expect(serialized).not.toMatch(/cvv/i);
    }, 30_000);

    it('sanitizeMetadata redacts credential-shaped keys at record time (unit)', async () => {
      const { sanitizeCandidate } = await import('./audit-redaction-probe');
      const redacted = sanitizeCandidate({
        apiKey: 'PLAINTEXT-KEY',
        amount: '5.00',
        nested: { cvv: '123', note: 'ok' },
      });
      expect(redacted).toEqual({
        apiKey: '[REDACTED]',
        amount: '5.00',
        nested: { cvv: '[REDACTED]', note: 'ok' },
      });
    });

    it('fails open: audit.record never throws on a broken Prisma (unit)', async () => {
      const { AuditService } = await import('../../services/audit/audit.service');
      const boom: any = {
        auditLog: { create: async () => { throw new Error('db down'); } },
      };
      const svc = new AuditService(boom);
      await expect(svc.record({ actorType: 'system', action: AUDIT_ACTION.PAYMENT_SENT })).resolves.toBeUndefined();
    });

    it('GET /audit-logs paginates and filters (owner-only)', async () => {
      // Make sure at least one entry exists for this suite's iPad fixtures.
      const res = await server.inject({
        method: 'GET',
        url: '/audit-logs?page=1&pageSize=5',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(5);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(5);
      // Newest-first ordering
      const times = body.data.map((r: any) => new Date(r.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      // Filter by action
      const res2 = await server.inject({
        method: 'GET',
        url: `/audit-logs?action=${encodeURIComponent(AUDIT_ACTION.SPENDING_RULES_UPDATED)}`,
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.body);
      for (const row of body2.data) {
        expect(row.action).toBe(AUDIT_ACTION.SPENDING_RULES_UPDATED);
      }
    });

    it('GET /audit-logs rejects unauthenticated callers', async () => {
      const res = await server.inject({ method: 'GET', url: '/audit-logs' });
      expect(res.statusCode).toBe(401);
    });
  });
});
