import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AgentAuthService } from '../../services/auth/agent-auth.service';
import { AccountService } from '../../services/account/account.service';
import Decimal from 'decimal.js';

/**
 * Route integration tests for the PayPal checkout endpoints and the
 * POST /webhooks/paypal receiver (Phases 5-7).
 *
 * PAYMENT_PROVIDER=paypal is active during these tests, but ALL PayPal HTTP
 * traffic is stubbed via the global fetch mock — no live credentials needed.
 * Calls to the local test server are passed through to the real fetch.
 */

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const TRANSMISSION_HEADERS = {
  'paypal-transmission-id': 'tx-100',
  'paypal-transmission-time': '2026-01-01T00:00:00Z',
  'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-transmission-sig': 'sig-data',
};

function webhookPayload(eventType: string, resource: any) {
  return JSON.stringify({
    id: `WH-${Math.random().toString(36).slice(2)}`,
    event_type: eventType,
    resource_type: 'capture',
    resource,
  });
}

function setPayPalEnv(mode: 'paypal' | 'mock') {
  process.env.PAYMENT_PROVIDER = mode;
  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
  process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  process.env.PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';
  process.env.PAYPAL_WEBHOOK_ID = 'test-webhook-id';
  process.env.BASE_URL = 'http://localhost:3000';
}

describe('PayPal checkout routes + webhook receiver', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance;
  let ownerAuthService: OwnerAuthService;
  let agentAuthService: AgentAuthService;
  let accountService: AccountService;
  let testOwnerId: string;
  let ownerToken: string;
  let agentKey: string;
  let accountId: string;
  let baseUrl: string;

  // Mutable stub state, configured per test
  let verificationMode: 'SUCCESS' | 'FAILURE';
  let orderCounter: number;
  let captureCounter: number;
  const realFetch = globalThis.fetch.bind(globalThis);

  beforeAll(() => {
    const saved = { ...process.env };
    (globalThis as any).__savedEnv = saved;
  });

  afterAll(() => {
    process.env = (globalThis as any).__savedEnv ?? process.env;
  });

  beforeEach(async () => {
    verificationMode = 'SUCCESS';
    orderCounter = 0;
    captureCounter = 0;
    setPayPalEnv('paypal');

    // Global fetch mock: every PayPal call and outbound webhook delivery is
    // answered here. No real network traffic occurs.
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = String(input);

      // Pass through calls to the local test server (the real API under test)
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        return realFetch(input, init);
      }
      if (url.includes('/v1/oauth2/token')) {
        return jsonResponse(200, { access_token: 'stubbed-token', expires_in: 32400 });
      }
      if (url.includes('/v1/notifications/verify-webhook-signature')) {
        return jsonResponse(200, { verification_status: verificationMode });
      }
      if (url.includes('/v2/checkout/orders') && url.includes('/capture')) {
        captureCounter += 1;
        return jsonResponse(201, {
          id: `ORDER-${orderCounter}`,
          status: 'COMPLETED',
          purchase_units: [
            { payments: { captures: [{ id: `CAP-${captureCounter}`, status: 'COMPLETED' }] } },
          ],
        });
      }
      if (url.includes('/v2/payments/captures') && url.includes('/refund')) {
        return jsonResponse(201, {
          id: `REF-${captureCounter}`,
          status: 'COMPLETED',
        });
      }
      if (url.includes('/v2/checkout/orders')) {
        orderCounter += 1;
        return jsonResponse(201, {
          id: `ORDER-${orderCounter}`,
          status: 'CREATED',
          links: [
            {
              rel: 'approve',
              href: `https://www.sandbox.paypal.com/checkoutnow?token=ORDER-${orderCounter}`,
            },
          ],
        });
      }
      if (url.includes('hooks.example')) {
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(404, { name: 'NOT_FOUND' });
    });
    vi.stubGlobal('fetch', fetchMock);

    prisma = new PrismaClient();
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });
    baseUrl = `http://127.0.0.1:${(server.server.address() as any).port}`;

    ownerAuthService = new OwnerAuthService(prisma);
    agentAuthService = new AgentAuthService(prisma);
    accountService = new AccountService(prisma, server.wsServer);

    const email = `test-${Date.now()}-${Math.random()}@example.com`;
    const owner = await ownerAuthService.registerOwner(email, 'Test Owner', 'password123');
    testOwnerId = owner.id;
    ownerToken = (await ownerAuthService.loginOwner(email, 'password123')).token;

    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'PayPal Agent',
      'OpenClaw'
    );
    accountId = account.id;
    agentKey = await agentAuthService.generateApiKey(agent.id);
    await accountService.fundAccount(accountId, new Decimal('100.00'));
  });

  afterEach(async () => {
    await server.close();
    vi.unstubAllGlobals();

    await prisma.providerWebhookEvent.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.externalBankAccount.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({ where: { ownerId: testOwnerId } });
    // deleteMany (not delete) so a partially-created fixture can't cascade
    await prisma.owner.deleteMany({ where: { id: testOwnerId } });
    await prisma.$disconnect();
  });

  async function api(method: string, path: string, opts: { token?: string; apiKey?: string; body?: any } = {}) {
    const res = await realFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json };
  }

  async function createPendingOrder(amount = '25.00') {
    const created = await api('POST', '/payments/paypal/orders', {
      apiKey: agentKey,
      body: { amount },
    });
    expect(created.status).toBe(201);
    return created.json;
  }

  function postWebhook(body: string, transmissionId = TRANSMISSION_HEADERS['paypal-transmission-id']) {
    return realFetch(`${baseUrl}/webhooks/paypal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...TRANSMISSION_HEADERS,
        'paypal-transmission-id': transmissionId,
      },
      body,
    });
  }

  describe('POST /payments/paypal/orders (Phase 5)', () => {
    it('requires agent authentication', async () => {
      const res = await api('POST', '/payments/paypal/orders', {
        body: { amount: '25.00' },
      });
      expect(res.status).toBe(401);
    });

    it('creates an order and returns the approval URL with the tx left PENDING', async () => {
      const res = await api('POST', '/payments/paypal/orders', {
        apiKey: agentKey,
        body: { amount: '25.00', merchantName: 'OpenAI' },
      });

      expect(res.status).toBe(201);
      expect(res.json.orderId).toBe('ORDER-1');
      expect(res.json.approvalUrl).toContain('checkoutnow');
      expect(res.json.state).toBe('WAITING_FOR_PAYER_APPROVAL');
      expect(res.json.transaction.status).toBe('PENDING');
      expect(res.json.transaction.providerRefId).toBe('ORDER-1');

      // Balance untouched at order creation
      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('100');
    });

    it('rejects invalid amounts', async () => {
      const res = await api('POST', '/payments/paypal/orders', {
        apiKey: agentKey,
        body: { amount: '0' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /payments/paypal/orders/:orderId/capture (Phase 6)', () => {
    it('captures an approved order, deducts the balance, and persists the capture id', async () => {
      const created = await createPendingOrder();
      const orderId = created.orderId;

      const cap = await api('POST', `/payments/paypal/orders/${orderId}/capture`, {
        apiKey: agentKey,
      });

      expect(cap.status).toBe(200);
      expect(cap.json.transaction.status).toBe('COMPLETED');
      // providerRefId keeps the PayPal order id; the capture id lives in
      // providerMetadata.captureId
      expect(cap.json.transaction.providerRefId).toBe(created.orderId);

      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('75');
    });

    it('is idempotent on re-capture (no double deduction)', async () => {
      const created = await createPendingOrder();
      const orderId = created.orderId;

      await api('POST', `/payments/paypal/orders/${orderId}/capture`, { apiKey: agentKey });
      const again = await api('POST', `/payments/paypal/orders/${orderId}/capture`, {
        apiKey: agentKey,
      });

      expect(again.status).toBe(200);
      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('75');
    });

    it("blocks capture of another agent's order", async () => {
      const created = await createPendingOrder();
      const orderId = created.orderId;

      const otherOwner = await ownerAuthService.registerOwner(
        `other-${Date.now()}@example.com`,
        'Other',
        'password123'
      );
      const { agent: otherAgent } = await accountService.createAgentAccount(
        otherOwner.id,
        'Other Agent',
        'OpenClaw'
      );
      const otherKey = await agentAuthService.generateApiKey(otherAgent.id);

      const res = await api('POST', `/payments/paypal/orders/${orderId}/capture`, {
        apiKey: otherKey,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /payments/transactions/:id/refund (Phase 10)', () => {
    it('refunds a completed transaction to the owner', async () => {
      const created = await createPendingOrder();
      const txId = created.transaction.id;
      await api('POST', `/payments/paypal/orders/${created.orderId}/capture`, {
        apiKey: agentKey,
      });

      const res = await api('POST', `/payments/transactions/${txId}/refund`, {
        token: ownerToken,
        body: {},
      });

      expect(res.status).toBe(201);
      expect(res.json.refundId).toBeTruthy();
      expect(res.json.transaction.type).toBe('INBOUND');
      expect(new Decimal(res.json.transaction.amount).toString()).toBe('25');

      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('100');
    });

    it('rejects unauthorized refunders (agent, not owner)', async () => {
      const created = await createPendingOrder();
      await api('POST', `/payments/paypal/orders/${created.orderId}/capture`, {
        apiKey: agentKey,
      });

      const res = await api('POST', `/payments/transactions/${created.transaction.id}/refund`, {
        apiKey: agentKey,
        body: {},
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /webhooks/paypal (Phase 7)', () => {
    it('returns 503 when the PayPal provider is not active', async () => {
      await server.close();
      setPayPalEnv('mock');
      server = await buildServer({ logger: false, prisma });
      await server.listen({ port: 0 });
      baseUrl = `http://127.0.0.1:${(server.server.address() as any).port}`;

      const res = await postWebhook(webhookPayload('PAYMENT.CAPTURE.COMPLETED', {}));
      expect(res.status).toBe(503);
    });

    it('rejects deliveries missing transmission headers', async () => {
      const res = await realFetch(`${baseUrl}/webhooks/paypal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: webhookPayload('PAYMENT.CAPTURE.COMPLETED', {}),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('MISSING_WEBHOOK_HEADERS');

      const recorded = await prisma.providerWebhookEvent.count();
      expect(recorded).toBe(0);
    });

    it('rejects invalid signatures and never processes the payload', async () => {
      verificationMode = 'FAILURE';
      const pending = await createPendingOrder();

      const res = await postWebhook(
        webhookPayload('PAYMENT.CAPTURE.COMPLETED', {
          id: 'CAP-BAD',
          custom_id: pending.transaction.id,
        })
      );
      expect(res.status).toBe(401);

      const recorded = await prisma.providerWebhookEvent.count();
      expect(recorded).toBe(0);
      const tx = await prisma.transaction.findUnique({ where: { id: pending.transaction.id } });
      expect(tx.status).toBe('PENDING');
    });

    it('processes a valid capture-completed webhook, fires outbound webhooks, and dedupes replays', async () => {
      // Register an outbound webhook for the account
      const reg = await api('POST', '/webhooks/register', {
        token: ownerToken,
        body: { accountId, url: 'http://hooks.example/endpoint', events: ['payment.completed'] },
      });
      expect(reg.status).toBe(201);

      const pending = await createPendingOrder();
      const txId = pending.transaction.id;

      const body = webhookPayload('PAYMENT.CAPTURE.COMPLETED', { id: 'CAP-WH-1', custom_id: txId });

      const res1 = await postWebhook(body);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.status).toBe('processed');

      // Transaction completed + balance moved
      const tx = await prisma.transaction.findUnique({ where: { id: txId } });
      expect(tx.status).toBe('COMPLETED');
      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('75');

      // Outbound MoltMoney webhook was fired
      const outbound = await prisma.webhookEvent.findFirst({
        where: { eventType: 'payment.completed' },
      });
      expect(outbound).toBeTruthy();

      // Event recorded for dedupe
      const recorded = await prisma.providerWebhookEvent.findUnique({
        where: { transmissionId: TRANSMISSION_HEADERS['paypal-transmission-id'] },
      });
      expect(recorded).toBeTruthy();
      expect(recorded.eventType).toBe('PAYMENT.CAPTURE.COMPLETED');

      // Replay: same transmission id -> already_processed, no double credit
      const res2 = await postWebhook(body);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.status).toBe('already_processed');

      const bal2 = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal2.json.balance).toString()).toBe('75');
    });

    it('acknowledges valid unknown events without processing (and records them)', async () => {
      const res = await postWebhook(
        webhookPayload('CUSTOMER.DISPUTE.CREATED', { id: 'DISP-1' }),
        'tx-unknown-1'
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ignored');

      const recorded = await prisma.providerWebhookEvent.findUnique({
        where: { transmissionId: 'tx-unknown-1' },
      });
      expect(recorded).toBeTruthy();
      expect(recorded.eventType).toBe('CUSTOMER.DISPUTE.CREATED');
    });

    it('records payer approval without completing the payment', async () => {
      const pending = await createPendingOrder();

      const res = await postWebhook(
        webhookPayload('CHECKOUT.ORDER.APPROVED', { id: pending.orderId }),
        'tx-approved-1'
      );

      expect(res.status).toBe(200);
      const tx = await prisma.transaction.findUnique({ where: { id: pending.transaction.id } });
      expect(tx.status).toBe('APPROVED');

      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('100');
    });
  });

  describe('GET /payments/paypal/return + /cancel (buyer redirect targets)', () => {
    async function getHtml(path: string) {
      const res = await realFetch(`${baseUrl}${path}`);
      const text = await res.text();
      return { status: res.status, text, contentType: res.headers.get('content-type') ?? '' };
    }

    it('serves a read-only HTML page for the returned order without capturing or changing state', async () => {
      const pending = await createPendingOrder('25.00');
      const before = await prisma.transaction.findUnique({ where: { id: pending.transaction.id } });

      const res = await getHtml(`/payments/paypal/return?token=${encodeURIComponent(pending.orderId)}`);

      expect(res.status).toBe(200);
      expect(res.contentType).toContain('text/html');
      expect(res.text).toMatch(/nothing has been charged/i);
      expect(res.text).toContain('Confirming your PayPal approval');
      const after = await prisma.transaction.findUnique({ where: { id: pending.transaction.id } });
      expect(after?.status).toBe('PENDING');
      expect(after?.status).toBe(before?.status);
    });

    it('shows the approved state once CHECKOUT.ORDER.APPROVED has reconciled, still without capture', async () => {
      const pending = await createPendingOrder('25.00');
      const wh = await postWebhook(
        webhookPayload('CHECKOUT.ORDER.APPROVED', { id: pending.orderId }),
        'tx-return-approved-1'
      );
      expect(wh.status).toBe(200);

      const res = await getHtml(`/payments/paypal/return?token=${encodeURIComponent(pending.orderId)}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('PayPal order approved');
      expect(res.text).toContain('has not been captured yet');
      expect(res.text).toContain('does not happen on this page');

      const tx = await prisma.transaction.findUnique({ where: { id: pending.transaction.id } });
      expect(tx?.status).toBe('APPROVED');
      const bal = await api('GET', `/accounts/${accountId}/balance`, { apiKey: agentKey });
      expect(new Decimal(bal.json.balance).toString()).toBe('100');
    });

    it('renders the cancel page without any state change', async () => {
      const pending = await createPendingOrder('25.00');

      const res = await getHtml(`/payments/paypal/cancel?token=${encodeURIComponent(pending.orderId)}`);

      expect(res.status).toBe(200);
      expect(res.contentType).toContain('text/html');
      expect(res.text).toContain('Payment canceled');
      expect(res.text).toContain('nothing has been charged');
      const tx = await prisma.transaction.findUnique({ where: { id: pending.transaction.id } });
      expect(tx?.status).toBe('PENDING');
    });

    it('renders a friendly 404 page for an unknown token instead of a 500', async () => {
      const res = await getHtml('/payments/paypal/return?token=NO-SUCH-ORDER');
      expect(res.status).toBe(404);
      expect(res.contentType).toContain('text/html');
      expect(res.text).toContain('could not find');
    });

    it('does not leak account ids, balances or internal metadata on the buyer page', async () => {
      const pending = await createPendingOrder('25.00');

      const res = await getHtml(`/payments/paypal/return?token=${encodeURIComponent(pending.orderId)}`);

      expect(res.text).not.toContain(accountId);
      expect(res.text).not.toContain('balance');
      expect(res.text).not.toContain('providerMetadata');
    });
  });
});
