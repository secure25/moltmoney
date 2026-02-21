import { PrismaClient } from '@moltmoney/database';
import { createWebhookService } from '../services/webhook';

/**
 * Background job that retries failed webhook deliveries
 * Should be run periodically (e.g., every 5 minutes)
 */
export async function retryWebhookDeliveriesJob(prisma: PrismaClient): Promise<void> {
  const webhookService = createWebhookService(prisma);
  
  try {
    await webhookService.retryFailedDeliveries();
    console.log('Webhook retry job completed successfully');
  } catch (error) {
    console.error('Webhook retry job failed:', error);
    throw error;
  }
}
