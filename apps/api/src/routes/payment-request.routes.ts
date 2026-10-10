import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PaymentRequestService } from '../services/payment-request/payment-request.service';
import { requireAgent, requireOwner, requireOwnerOrAgent } from '../middleware/auth.middleware';
import { AGENT_PUBLIC_INCLUDE, toPublicAgent } from '../services/agent/agent-public';
import { errorResponse, DATE_TIME, decStr, str, nullable } from '../lib/serialize';
import Decimal from 'decimal.js';

/** Response schema for one payment-request row with its public agent context. */
function paymentRequestItem() {
  return {
    type: 'object',
    properties: {
      id: str,
      amount: decStr,
      currency: str,
      description: str,
      status: str,
      paymentLink: nullable(str),
      fromAccountId: str,
      toAccountId: nullable(str),
      // Dashboard-facing owner context: same account + public agent, under a
      // readable key (transactions use the identical fromAccount shape). The
      // legacy awkward relation key below is kept for wire compatibility.
      fromAccount: nullable({
        type: 'object',
        properties: {
          id: str,
          agent: nullable({
            type: 'object',
            properties: {
              id: str,
              name: str,
              platform: str,
              createdAt: DATE_TIME,
            },
            required: ['id', 'name', 'platform', 'createdAt'],
          }),
        },
        required: ['id'],
      }),
      Account_PaymentRequest_fromAccountIdToAccount: nullable({
        type: 'object',
        properties: {
          id: str,
          agent: nullable({
            type: 'object',
            properties: {
              id: str,
              name: str,
              platform: str,
              createdAt: DATE_TIME,
            },
            required: ['id', 'name', 'platform', 'createdAt'],
          }),
        },
        required: ['id'],
      }),
      expiresAt: DATE_TIME,
      createdAt: DATE_TIME,
    },
    required: ['id', 'amount', 'currency', 'description', 'status', 'fromAccountId', 'expiresAt', 'createdAt'],
  };
}

// Request schemas
const createRequestSchema = z.object({
  toAccountId: z.string().uuid().optional(), // Made optional for fund requests to owner
  amount: z.string().refine((val) => {
    const num = new Decimal(val);
    return num.gt(0);
  }, 'Amount must be greater than 0'),
  description: z.string().min(1).max(500),
  expiresAt: z.string().datetime(),
  generateLink: z.boolean().optional(),
});

const payRequestSchema = z.object({
  payerAccountId: z.string().uuid(),
});

const guestPaymentSchema = z.object({
  paymentLink: z.string().min(1),
  cardNumber: z.string().regex(/^\d{13,19}$/, 'Invalid card number'),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(new Date().getFullYear()),
  cvv: z.string().regex(/^\d{3,4}$/, 'Invalid CVV'),
  cardholderName: z.string().min(1).max(255),
});

export async function paymentRequestRoutes(server: FastifyInstance) {
  const paymentRequestService = new PaymentRequestService(server.prisma, server.wsServer);

  /**
   * POST /payments/request - Create payment request
   * Requirements: 8.1
   */
  server.post(
    '/payments/request',
    {
      preHandler: requireAgent,
      schema: {
        response: {
          201: paymentRequestItem(),
          400: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createRequestSchema.parse(request.body);
      const agent = (request as any).agent;

      // Get agent's account
      const account = await server.prisma.account.findUnique({
        where: { agentId: agent.id },
      });

      if (!account) {
        return reply.status(404).send({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Agent account not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const amount = new Decimal(body.amount);
      const expiresAt = new Date(body.expiresAt);

      // If no toAccountId provided, this is a fund request to owner (null toAccountId)
      const toAccountId = body.toAccountId || null;

      const paymentRequest = await paymentRequestService.createRequest(
        account.id,
        toAccountId,
        amount,
        body.description,
        expiresAt,
        body.generateLink || false
      );

      // Generate payment link URL if requested
      let paymentLink: string | undefined;
      if (body.generateLink && paymentRequest.paymentLink) {
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        paymentLink = paymentRequestService.generatePaymentLinkUrl(
          paymentRequest.paymentLink,
          baseUrl
        );
      }

      return reply.status(201).send({
        id: paymentRequest.id,
        amount: paymentRequest.amount.toString(),
        currency: paymentRequest.currency,
        description: paymentRequest.description,
        status: paymentRequest.status,
        paymentLink,
        fromAccountId: paymentRequest.fromAccountId,
        toAccountId: paymentRequest.toAccountId,
        expiresAt: paymentRequest.expiresAt,
        createdAt: paymentRequest.createdAt,
      });
    }
  );

  /**
   * POST /payments/request/:id/pay - Pay request
   * Requirements: 8.3
   */
  server.post(
    '/payments/request/:id/pay',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: {
            request: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
            transaction: { type: 'object', properties: { id: str, amount: decStr, type: str, status: str }, required: ['id', 'amount', 'type', 'status'] },
          }, required: ['request', 'transaction'] },
          400: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = payRequestSchema.parse(request.body);
      const user = (request as any).owner || (request as any).agent;

      // Verify user has access to payer account
      const payerAccount = await server.prisma.account.findUnique({
        where: { id: body.payerAccountId },
        include: { Agent: true },
      });

      if (!payerAccount) {
        return reply.status(404).send({
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Payer account not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Authorization check
      if ((request as any).owner) {
        if (payerAccount.Agent?.ownerId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to use this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        if (payerAccount.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to use this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      const { request: paidRequest, transactionId } = await paymentRequestService.payRequest(
        id,
        body.payerAccountId
      );

      // Get the transaction details
      const transaction = await server.prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      return reply.send({
        request: {
          id: paidRequest.id,
          status: paidRequest.status,
        },
        transaction: {
          id: transaction!.id,
          amount: transaction!.amount.toString(),
          type: transaction!.type,
          status: transaction!.status,
        },
      });
    }
  );

  /**
   * POST /payments/request/:id/decline - Decline request
   * Requirements: 8.5
   */
  server.post(
    '/payments/request/:id/decline',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
          400: errorResponse(),
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).owner || (request as any).agent;

      // Get payment request. Full Agent is loaded for AUTHORIZATION
      // (ownerId check); it is never serialized — the route's response
      // schema (above) is the structural strip.
      const paymentRequest = await server.prisma.paymentRequest.findUnique({
        where: { id },
        include: {
          Account_PaymentRequest_fromAccountIdToAccount: {
            include: { Agent: true },
          },
          Account_PaymentRequest_toAccountIdToAccount: {
            include: { Agent: true },
          },
        },
      });

      if (!paymentRequest) {
        return reply.status(404).send({
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Payment request not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Authorization check
      if ((request as any).owner) {
        // For fund requests (toAccountId is null), owner can decline if they own the agent
        if (paymentRequest.toAccountId === null) {
          if (paymentRequest.Account_PaymentRequest_fromAccountIdToAccount.Agent?.ownerId !== user.id) {
            return reply.status(403).send({
              error: {
                code: 'AUTHORIZATION_ERROR',
                message: 'You do not have permission to decline this request',
                timestamp: new Date().toISOString(),
              },
            });
          }
        } else {
          // For regular payment requests, owner can decline if they own the recipient agent
          if (paymentRequest.Account_PaymentRequest_toAccountIdToAccount?.Agent?.ownerId !== user.id) {
            return reply.status(403).send({
              error: {
                code: 'AUTHORIZATION_ERROR',
                message: 'You do not have permission to decline this request',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } else {
        // Agents can only decline if they are the recipient
        if (paymentRequest.toAccountId === null || paymentRequest.toAccountId !== paymentRequest.Account_PaymentRequest_toAccountIdToAccount?.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to decline this request',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // For fund requests, pass null as accountId since owner is declining
      // For regular requests, pass the toAccountId
      const accountIdForDecline = paymentRequest.toAccountId;
      const declinedRequest = await paymentRequestService.declineRequest(id, accountIdForDecline);

      return reply.send({
        id: declinedRequest.id,
        status: declinedRequest.status,
      });
    }
  );

  /**
   * POST /payments/request/:id/approve - Approve fund request (owner only)
   * This endpoint is for owners to approve fund requests from agents
   */
  server.post(
    '/payments/request/:id/approve',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: {
            request: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
            transaction: { type: 'object', properties: { id: str, amount: decStr, status: str }, required: ['id', 'amount', 'status'] },
          }, required: ['request', 'transaction'] },
          400: errorResponse(),
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      // Get payment request. Full Agent is loaded for AUTHORIZATION
      // (ownerId check); it is never serialized — the route's response
      // schema (above) is the structural strip.
      const paymentRequest = await server.prisma.paymentRequest.findUnique({
        where: { id },
        include: {
          Account_PaymentRequest_fromAccountIdToAccount: {
            include: { Agent: true },
          },
        },
      });

      if (!paymentRequest) {
        return reply.status(404).send({
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Payment request not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify request is pending
      if (paymentRequest.status !== 'PENDING') {
        return reply.status(400).send({
          error: {
            code: 'INVALID_STATUS',
            message: `Payment request is ${paymentRequest.status.toLowerCase()}`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify this is a fund request (toAccountId is null) and owner owns the agent
      if (paymentRequest.toAccountId !== null) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_REQUEST_TYPE',
            message: 'This endpoint is only for fund requests to owner',
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (paymentRequest.Account_PaymentRequest_fromAccountIdToAccount.Agent?.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to approve this request',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Fund the account and mark request as paid
      const amount = new Decimal(paymentRequest.amount.toString());
      
      const result = await server.prisma.$transaction(async (tx) => {
        // Fund the agent's account
        const currentBalance = new Decimal(paymentRequest.Account_PaymentRequest_fromAccountIdToAccount.balance.toString());
        const newBalance = currentBalance.plus(amount);
        
        await tx.account.update({
          where: { id: paymentRequest.fromAccountId },
          data: { balance: newBalance },
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            amount,
            currency: 'USD',
            type: 'INBOUND',
            status: 'COMPLETED',
            description: `Fund request approved: ${paymentRequest.description}`,
            fromAccountId: paymentRequest.fromAccountId,
            approvalRequired: false,
          },
        });

        // Update payment request status
        const updatedRequest = await tx.paymentRequest.update({
          where: { id },
          data: { status: 'PAID' },
        });

        return { request: updatedRequest, transaction };
      });

      return reply.send({
        request: {
          id: result.request.id,
          status: result.request.status,
        },
        transaction: {
          id: result.transaction.id,
          amount: result.transaction.amount.toString(),
          status: result.transaction.status,
        },
      });
    }
  );

  /**
   * GET /payments/requests - List payment requests
   * Requirements: 8.6
   */
  server.get(
    '/payments/requests',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: { data: { type: 'array', items: paymentRequestItem() } }, required: ['data'] },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { status } = request.query as { status?: string };
      const user = (request as any).owner || (request as any).agent;

      // Get user's account(s)
      let accountIds: string[] = [];
      if ((request as any).owner) {
        const agents = await server.prisma.agent.findMany({
          where: { ownerId: user.id },
          include: { Account: true },
        });
        accountIds = agents.map((a) => a.Account!.id);
      } else {
        const account = await server.prisma.account.findUnique({
          where: { agentId: user.id },
        });
        if (account) {
          accountIds = [account.id];
        }
      }

      // Build filter
      const where: any = {};
      
      if ((request as any).owner) {
        // For owners, show fund requests from their agents (toAccountId is null)
        where.AND = [
          { fromAccountId: { in: accountIds } },
          { toAccountId: null }
        ];
      } else {
        // For agents, show requests they sent or received
        where.OR = [
          { fromAccountId: { in: accountIds } },
          { toAccountId: { in: accountIds } },
        ];
      }

      if (status) {
        where.status = status;
      }

      const requests = await server.prisma.paymentRequest.findMany({
        where,
        include: {
          Account_PaymentRequest_fromAccountIdToAccount: {
            include: AGENT_PUBLIC_INCLUDE,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return reply.send({
        data: requests.map((req) => ({
          id: req.id,
          amount: req.amount.toString(),
          currency: req.currency,
          description: req.description,
          status: req.status,
          fromAccountId: req.fromAccountId,
          toAccountId: req.toAccountId,
          // Owner context for the dashboard (same shape as transactions).
          fromAccount: { id: req.Account_PaymentRequest_fromAccountIdToAccount.id, agent: toPublicAgent(req.Account_PaymentRequest_fromAccountIdToAccount.Agent as any) },
          Account_PaymentRequest_fromAccountIdToAccount: { id: req.Account_PaymentRequest_fromAccountIdToAccount.id, agent: toPublicAgent(req.Account_PaymentRequest_fromAccountIdToAccount.Agent as any) },
          expiresAt: req.expiresAt,
          createdAt: req.createdAt,
        })),
      });
    }
  );

  /**
   * POST /payments/guest - Process guest payment via payment link
   * Requirements: 10.1, 10.2, 10.3
   * No authentication required
   */
  server.post(
    '/payments/guest',
    {
      schema: {
        response: {
          200: { type: 'object', properties: {
            success: { type: 'boolean' },
            transaction: { type: 'object', properties: { id: str, amount: decStr, currency: str, status: str }, required: ['id', 'amount', 'currency', 'status'] },
            request: { type: 'object', properties: { id: str, status: str }, required: ['id', 'status'] },
          }, required: ['success', 'transaction', 'request'] },
          400: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = guestPaymentSchema.parse(request.body);

      try {
        const result = await paymentRequestService.processGuestPayment(
          body.paymentLink,
          body.cardholderName
        );

        return reply.status(200).send({
          success: true,
          transaction: {
            id: result.transactionId,
            amount: result.amount.toString(),
            currency: result.currency,
            status: result.status,
          },
          request: {
            id: result.requestId,
            status: result.requestStatus,
          },
        });
      } catch (error: any) {
        // Handle specific error cases
        if (error.message.includes('not found')) {
          return reply.status(404).send({
            error: {
              code: 'REQUEST_NOT_FOUND',
              message: 'Payment request not found',
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (error.message.includes('expired')) {
          return reply.status(400).send({
            error: {
              code: 'REQUEST_EXPIRED',
              message: 'Payment request has expired',
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (error.message.includes('already paid') || error.message.includes('declined')) {
          return reply.status(400).send({
            error: {
              code: 'REQUEST_INVALID',
              message: error.message,
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (error.message.includes('declined') || error.message.includes('insufficient')) {
          return reply.status(400).send({
            error: {
              code: 'PAYMENT_DECLINED',
              message: error.message,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Re-throw for global error handler
        throw error;
      }
    }
  );
}
