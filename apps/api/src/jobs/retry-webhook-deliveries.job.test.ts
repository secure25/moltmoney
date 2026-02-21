import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@moltmoney/database';
import { WebhookEventType } from '@moltmoney/shared';
import { retryWebhookDeliveriesJob } from './retry-webhook-deliveries.job';

const prisma = new PrismaClient();

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('retryWebhookDeliveriesJob', () => {
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

  it('should retry failed webhook deliveries', async () => {
    // Mock successful fetch
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    // Create webhook
    const webhook = await prisma.webhook.create({
      data: {
        accountId: testAccountId,
        url: 'https://example.com/webhook',
        events: [WebhookEventType.PAYMENT_COMPLETED],
        secret: 'test-secret',
        active: true,
      },
    });

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

    // Run the job
    await retryWebhookDeliveriesJob(prisma);

    // Verify event was marked as delivered
    const events = await prisma.webhookEvent.findMany({
      where: { webhookId: webhook.id },
    });
    expect(events[0].delivered).toBe(true);
    expect(events[0].attempts).toBe(2);
  });

  it('should handle errors gracefully', async () => {
    // Mock fetch to throw error
    mockFetch.mockRejectedValue(new Error('Network error'));

    // Create webhook
    const webhook = await prisma.webhook.create({
      data: {
        accountId: testAccountId,
        url: 'https://example.com/webhook',
        events: [WebhookEventType.PAYMENT_COMPLETED],
        secret: 'test-secret',
        active: true,
      },
    });

    // Create a failed event
    const pastTime = new Date(Date.now() - 2 * 60 * 1000);
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

    // Run the job - should not throw
    await expect(retryWebhookDeliveriesJob(prisma)).resolves.not.toThrow();
  });

  it('should process multiple failed events', async () => {
    // Mock successful fetch
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    // Create two webhooks
    const webhook1 = await prisma.webhook.create({
      data: {
        accountId: testAccountId,
        url: 'https://example1.com/webhook',
        events: [WebhookEventType.PAYMENT_COMPLETED],
        secret: 'test-secret-1',
        active: true,
      },
    });

    const webhook2 = await prisma.webhook.create({
      data: {
        accountId: testAccountId,
        url: 'https://example2.com/webhook',
        events: [WebhookEventType.LOW_BALANCE],
        secret: 'test-secret-2',
        active: true,
      },
    });

    // Create failed events for both
    const pastTime = new Date(Date.now() - 2 * 60 * 1000);
    await prisma.webhookEvent.createMany({
      data: [
        {
          webhookId: webhook1.id,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: { test: 'data1' },
          attempts: 1,
          lastAttempt: pastTime,
          delivered: false,
        },
        {
          webhookId: webhook2.id,
          eventType: WebhookEventType.LOW_BALANCE,
          payload: { test: 'data2' },
          attempts: 1,
          lastAttempt: pastTime,
          delivered: false,
        },
      ],
    });

    // Run the job
    await retryWebhookDeliveriesJob(prisma);

    // Verify both events were delivered
    const events1 = await prisma.webhookEvent.findMany({
      where: { webhookId: webhook1.id },
    });
    expect(events1[0].delivered).toBe(true);

    const events2 = await prisma.webhookEvent.findMany({
      where: { webhookId: webhook2.id },
    });
    expect(events2[0].delivered).toBe(true);
  });
});
