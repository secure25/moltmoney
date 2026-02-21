import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PaymentService } from '../services/payment/payment.service';
import { MockPaymentProvider } from '../providers/mock-payment-provider';
import { createWebhookService } from '../services/webhook/webhook.service';
import { requireAgent, requireOwner } from '../middleware/auth.middleware';
import { ExternalBankAccountService } from '../services/external-bank-account/external-bank-account.service';
import Decimal from 'decimal.js';

// Request schemas
const sendPaymentSchema = z.object({
  toAccountId: z.string().optional(), // Can be UUID or account number
  amount: z.string().refine((val) => {
    const num = new Decimal(val);
    return num.gt(0);
  }, 'Amount must be greater than 0'),
  description: z.string().max(500).optional(),
  merchantName: z.string().max(100).optional(),
  merchantCategory: z.string().max(50).optional(),
});

const payoutSchema = z.object({
  routingNumber: z.string().regex(/^[0-9]{9}$/, 'Routing number must be exactly 9 digits'),
  accountNumber: z.string().regex(/^[0-9]{8,17}$/, 'Account number must be 8-17 digits'),
  accountHolder: z.string().min(2, 'Account holder name must be at least 2 characters').max(100, 'Account holder name must not exceed 100 characters'),
  amount: z.string().refine((val) => {
    const num = new Decimal(val);
    return num.gt(0);
  }, 'Amount must be greater than 0'),
  description: z.string().max(500).optional(),
});

export async function paymentRoutes(server: FastifyInstance) {
  const paymentProvider = new MockPaymentProvider();
  const webhookService = createWebhookService(server.prisma);
  const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
  const externalBankAccountService = new ExternalBankAccountService(server.prisma, encryptionSecret);
  const paymentService = new PaymentService(server.prisma, paymentProvider, webhookService, server.wsServer, externalBankAccountService);

  /**
   * POST /payments/send - Send payment
   * Requirements: 5.1
   */
  server.post(
    '/payments/send',
    {
      preHandler: requireAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = sendPaymentSchema.parse(request.body);
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
      
      // Resolve toAccountId - support both UUID and account number
      let resolvedToAccountId: string | null = null;
      if (body.toAccountId) {
        // Check if it's a UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(body.toAccountId)) {
          // It's a UUID, use it directly
          resolvedToAccountId = body.toAccountId;
        } else {
          // It might be an account number, try to look it up
          const recipientAccount = await server.prisma.account.findFirst({
            where: { accountNumber: body.toAccountId },
          });
          
          if (recipientAccount) {
            resolvedToAccountId = recipientAccount.id;
          } else {
            // Not found as account number, will be treated as merchant name
            resolvedToAccountId = null;
          }
        }
      }
      
      const transaction = await paymentService.sendPayment(
        account.id,
        resolvedToAccountId,
        amount,
        body.description,
        body.merchantName || (body.toAccountId && !resolvedToAccountId ? body.toAccountId : undefined),
        body.merchantCategory
      );

      return reply.status(201).send({
        transaction: {
          id: transaction.id,
          amount: transaction.amount.toString(),
          type: transaction.type,
          status: transaction.status,
          approvalRequired: transaction.approvalRequired,
          description: transaction.description,
          merchantName: transaction.merchantName,
          createdAt: transaction.createdAt,
        },
      });
    }
  );

  /**
   * POST /payments/approve/:id - Approve pending payment
   * Requirements: 7.2
   */
  server.post(
    '/payments/approve/:id',
    {
      preHandler: requireOwner,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      // Get transaction
      const transaction = await server.prisma.transaction.findUnique({
        where: { id },
        include: {
          Account_Transaction_fromAccountIdToAccount: {
            include: { Agent: true,
            },
          },
        },
      });

      if (!transaction) {
        return reply.status(404).send({
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify owner owns the agent
      if (transaction.Account_Transaction_fromAccountIdToAccount.Agent?.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to approve this payment',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const approvedTransaction = await paymentService.approvePayment(id, owner.id);

      return reply.send({
        transaction: {
          id: approvedTransaction.id,
          amount: approvedTransaction.amount.toString(),
          type: approvedTransaction.type,
          status: approvedTransaction.status,
          approvedAt: approvedTransaction.approvedAt,
        },
      });
    }
  );

  /**
   * POST /payments/decline/:id - Decline payment
   * Requirements: 7.3
   */
  server.post(
    '/payments/decline/:id',
    {
      preHandler: requireOwner,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      // Get transaction
      const transaction = await server.prisma.transaction.findUnique({
        where: { id },
        include: {
          Account_Transaction_fromAccountIdToAccount: {
            include: { Agent: true,
            },
          },
        },
      });

      if (!transaction) {
        return reply.status(404).send({
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transaction not found',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Verify owner owns the agent
      if (transaction.Account_Transaction_fromAccountIdToAccount.Agent?.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to decline this payment',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const declinedTransaction = await paymentService.declinePayment(id, owner.id);

      return reply.send({
        transaction: {
          id: declinedTransaction.id,
          amount: declinedTransaction.amount.toString(),
          type: declinedTransaction.type,
          status: declinedTransaction.status,
        },
      });
    }
  );

  /**
   * POST /payments/payout - Send payout to external bank account
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
   */
  server.post(
    '/payments/payout',
    {
      preHandler: requireAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = payoutSchema.parse(request.body);
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

        const transaction = await paymentService.sendPayout(
          account.id,
          body.routingNumber,
          body.accountNumber,
          body.accountHolder,
          amount,
          body.description
        );

        return reply.status(201).send({
          transaction: {
            id: transaction.id,
            amount: transaction.amount.toString(),
            type: transaction.type,
            status: transaction.status,
            description: transaction.description,
            recipientName: transaction.merchantName,
            recipientAccount: `****${body.accountNumber.slice(-4)}`,
            approvalRequired: transaction.approvalRequired,
            createdAt: transaction.createdAt,
          },
        });
      } catch (error: any) {
        // Handle validation errors
        if (error.name === 'ZodError') {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.errors[0]?.message || 'Invalid request data',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Handle business logic errors
        const errorMessage = error.message || 'Payout failed';
        let errorCode = 'PAYOUT_FAILED';

        if (errorMessage.includes('Invalid routing number')) {
          errorCode = 'INVALID_ROUTING_NUMBER';
        } else if (errorMessage.includes('Invalid account number')) {
          errorCode = 'INVALID_ACCOUNT_NUMBER';
        } else if (errorMessage.includes('not found')) {
          errorCode = 'ACCOUNT_NOT_FOUND';
        } else if (errorMessage.includes('closed')) {
          errorCode = 'ACCOUNT_CLOSED';
        } else if (errorMessage.includes('Insufficient balance')) {
          errorCode = 'INSUFFICIENT_BALANCE';
        } else if (errorMessage.includes('frozen') || errorMessage.includes('FROZEN')) {
          errorCode = 'ACCOUNT_FROZEN';
        }

        return reply.status(400).send({
          error: {
            code: errorCode,
            message: errorMessage,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  );
}
