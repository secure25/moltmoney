import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AgentAuthService } from '../../services/auth/agent-auth.service';
import { AccountService } from '../../services/account/account.service';
import Decimal from 'decimal.js';

/**
 * Route-level server-side safety net for blocked categories on
 * POST /payments/paypal/orders (defense independent of Elio's UX refusal).
 *
 * PAYMENT_PROVIDER is forced to 'mock' for these tests: the route-level
 * rejection must be proven to happen BEFORE any provider call, and no live
 * PayPal sandbox traffic may occur. Because createCheckoutOrder creates the
 * MoltMoney transaction BEFORE calling the provider, "no transaction row"
 * proves the provider was never reached.
 */
describe('POST /payments/paypal/orders - server-side category enforcement', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance | undefined;
  let accountService: AccountService;
  let agentKey: string;
  let accountId: string;
  let savedProvider: string | undefined;

  beforeEach(async () => {
    savedProvider = process.env.PAYMENT_PROVIDER;
    process.env.PAYMENT_PROVIDER = 'mock'; // never touch the live sandbox

    prisma = new PrismaClient();
    const ownerAuthService = new OwnerAuthService(prisma);
    const agentAuthService = new AgentAuthService(prisma);
    accountService = new AccountService(prisma, undefined);

    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    const email = `catguard-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(email, 'CatGuard Owner', 'password123');

    const { agent, account } = await accountService.createAgentAccount(
      owner.id,
      'CatGuard Agent',
      'OpenClaw'
    );
    accountId = account.id;
    agentKey = await agentAuthService.generateApiKey(agent.id);

    await accountService.fundAccount(accountId, new Decimal('100.00'));
    await accountService.updateSpendingRules(accountId, {
      blockedCategories: ['gambling', 'alcohol', 'dangerous goods'],
      perTransactionLimit: '10.00',
      dailyLimit: '50.00',
      requireApprovalAbove: '11.00',
    });
  }, 60_000);

  afterEach(async () => {
    if (savedProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = savedProvider;

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
    await server?.close();
  }, 30_000);

  const createOrder = (body: Record<string, unknown>) =>
    server.inject({
      method: 'POST',
      url: '/payments/paypal/orders',
      headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' },
      body,
    });

  const countTx = () =>
    prisma.transaction.count({
      where: { fromAccountId: accountId, type: { not: 'INBOUND' } },
    });

  it('rejects merchantCategory="alcohol" with SPENDING_RULE_VIOLATION: no transaction, no provider call', async () => {
    const res = await createOrder({
      amount: '5.00',
      currency: 'USD',
      merchantName: 'Liquor Store',
      merchantCategory: 'alcohol',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('SPENDING_RULE_VIOLATION');
    expect(res.json().error.message).toMatch(/category blocked/i);
    // No transaction was created and (because tx creation precedes the
    // provider call) the provider — and thus PayPal — was never reached.
    expect(await countTx()).toBe(0);
  });

  it('rejects a missing merchantCategory when blocked categories are configured', async () => {
    const res = await createOrder({
      amount: '5.00',
      currency: 'USD',
      merchantName: 'Some Store',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('SPENDING_RULE_VIOLATION');
    expect(res.json().error.message).toMatch(/merchantCategory is required/i);
    expect(await countTx()).toBe(0);
  });

  it('control: an allowed category still creates the order (functionality intact)', async () => {
    const res = await createOrder({
      amount: '5.00',
      currency: 'USD',
      merchantName: 'Book Store',
      merchantCategory: 'books',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.transaction.status).toBe('PENDING');
    expect(body.orderId).toMatch(/^MOCK-ORDER-/);
    expect(body.approvalUrl).toBeTruthy();
    expect(await countTx()).toBe(1);
  });
});
