import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createWebhookService } from '../services/webhook/webhook.service';
import { requireOwnerOrAgent } from '../middleware/auth.middleware';

// Request schemas
const registerWebhookSchema = z.object({
  accountId: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.enum([
    'payment.completed',
    'payment.declined',
    'account.low_balance',
    'card.issued',
    'card.frozen',
  ])),
});

export async function webhookRoutes(server: FastifyInstance) {
  const webhookService = createWebhookService(server.prisma);

  /**
   * POST /webhooks/register - Register webhook URL
   * Requirements: 16.4
   */
  server.post(
    '/webhooks/register',
    {
      preHandler: requireOwnerOrAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = registerWebhookSchema.parse(request.body);
      const user = (request as any).owner || (request as any).agent;

      // Verify user has access to account
      const account = await server.prisma.account.findUnique({
        where: { id: body.accountId },
        include: { Agent: true },
      });

      if (!account) {
        return reply.status(404).send({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Authorization check
      if ((request as any).owner) {
        if (!account.Agent || account.Agent.ownerId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to register webhooks for this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        if (account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to register webhooks for this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      const webhook = await webhookService.registerWebhook(
        body.accountId,
        body.url,
        body.events as any[]
      );

      return reply.status(201).send({
        id: webhook.id,
        accountId: webhook.accountId,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret,
        active: webhook.active,
        createdAt: webhook.createdAt,
      });
    }
  );

  /**
   * DELETE /webhooks/:id - Unregister webhook
   * Requirements: 16.4
   */
  server.delete(
    '/webhooks/:id',
    {
      preHandler: requireOwnerOrAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).owner || (request as any).agent;

      // Get webhook and verify ownership
      const webhook = await server.prisma.webhook.findUnique({
        where: { id },
        include: {
          Account: {
            include: { Agent: true },
          },
        },
      });

      if (!webhook) {
        return reply.status(404).send({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Authorization check
      if ((request as any).owner) {
        if (!webhook.Account.Agent || webhook.Account.Agent.ownerId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to unregister this webhook',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        if (webhook.Account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to unregister this webhook',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      await webhookService.unregisterWebhook(id);

      return reply.status(204).send();
    }
  );
}
