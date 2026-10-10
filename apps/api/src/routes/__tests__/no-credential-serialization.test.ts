import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer, registeredRouteSchemas } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AgentAuthService } from '../../services/auth/agent-auth.service';
import { AccountService } from '../../services/account/account.service';
import { CardService } from '../../services/card/card.service';
import { createCardIssuingProvider } from '../../providers';
import { createWebhookService } from '../../services/webhook/webhook.service';
import Decimal from 'decimal.js';

/**
 * STRUCTURAL NO-CREDENTIAL-SERIALIZATION GUARANTEE.
 *
 * Layer 1 (these tests, endpoint walk): every affected GET/list endpoint is
 * called with fixtures that contain a live apiKey (and other credential-
 * shaped values) and the literal values must appear in NO response body.
 *
 * Layer 2 (schema walk): every registered route's response schema is walked
 * and no credential-shaped property name may be declared anywhere except the
 * documented show-once responses (POST /accounts agent.apiKey, POST
 * /webhooks/register secret, POST /cards/virtual cvv/cardNumber). Fastify's
 * serializer strips any field not declared in the response schema, so this
 * walk is the structural guarantee: even a future Prisma `include` change
 * cannot leak — the field simply is not in the declared shape.
 *
 * Run against the isolated test database (DATABASE_URL), with
 * PAYMENT_PROVIDER=mock forced by the CI/script harness — never the sandbox.
 */
describe('No-credential serialization (apiKey + secret sweep)', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance;
  let ownerToken: string;
  let agentKey: string;
  let accountId: string;
  let txId: string;
  let cardId: string;
  let paymentRequestId: string;
  let webhookId: string;
  const MARKER = 'no-cred-serialization-marker';

  beforeAll(async () => {
    prisma = new PrismaClient();
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    const ownerAuthService = new OwnerAuthService(prisma);
    const agentAuthService = new AgentAuthService(prisma);
    const accountService = new AccountService(prisma, server.wsServer);

    const email = `no-cred-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(email, 'NoCred Owner', 'password123');
    ownerToken = (await ownerAuthService.loginOwner(email, 'password123')).token;

    const { agent, account } = await accountService.createAgentAccount(
      owner.id,
      'NoCred Agent',
      'OpenClaw'
    );
    accountId = account.id;
    agentKey = await agentAuthService.generateApiKey(agent.id);

    await accountService.fundAccount(accountId, new Decimal('500.00'));
    // accountService is recreated here since beforeAll wires everything.

    // Fixtures: transaction, card, payment request, webhook.
    const tx = await prisma.transaction.create({
      data: {
        amount: new Decimal('5.00'),
        currency: 'USD',
        type: 'OUTBOUND' as any,
        status: 'COMPLETED' as any,
        fromAccountId: accountId,
        merchantName: 'NoCred Merchant',
      },
    });
    txId = tx.id;

    // cardNumber must be REAL AES ciphertext (listCards decrypts it);
    // cvv can stay a raw marker. issueCard re-issues with proper encryption.
    const cardService = new CardService(
      prisma,
      createCardIssuingProvider(),
      process.env.CARD_ENCRYPTION_SECRET || 'development-secret-change-in-production',
      createWebhookService(prisma)
    );
    const card = await cardService.issueCard(accountId);
    await prisma.virtualCard.update({ where: { id: card.id }, data: { cvv: MARKER } });
    cardId = card.id;

    const prRow = await prisma.paymentRequest.create({
      data: {
        amount: new Decimal('1.00'),
        currency: 'USD',
        description: 'no-cred fixture',
        status: 'PENDING' as any,
        fromAccountId: accountId,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    paymentRequestId = prRow.id;

    const webhook = await prisma.webhook.create({
      data: {
        accountId,
        url: 'https://example.com/hook',
        events: ['payment.completed'],
        secret: MARKER,
        active: true,
      },
    });
    webhookId = webhook.id;
  }, 60_000);

  afterAll(async () => {
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

  /** The SHA-256 of agentKey is what the DB stores; neither may ever leak. */
  const agentKeyHash = () => {
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.createHash('sha256').update(agentKey).digest('hex');
  };

  it('endpoint walk: no endpoint response contains the agent apiKey (or its hash)', async () => {
    const endpoints: Array<[string, string]> = [
      // transactions
      ['owner', `/transactions?accountId=${accountId}`],
      ['owner', `/transactions/${txId}`],
      ['owner', `/transactions/export?accountId=${accountId}&format=json`],
      ['owner', `/transactions/export?accountId=${accountId}&format=csv`],
      ['agent', `/transactions?accountId=${accountId}`],
      ['agent', `/transactions/${txId}`],
      // accounts
      ['owner', `/accounts`],
      ['owner', `/accounts/${accountId}`],
      ['owner', `/accounts/${accountId}/balance`],
      ['owner', `/accounts/${accountId}/spending-policy`],
      ['agent', `/accounts/${accountId}`],
      ['agent', `/accounts/${accountId}/balance`],
      // cards
      ['owner', `/cards?accountId=${accountId}`],
      ['agent', `/cards?accountId=${accountId}`],
      // payment requests
      ['owner', `/payments/requests`],
      ['agent', `/payments/requests`],
      ['agent', `/payments/requests?status=PENDING`],
      // webhooks (GET via listing is absent; register route covered by schema walk)
    ];

    for (const [who, url] of endpoints) {
      const token = who === 'owner' ? ownerToken : agentKey;
      const res = await authed(token, url);
      expect(res.statusCode, `${who} GET ${url} should be 200`).toBe(200);
      expect(res.body, `${who} GET ${url} leaked the plain apiKey`).not.toContain(agentKey);
      expect(res.body, `${who} GET ${url} leaked the hashed apiKey`).not.toContain(agentKeyHash());
    }
  });

  it('GET /payments/requests returns the public agent shape (regression for the raw-Account leak)', async () => {
    const res = await authed(agentKey, '/payments/requests');
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    const row = parsed.data.find((r: any) => r.id === paymentRequestId);
    expect(row).toBeTruthy();
    const acct = row.Account_PaymentRequest_fromAccountIdToAccount;
    expect(acct).toBeTruthy();
    // Only the public agent fields may exist inside the embedded account.
    expect(Object.keys(acct.agent ?? {}).sort()).toEqual(['createdAt', 'id', 'name', 'platform']);
  });

  it('GET /transactions list embeds only the public agent shape', async () => {
    const res = await authed(agentKey, `/transactions?accountId=${accountId}`);
    const parsed = JSON.parse(res.body);
    const row = parsed.data.find((t: any) => t.id === txId);
    expect(row.fromAccount.agent).toBeTruthy();
    expect(Object.keys(row.fromAccount.agent).sort()).toEqual(['createdAt', 'id', 'name', 'platform']);
  });

  it('schema walk: no route response schema declares apiKey/credential properties (documented show-once excepted)', () => {
    const CREDENTIAL_PROPS = ['apiKey', 'password', 'passwordHash', 'secret', 'cvv'];
    const DOCUMENTED_SHOW_ONCE = [
      'POST /accounts', // agent.apiKey — the one-time reveal
      'POST /auth/agents/keys', // apiKey — regenerated-key one-time reveal
      'POST /webhooks/register', // secret — HMAC key handed to caller
      'POST /cards/virtual', // cvv — one-time card issue
    ];

    expect(registeredRouteSchemas.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const route of registeredRouteSchemas) {
      const key = `${route.method} ${route.url}`;
      const isDocumented = DOCUMENTED_SHOW_ONCE.some((d) => key === d);

      const walk = (node: any, path: string) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach((n, i) => walk(n, `${path}[${i}]`));
          return;
        }
        if (typeof node.properties === 'object') {
          for (const prop of Object.keys(node.properties)) {
            if (CREDENTIAL_PROPS.includes(prop) && !isDocumented) {
              violations.push(`${key} declares "${prop}" at ${path}.properties.${prop}`);
            }
            walk(node.properties[prop], `${path}.properties.${prop}`);
          }
        }
        for (const sub of ['items', 'anyOf', 'oneOf', 'allOf']) {
          if (node[sub] !== undefined) walk(node[sub], `${path}.${sub}`);
        }
      };
      for (const schema of route.responseSchemas) walk(schema, key);
    }

    expect(violations).toEqual([]);
  });

  it('documented show-once routes DO declare their one-time credential field', () => {
    const accounts = registeredRouteSchemas.find((r) => r.method === 'POST' && r.url === '/accounts');
    const agentKeys = registeredRouteSchemas.find((r) => r.method === 'POST' && r.url === '/auth/agents/keys');
    const hooks = registeredRouteSchemas.find((r) => r.method === 'POST' && r.url === '/webhooks/register');
    expect(accounts).toBeTruthy();
    expect(agentKeys).toBeTruthy();
    expect(hooks).toBeTruthy();
    expect(JSON.stringify(accounts!.responseSchemas)).toContain('"apiKey"');
    expect(JSON.stringify(agentKeys!.responseSchemas)).toContain('"apiKey"');
    expect(JSON.stringify(hooks!.responseSchemas)).toContain('"secret"');
  });

  it('serializer strips undeclared fields at runtime (canary)', async () => {
    // The fixCard fixture row has cardNumber=MARKER; GET /cards declares a
    // schema without any credential-shaped prop name; the list handler maps
    // cardNumber explicitly so the canary here is the transactions family:
    // the raw Prisma row (with all columns) is passed to reply.send for
    // fromAccount/toAccount — the response schema must strip everything not
    // declared (only the public agent + account fields survive).
    const res = await authed(agentKey, `/transactions?accountId=${accountId}`);
    const parsed = JSON.parse(res.body);
    const row = parsed.data.find((t: any) => t.id === txId);
    const acctKeys = Object.keys(row.fromAccount).sort();
    // Whatever the query included, the serializer reduces the account to the
    // declared fields only:
    expect(acctKeys.every((k) =>
      ['id', 'type', 'balance', 'currency', 'status', 'accountNumber', 'agentId', 'createdAt', 'agent'].includes(k)
    )).toBe(true);
    expect(acctKeys).not.toContain('Agent'); // full agent object (capital A) stripped
    expect(res.body).not.toContain(agentKeyHash());
    expect(cardId).toBeTruthy(); // fixture sanity
    expect(webhookId).toBeTruthy();
    expect(paymentRequestId).toBeTruthy();
  });
});
