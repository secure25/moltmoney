import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PrismaClient } from '@moltmoney/database';
import { WebhookEventType } from '@moltmoney/shared';
import { createWebhookService } from './webhook.service';

const prisma = new PrismaClient();

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('WebhookService', () => {
  const webhookService = createWebhookService(prisma);
  let testAccountId: string;
  let testOwnerId: string;

  beforeEach(async () => {
    // Clean up test data
    await prisma.webhookEvent.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.virtualCard.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.paymentRequest.deleteMany();
    await prisma.account.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.owner.deleteMany();

    // Create test owner
    const owner = await prisma.owner.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test Owner',
        password: 'hashedpassword',
      },
    });
    testOwnerId = owner.id;

    // Create test agent and account
    const agent = await prisma.agent.create({
      data: {
        name: 'Test Agent',
        platform: 'OpenClaw',
        apiKey: `test-key-${Date.now()}`,
        ownerId: testOwnerId,
      },
    });

    const account = await prisma.account.create({
      data: {
        type: 'AGENT',
        balance: 1000,
        currency: 'USD',
        status: 'ACTIVE',
        agentId: agent.id,
      },
    });
    testAccountId = account.id;

    // Reset mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerWebhook', () => {
    it('should create a webhook with valid URL and events', async () => {
      const url = 'https://example.com/webhook';
      const events = [WebhookEventType.PAYMENT_COMPLETED, WebhookEventType.LOW_BALANCE];

      const webhook = await webhookService.registerWebhook(testAccountId, url, events);

      expect(webhook).toBeDefined();
      expect(webhook.accountId).toBe(testAccountId);
      expect(webhook.url).toBe(url);
      expect(webhook.events).toEqual(events);
      expect(webhook.secret).toBeDefined();
      expect(webhook.secret.length).toBe(64); // 32 bytes as hex
      expect(webhook.active).toBe(true);
    });

    it('should reject invalid URL format', async () => {
      const invalidUrl = 'not-a-url';
      const events = [WebhookEventType.PAYMENT_COMPLETED];

      await expect(
        webhookService.registerWebhook(testAccountId, invalidUrl, events)
      ).rejects.toThrow('Invalid webhook URL format');
    });

    it('should reject non-HTTP(S) protocols', async () => {
      const ftpUrl = 'ftp://example.com/webhook';
      const events = [WebhookEventType.PAYMENT_COMPLETED];

      await expect(
        webhookService.registerWebhook(testAccountId, ftpUrl, events)
      ).rejects.toThrow('Webhook URL must use HTTP or HTTPS protocol');
    });

    it('should reject HTTP in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const httpUrl = 'http://example.com/webhook';
      const events = [WebhookEventType.PAYMENT_COMPLETED];

      await expect(
        webhookService.registerWebhook(testAccountId, httpUrl, events)
      ).rejects.toThrow('Webhook URL must use HTTPS in production');

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow HTTP in non-production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const httpUrl = 'http://localhost:3000/webhook';
      const events = [WebhookEventType.PAYMENT_COMPLETED];

      const webhook = await webhookService.registerWebhook(testAccountId, httpUrl, events);

      expect(webhook).toBeDefined();
      expect(webhook.url).toBe(httpUrl);

      process.env.NODE_ENV = originalEnv;
    });

    it('should reject empty events array', async () => {
      const url = 'https://example.com/webhook';
      const events: WebhookEventType[] = [];

      await expect(
        webhookService.registerWebhook(testAccountId, url, events)
      ).rejects.toThrow('At least one event type must be specified');
    });
  });

  describe('unregisterWebhook', () => {
    it('should delete webhook and associated events', async () => {
      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Create some webhook events
      await prisma.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: { test: 'data' },
        },
      });

      // Unregister webhook
      await webhookService.unregisterWebhook(webhook.id);

      // Verify webhook is deleted
      const deletedWebhook = await prisma.webhook.findUnique({
        where: { id: webhook.id },
      });
      expect(deletedWebhook).toBeNull();

      // Verify events are deleted
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events).toHaveLength(0);
    });
  });

  describe('deliverEvent', () => {
    it('should deliver event to subscribed webhooks', async () => {
      // Mock successful fetch
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Deliver event
      const eventData = { transactionId: 'tx-123', amount: '100.00' };
      await webhookService.deliverEvent(
        WebhookEventType.PAYMENT_COMPLETED,
        eventData,
        testAccountId
      );

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/webhook');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Webhook-Signature']).toBeDefined();
      expect(options.headers['X-Webhook-Event']).toBe(WebhookEventType.PAYMENT_COMPLETED);

      // Verify event was marked as delivered
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].delivered).toBe(true);
      expect(events[0].attempts).toBe(1);
    });

    it('should not deliver to webhooks not subscribed to event type', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Create webhook subscribed only to LOW_BALANCE
      await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.LOW_BALANCE]
      );

      // Deliver PAYMENT_COMPLETED event
      await webhookService.deliverEvent(
        WebhookEventType.PAYMENT_COMPLETED,
        { test: 'data' },
        testAccountId
      );

      // Verify fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not deliver to inactive webhooks', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Mark webhook as inactive
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { active: false },
      });

      // Deliver event
      await webhookService.deliverEvent(
        WebhookEventType.PAYMENT_COMPLETED,
        { test: 'data' },
        testAccountId
      );

      // Verify fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle delivery failure', async () => {
      // Mock failed fetch
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Deliver event
      await webhookService.deliverEvent(
        WebhookEventType.PAYMENT_COMPLETED,
        { test: 'data' },
        testAccountId
      );

      // Verify event was created but not marked as delivered
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].delivered).toBe(false);
      expect(events[0].attempts).toBe(1);
    });

    it('should handle network errors', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Deliver event
      await webhookService.deliverEvent(
        WebhookEventType.PAYMENT_COMPLETED,
        { test: 'data' },
        testAccountId
      );

      // Verify event was created but not marked as delivered
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].delivered).toBe(false);
      expect(events[0].attempts).toBe(1);
    });
  });

  describe('retryFailedDeliveries', () => {
    it('should retry failed deliveries with exponential backoff', async () => {
      // Mock successful fetch
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Create a failed event with lastAttempt in the past
      const pastTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      await prisma.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: { test: 'data' },
          attempts: 1,
          lastAttempt: pastTime,
          delivered: false,
        },
      });

      // Retry failed deliveries
      await webhookService.retryFailedDeliveries();

      // Verify event was marked as delivered
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events[0].delivered).toBe(true);
      expect(events[0].attempts).toBe(2);
    });

    it('should not retry if backoff time has not elapsed', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Create a failed event with recent lastAttempt
      const recentTime = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      await prisma.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: { test: 'data' },
          attempts: 1,
          lastAttempt: recentTime,
          delivered: false,
        },
      });

      // Retry failed deliveries
      await webhookService.retryFailedDeliveries();

      // Verify event was not retried (attempts still 1)
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events[0].attempts).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should mark webhook inactive after 3 failed attempts', async () => {
      // Mock failed fetch
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Create a failed event with 2 attempts
      const pastTime = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      await prisma.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: { test: 'data' },
          attempts: 2,
          lastAttempt: pastTime,
          delivered: false,
        },
      });

      // Retry failed deliveries (this will be the 3rd attempt)
      await webhookService.retryFailedDeliveries();

      // Verify webhook is marked as inactive
      const updatedWebhook = await prisma.webhook.findUnique({
        where: { id: webhook.id },
      });
      expect(updatedWebhook?.active).toBe(false);

      // Verify event has 3 attempts
      const events = await prisma.webhookEvent.findMany({
        where: { webhookId: webhook.id },
      });
      expect(events[0].attempts).toBe(3);
      expect(events[0].delivered).toBe(false);
    });

    it('should not retry events that already have 3 attempts', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      // Create webhook
      const webhook = await webhookService.registerWebhook(
        testAccountId,
        'https://example.com/webhook',
        [WebhookEventType.PAYMENT_COMPLETED]
      );

      // Create a failed event with 3 attempts
      await prisma.webhookEvent.create({
        data: {
          webhookId: webhook.id,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: { test: 'data' },
          attempts: 3,
          lastAttempt: new Date(),
          delivered: false,
        },
      });

      // Retry failed deliveries
      await webhookService.retryFailedDeliveries();

      // Verify fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
