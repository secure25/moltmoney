import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AgentAuthService } from '../../services/auth/agent-auth.service';
import { AccountService } from '../../services/account/account.service';
import Decimal from 'decimal.js';

/**
 * GET /accounts/:id/spending-policy tests.
 *
 * spentToday is exercised through REAL transaction rows written directly to
 * the isolated test database (run vitest with DATABASE_URL pointing at
 * moltmoney_test), so the aggregation semantics — statuses, types, day
 * boundaries — are verified end-to-end through the shared helper that
 * evaluateSpendingRules also uses.
 */
describe('GET /accounts/:id/spending-policy', () => {
  let server: FastifyInstance;
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let agentAuthService: AgentAuthService;
  let accountService: AccountService;
  let testOwnerId: string;
  let testOwnerToken: string;
  let testAgentId: string;
  let testAgentToken: string;
  let testAccountId: string;

  // A second, unrelated owner+agent for authorization-failure tests.
  let foreignAgentToken: string;
  let foreignAccountId: string;
  let foreignOwnerToken: string;

  const RULES = {
    perTransactionLimit: '10.00',
    dailyLimit: '50.00',
    requireApprovalAbove: '11.00',
    blockedCategories: ['gambling', 'alcohol', 'dangerous goods'],
    allowedMerchants: ['Trusted Co'],
  };

  async function createTx(data: {
    amount: string;
    type: string;
    status: string;
    createdAt?: Date;
    fromAccountId?: string;
  }) {
    await prisma.transaction.create({
      data: {
        amount: new Decimal(data.amount),
        currency: 'USD',
        type: data.type as any,
        status: data.status as any,
        fromAccountId: data.fromAccountId ?? testAccountId,
        createdAt: data.createdAt ?? new Date(),
      },
    });
  }

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    agentAuthService = new AgentAuthService(prisma);

    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    accountService = new AccountService(prisma, server.wsServer);

    const email = `test-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(email, 'Test Owner', 'password123');
    testOwnerId = owner.id;
    testOwnerToken = (await ownerAuthService.loginOwner(email, 'password123')).token;

    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'Policy Agent',
      'OpenClaw'
    );
    testAgentId = agent.id;
    testAccountId = account.id;
    testAgentToken = await agentAuthService.generateApiKey(testAgentId);

    await accountService.fundAccount(testAccountId, new Decimal('500.00'));
    await accountService.updateSpendingRules(testAccountId, RULES);

    // Foreign owner + agent + account (no relationship to testOwner).
    const foreignEmail = `foreign-${Date.now()}@example.com`;
    const foreignOwner = await ownerAuthService.registerOwner(foreignEmail, 'Foreign Owner', 'password123');
    foreignOwnerToken = (await ownerAuthService.loginOwner(foreignEmail, 'password123')).token;
    const { agent: foreignAgent, account: foreignAccount } = await accountService.createAgentAccount(
      foreignOwner.id,
      'Foreign Agent',
      'OpenClaw'
    );
    foreignAccountId = foreignAccount.id;
    foreignAgentToken = await agentAuthService.generateApiKey(foreignAgent.id);
  }, 60_000);

  afterEach(async () => {
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.providerWebhookEvent.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.externalBankAccount.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.$disconnect();
    await server.close();
  }, 30_000);

  const getPolicy = (token: string, accountId: string) =>
    server.inject({
      method: 'GET',
      url: `/accounts/${accountId}/spending-policy`,
      headers: { Authorization: `Bearer ${token}` },
    });

  it('agent can read its own policy: correct spentToday/remainingToday/serverTime and rules', async () => {
    await createTx({ amount: '5.00', type: 'OUTBOUND', status: 'COMPLETED' });
    await createTx({ amount: '2.50', type: 'INTERNAL', status: 'COMPLETED' });

    const res = await getPolicy(testAgentToken, testAccountId);
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.accountId).toBe(testAccountId);
    expect(body.spentToday).toBe('7.5');
    expect(body.remainingToday).toBe('42.5');
    expect(body.rules).toEqual(RULES);

    // serverTime is a fresh ISO timestamp (server clock).
    const serverTime = new Date(body.serverTime);
    expect(Number.isNaN(serverTime.getTime())).toBe(false);
    expect(Math.abs(Date.now() - serverTime.getTime())).toBeLessThan(10_000);
  });

  it('owner can read its agent account policy', async () => {
    const res = await getPolicy(testOwnerToken, testAccountId);
    expect(res.statusCode).toBe(200);
    expect(res.json().accountId).toBe(testAccountId);
    expect(res.json().remainingToday).toBe('50'); // nothing spent yet
  });

  it('a foreign agent gets 403 for another agent account', async () => {
    const res = await getPolicy(foreignAgentToken, testAccountId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('another owner gets 403 for an account its agents do not own', async () => {
    const res = await getPolicy(foreignOwnerToken, testAccountId);
    expect(res.statusCode).toBe(403);
  });

  it('counts COMPLETED outbound/internal/payout and excludes pending, failed and inbound', async () => {
    await createTx({ amount: '5.00', type: 'OUTBOUND', status: 'COMPLETED' });
    await createTx({ amount: '3.00', type: 'INTERNAL', status: 'COMPLETED' });
    await createTx({ amount: '4.00', type: 'PAYOUT', status: 'COMPLETED' });
    // must NOT count:
    await createTx({ amount: '100.00', type: 'OUTBOUND', status: 'PENDING' });
    await createTx({ amount: '100.00', type: 'OUTBOUND', status: 'FAILED' });
    await createTx({ amount: '100.00', type: 'INBOUND', status: 'COMPLETED' });

    const body = (await getPolicy(testAgentToken, testAccountId)).json();
    expect(body.spentToday).toBe('12');
    expect(body.remainingToday).toBe('38');
  });

  it('respects server-local day boundaries: today midnight counts, yesterday does not', async () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0); // today 00:00:00.000 local

    const yesterdayEnd = new Date(midnight);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999); // yesterday 23:59:59.999 local

    await createTx({ amount: '6.00', type: 'OUTBOUND', status: 'COMPLETED', createdAt: midnight });
    await createTx({ amount: '40.00', type: 'OUTBOUND', status: 'COMPLETED', createdAt: yesterdayEnd });

    const body = (await getPolicy(testAgentToken, testAccountId)).json();
    expect(body.spentToday).toBe('6');
    expect(body.remainingToday).toBe('44');
  });

  it('clamps remainingToday at 0 when the day is already over the daily limit', async () => {
    await createTx({ amount: '60.00', type: 'OUTBOUND', status: 'COMPLETED' }); // > 50 daily limit

    const body = (await getPolicy(testAgentToken, testAccountId)).json();
    expect(body.spentToday).toBe('60');
    expect(body.remainingToday).toBe('0');
  });

  it('handles unlimited/null dailyLimit: remainingToday is null', async () => {
    await accountService.updateSpendingRules(testAccountId, {
      perTransactionLimit: '10.00',
      dailyLimit: null as any,
    });

    await createTx({ amount: '5.00', type: 'OUTBOUND', status: 'COMPLETED' });

    const body = (await getPolicy(testAgentToken, testAccountId)).json();
    expect(body.spentToday).toBe('5');
    expect(body.remainingToday).toBeNull();
  });

  it('returns the same rules values as the account policy endpoint', async () => {
    const accountRes = await server.inject({
      method: 'GET',
      url: `/accounts/${testAccountId}`,
      headers: { Authorization: `Bearer ${testAgentToken}` },
    });
    const policyRes = await getPolicy(testAgentToken, testAccountId);

    expect(policyRes.statusCode).toBe(200);
    expect(policyRes.json().rules).toEqual(accountRes.json().spendingRules);
  });

  it('requires authentication', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/accounts/${testAccountId}/spending-policy`,
    });
    expect(res.statusCode).toBe(401);
  });
});
