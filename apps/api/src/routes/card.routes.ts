import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MONEY_RATE_LIMIT_CONFIG } from '../lib/rate-limit-config';
import { AuditService, AUDIT_ACTION, actorFromRequest } from '../services/audit/audit.service';
import { z } from 'zod';
import { CardService } from '../services/card/card.service';
import { createCardIssuingProvider } from '../providers';
import { createWebhookService } from '../services/webhook/webhook.service';
import { requireOwner, requireOwnerOrAgent } from '../middleware/auth.middleware';
import { errorResponse, DATE_TIME, decStr, str, nullable } from '../lib/serialize';
import Decimal from 'decimal.js';

// Request schemas
const issueCardSchema = z.object({
  accountId: z.string().uuid(),
  spendLimit: z.string().optional(),
});

export async function cardRoutes(server: FastifyInstance) {
  const paymentProvider = createCardIssuingProvider();
  const webhookService = createWebhookService(server.prisma);
  const encryptionSecret = process.env.CARD_ENCRYPTION_SECRET || 'development-secret-change-in-production';
  const cardService = new CardService(server.prisma, paymentProvider, encryptionSecret, webhookService);

  /**
   * POST /cards/virtual - Issue virtual card
   * Requirements: 11.1
   */
  server.post(
    '/cards/virtual',
    {
      // Strict tier: card issuing/mutating endpoints.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireOwner,
      schema: {
        response: {
          201: { type: 'object', properties: {
            // Card number/CVV are shown once at issue time (schema-declared, isolated)
            id: str,
            cardNumber: str,
            expiryMonth: { type: 'integer' },
            expiryYear: { type: 'integer' },
            cvv: str,
            status: str,
            spendLimit: nullable(decStr),
            accountId: str,
            createdAt: DATE_TIME,
          }, required: ['id', 'cardNumber', 'expiryMonth', 'expiryYear', 'cvv', 'status', 'accountId', 'createdAt'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = issueCardSchema.parse(request.body);
      const owner = (request as any).owner;

      // Verify owner owns the agent
      const account = await server.prisma.account.findUnique({
        where: { id: body.accountId },
        include: { Agent: true },
      });

      if (!account || !account.Agent || account.Agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to issue cards for this account',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const spendLimit = body.spendLimit ? new Decimal(body.spendLimit) : undefined;
      const card = await cardService.issueCard(body.accountId, spendLimit);

      // Audit: card issuance (a spend-capable instrument is minted).
      // Metadata records only the card's ID/last4 shape — never the number/CVV.
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.CARD_ISSUED,
        targetType: 'VirtualCard',
        targetId: card.id,
        metadata: { accountId: card.accountId, spendLimit: card.spendLimit?.toString() ?? null },
      });

      return reply.status(201).send({
        id: card.id,
        cardNumber: card.cardNumber,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        cvv: card.cvv,
        status: card.status,
        spendLimit: card.spendLimit?.toString(),
        accountId: card.accountId,
        createdAt: card.createdAt,
      });
    }
  );

  /**
   * GET /cards - List cards
   * Requirements: 11.2
   */
  server.get(
    '/cards',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: {
            // CVV is deliberately excluded from list responses (existing behavior)
            cards: { type: 'array', items: { type: 'object', properties: {
              id: str,
              cardNumber: str,
              expiryMonth: { type: 'integer' },
              expiryYear: { type: 'integer' },
              status: str,
              spendLimit: nullable(decStr),
              accountId: str,
              createdAt: DATE_TIME,
            }, required: ['id', 'cardNumber', 'expiryMonth', 'expiryYear', 'status', 'accountId', 'createdAt'] } },
          }, required: ['cards'] },
          400: errorResponse(),
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { accountId } = request.query as { accountId: string };
      const user = (request as any).owner || (request as any).agent;

      if (!accountId) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'accountId query parameter is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify user has access to account
      const account = await server.prisma.account.findUnique({
        where: { id: accountId },
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
              message: 'You do not have permission to view cards for this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        if (account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to view cards for this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      const cards = await cardService.listCards(accountId);

      return reply.send({
        cards: cards.map((card) => ({
          id: card.id,
          cardNumber: card.cardNumber,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          // CVV excluded from list operations
          status: card.status,
          spendLimit: card.spendLimit?.toString(),
          accountId: card.accountId,
          createdAt: card.createdAt,
        })),
      });
    }
  );

  /**
   * PATCH /cards/:id/freeze - Freeze card
   * Requirements: 11.4
   */
  server.patch(
    '/cards/:id/freeze',
    {
      // Strict tier: card issuing/mutating endpoints.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      // Get card and verify ownership
      const card = await server.prisma.virtualCard.findUnique({
        where: { id },
        include: {
          Account: {
            include: { Agent: true },
          },
        },
      });

      if (!card) {
        return reply.status(404).send({
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Card not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (!card.Account.Agent || card.Account.Agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to freeze this card',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const frozenCard = await cardService.freezeCard(id);

      // Audit: freeze flips a live payment instrument's state.
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.CARD_FROZEN,
        targetType: 'VirtualCard',
        targetId: frozenCard.id,
        metadata: { status: frozenCard.status },
      });

      return reply.send({
        id: frozenCard.id,
        status: frozenCard.status,
      });
    }
  );

  /**
   * PATCH /cards/:id/unfreeze - Unfreeze card
   * Requirements: 11.5
   */
  server.patch(
    '/cards/:id/unfreeze',
    {
      // Strict tier: card issuing/mutating endpoints.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      // Get card and verify ownership
      const card = await server.prisma.virtualCard.findUnique({
        where: { id },
        include: {
          Account: {
            include: { Agent: true },
          },
        },
      });

      if (!card) {
        return reply.status(404).send({
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Card not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (!card.Account.Agent || card.Account.Agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to unfreeze this card',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const unfrozenCard = await cardService.unfreezeCard(id);

      // Audit: unfreeze re-enables a payment instrument.
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.CARD_UNFROZEN,
        targetType: 'VirtualCard',
        targetId: unfrozenCard.id,
        metadata: { status: unfrozenCard.status },
      });

      return reply.send({
        id: unfrozenCard.id,
        status: unfrozenCard.status,
      });
    }
  );

  /**
   * PATCH /cards/:id/cancel - Cancel card
   * Requirements: 11.6
   */
  server.patch(
    '/cards/:id/cancel',
    {
      // Strict tier: card issuing/mutating endpoints.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      // Get card and verify ownership
      const card = await server.prisma.virtualCard.findUnique({
        where: { id },
        include: {
          Account: {
            include: { Agent: true },
          },
        },
      });

      if (!card) {
        return reply.status(404).send({
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Card not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (!card.Account.Agent || card.Account.Agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to cancel this card',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const cancelledCard = await cardService.cancelCard(id);

      // Audit: cancellation permanently disables the instrument.
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.CARD_CANCELLED,
        targetType: 'VirtualCard',
        targetId: cancelledCard.id,
        metadata: { status: cancelledCard.status },
      });

      return reply.send({
        id: cancelledCard.id,
        status: cancelledCard.status,
      });
    }
  );
}
