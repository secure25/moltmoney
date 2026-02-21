import { PrismaClient, Webhook, WebhookEvent } from '@moltmoney/database';
import { WebhookEventType } from '@moltmoney/shared';
import crypto from 'crypto';

export interface WebhookService {
  registerWebhook(
    accountId: string,
    url: string,
    events: WebhookEventType[]
  ): Promise<Webhook>;
  unregisterWebhook(webhookId: string): Promise<void>;
  deliverEvent(
    eventType: WebhookEventType,
    data: any,
    accountId: string
  ): Promise<void>;
  retryFailedDeliveries(): Promise<void>;
}

export interface WebhookEventData {
  type: WebhookEventType;
  data: any;
  timestamp: Date;
}

export function createWebhookService(prisma: PrismaClient): WebhookService {
  /**
   * Validates webhook URL format
   * In production, must be HTTPS
   */
  function validateWebhookUrl(url: string): void {
    try {
      const parsed = new URL(url);
      
      // In production, enforce HTTPS
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTPS in production');
      }
      
      // Ensure it's HTTP or HTTPS
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTP or HTTPS protocol');
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Invalid webhook URL format');
      }
      throw error;
    }
  }

  /**
   * Generates a random secret for HMAC signatures
   */
  function generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates HMAC-SHA256 signature for webhook payload
   */
  function generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Delivers a webhook event to a specific webhook URL
   */
  async function deliverWebhookEvent(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<boolean> {
    const payload = JSON.stringify({
      type: event.eventType,
      data: event.payload,
      timestamp: event.createdAt.toISOString(),
    });

    const signature = generateSignature(payload, webhook.secret);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.eventType,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Consider 2xx status codes as successful
      return response.ok;
    } catch (error) {
      console.error(`Webhook delivery failed for ${webhook.url}:`, error);
      return false;
    }
  }

  return {
    async registerWebhook(
      accountId: string,
      url: string,
      events: WebhookEventType[]
    ): Promise<Webhook> {
      // Validate URL format
      validateWebhookUrl(url);

      // Validate events array is not empty
      if (!events || events.length === 0) {
        throw new Error('At least one event type must be specified');
      }

      // Generate webhook secret
      const secret = generateWebhookSecret();

      // Create webhook record
      const webhook = await prisma.webhook.create({
        data: {
          accountId,
          url,
          events,
          secret,
          active: true,
        },
      });

      return webhook;
    },

    async unregisterWebhook(webhookId: string): Promise<void> {
      // Delete webhook and all associated events
      await prisma.$transaction([
        prisma.webhookEvent.deleteMany({
          where: { webhookId },
        }),
        prisma.webhook.delete({
          where: { id: webhookId },
        }),
      ]);
    },

    async deliverEvent(
      eventType: WebhookEventType,
      data: any,
      accountId: string
    ): Promise<void> {
      // Find all active webhooks for this account that are subscribed to this event type
      const webhooks = await prisma.webhook.findMany({
        where: {
          accountId,
          active: true,
          events: {
            has: eventType,
          },
        },
      });

      // Create webhook event records for each webhook
      for (const webhook of webhooks) {
        const event = await prisma.webhookEvent.create({
          data: {
            webhookId: webhook.id,
            eventType,
            payload: data,
            attempts: 0,
            delivered: false,
          },
        });

        // Attempt immediate delivery
        const success = await deliverWebhookEvent(webhook, event);

        if (success) {
          // Mark as delivered
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              delivered: true,
              attempts: 1,
              lastAttempt: new Date(),
            },
          });
        } else {
          // Mark first attempt
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              attempts: 1,
              lastAttempt: new Date(),
            },
          });
        }
      }
    },

    async retryFailedDeliveries(): Promise<void> {
      // Find all undelivered events with less than 3 attempts
      const failedEvents = await prisma.webhookEvent.findMany({
        where: {
          delivered: false,
          attempts: {
            lt: 3,
          },
        },
        include: {
          Webhook: true,
        },
      });

      for (const event of failedEvents) {
        // Calculate backoff delay based on attempts
        // 1st retry: 1 minute, 2nd retry: 5 minutes, 3rd retry: 15 minutes
        const backoffMinutes = event.attempts === 1 ? 1 : event.attempts === 2 ? 5 : 15;
        const backoffMs = backoffMinutes * 60 * 1000;
        
        // Check if enough time has passed since last attempt
        if (event.lastAttempt) {
          const timeSinceLastAttempt = Date.now() - event.lastAttempt.getTime();
          if (timeSinceLastAttempt < backoffMs) {
            continue; // Skip this event, not enough time has passed
          }
        }

        // Attempt delivery
        const success = await deliverWebhookEvent(event.Webhook, event);

        if (success) {
          // Mark as delivered
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              delivered: true,
              attempts: event.attempts + 1,
              lastAttempt: new Date(),
            },
          });
        } else {
          // Increment attempts
          const newAttempts = event.attempts + 1;
          
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              attempts: newAttempts,
              lastAttempt: new Date(),
            },
          });

          // If this was the 3rd failed attempt, mark webhook as inactive
          if (newAttempts >= 3) {
            await prisma.webhook.update({
              where: { id: event.Webhook.id },
              data: {
                active: false,
              },
            });
          }
        }
      }
    },
  };
}
