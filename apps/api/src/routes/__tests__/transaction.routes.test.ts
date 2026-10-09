import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AgentAuthService } from '../../services/auth/agent-auth.service';
import { AccountService } from '../../services/account/account.service';
import Decimal from 'decimal.js';

/**
 * Security regressions for the transaction API: the agent's raw apiKey is a
 * credential and must NEVER appear in any response (list, detail, export).
 * The live /transactions list previously embedded the full nested Agent
 * object, leaking the key. Run against the isolated test database.
 */
describe('Transaction routes - apiKey never exposed', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance;
  let ownerAuthService: OwnerAuthService;
  let agentAuthService: AgentAuthService;
  let accountService: AccountService;
  let ownerToken: string;
  let agentKey: string;
  let accountId: string;
  let txId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    agentAuthService = new AgentAuthService(prisma);

    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    accountService = new AccountService(prisma, server.wsServer);

    const email = `txsec-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(email, 'TxSec Owner', 'password123');
    ownerToken = (await ownerAuthService.loginOwner(email, 'password123')).token;

    const { agent, account } = await accountService.createAgentAccount(
      owner.id,
      'TxSec Agent',
      'OpenClaw'
    );
    accountId = account.id;
    agentKey = await agentAuthService.generateApiKey(agent.id);

    await accountService.fundAccount(accountId, new Decimal('200.00'));

    // A real completed transaction so list/detail/export have content.
    const tx = await prisma.transaction.create({
      data: {
        amount: new Decimal('5.00'),
        currency: 'USD',
        type: 'OUTBOUND' as any,
        status: 'COMPLETED' as any,
        fromAccountId: accountId,
        merchantName: 'TxSec Merchant',
      },
    });
    txId = tx.id;
  }, 60_000);

  afterEach(async () => {
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
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

  const authed = (token: string, url: string) =>
    server.inject({ method: 'GET', url, headers: { Authorization: `Bearer ${token}` } });

  it('GET /transactions does NOT contain the raw apiKey (list)', async () => {
    const res = await authed(agentKey, `/transactions?accountId=${accountId}`);
    expect(res.statusCode).toBe(200);

    const body = res.body;
    // The raw key must not appear anywhere in the payload.
    expect(body).not.toContain(agentKey);
    const parsed = JSON.parse(body);
    const tx = parsed.data.find((t: any) => t.id === txId);
    expect(tx).toBeTruthy();
    // The response schema strips everything but the declared public agent
    // shape (lowercase `agent`); the raw `Agent` row cannot appear at all.
    expect(tx.fromAccount.Agent).toBeUndefined();
    expect(tx.fromAccount.agent.apiKey).toBeUndefined();
    expect(tx.fromAccount.agent.name).toBe('TxSec Agent');

    // Functionality intact: the transaction fields are still present.
    expect(tx.amount).toBe('5');
    expect(tx.status).toBe('COMPLETED');
  });

  it('GET /transactions/:id does NOT contain the raw apiKey (detail)', async () => {
    const res = await authed(agentKey, `/transactions/${txId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(agentKey);
    expect(JSON.parse(res.body).id).toBe(txId);
  });

  it('GET /transactions/export does NOT contain the raw apiKey (json + csv)', async () => {
    const jsonRes = await authed(agentKey, `/transactions/export?accountId=${accountId}&format=json`);
    expect(jsonRes.statusCode).toBe(200);
    expect(jsonRes.body).not.toContain(agentKey);
    expect(jsonRes.body).toContain(txId);

    const csvRes = await authed(agentKey, `/transactions/export?accountId=${accountId}&format=csv`);
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.body).not.toContain(agentKey);
    expect(csvRes.body).toContain(txId);
  });

  it('owner view of /transactions does NOT contain the raw apiKey either', async () => {
    const res = await authed(ownerToken, `/transactions?accountId=${accountId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(agentKey);
  });

  it('authentication still works and foreign agents are still rejected', async () => {
    // Agent auth on a non-owned account: 403 (authorization unchanged).
    const foreignEmail = `txsec-foreign-${Date.now()}@example.com`;
    const foreignOwner = await ownerAuthService.registerOwner(foreignEmail, 'Foreign', 'password123');
    const { agent: foreignAgent } = await accountService.createAgentAccount(
      foreignOwner.id,
      'Foreign Agent',
      'OpenClaw'
    );
    const foreignKey = await agentAuthService.generateApiKey(foreignAgent.id);

    const res = await authed(foreignKey, `/transactions?accountId=${accountId}`);
    expect(res.statusCode).toBe(403);

    // The agent's own token still authorizes (proven in earlier tests); the
    // detail route works for the owner too.
    const resOwner = await authed(ownerToken, `/transactions/${txId}`);
    expect(resOwner.statusCode).toBe(200);
  });
});
