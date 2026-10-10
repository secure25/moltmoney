import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MONEY_RATE_LIMIT_CONFIG } from '../lib/rate-limit-config';
import { AuditService, AUDIT_ACTION, actorFromRequest } from '../services/audit/audit.service';

import { z } from 'zod';
import { PaymentService } from '../services/payment/payment.service';
import { createPaymentProvider } from '../providers';
import { createWebhookService } from '../services/webhook/webhook.service';
import { requireAgent, requireOwner, requireOwnerOrAgent } from '../middleware/auth.middleware';
import { ExternalBankAccountService } from '../services/external-bank-account/external-bank-account.service';
import { errorResponse, DATE_TIME, decStr, str, nullable } from '../lib/serialize';
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

const createPayPalOrderSchema = z.object({
  accountId: z.string().uuid().optional(),
  amount: z.string().refine((val) => {
    const num = new Decimal(val);
    return num.gt(0);
  }, 'Amount must be greater than 0'),
  currency: z.string().max(3).optional(),
  description: z.string().max(500).optional(),
  merchantName: z.string().max(100).optional(),
  merchantCategory: z.string().max(50).optional(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const refundSchema = z.object({
  amount: z
    .string()
    .refine((val) => {
      const num = new Decimal(val);
      return num.gt(0);
    }, 'Refund amount must be greater than 0')
    .optional(),
});

export async function paymentRoutes(server: FastifyInstance) {
  const paymentProvider = createPaymentProvider();
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
      // Strict tier: API-key-authenticated money movement.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireAgent,
      schema: {
        response: {
          201: { type: 'object', properties: {
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, type: str, status: str, approvalRequired: { type: 'boolean' }, description: nullable(str), merchantName: nullable(str), createdAt: DATE_TIME,
            }, required: ['id', 'amount', 'type', 'status', 'approvalRequired', 'createdAt'] },
          }, required: ['transaction'] },
          400: errorResponse(),
          404: errorResponse(),
        },
      },
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

      // Audit: money movement (internal send).
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.PAYMENT_SENT,
        targetType: 'Transaction',
        targetId: transaction.id,
        metadata: {
          amount: transaction.amount.toString(),
          currency: transaction.currency,
          toAccountId: resolvedToAccountId,
          approvalRequired: transaction.approvalRequired,
        },
      });

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
      schema: {
        response: {
          200: { type: 'object', properties: {
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, type: str, status: str, approvedAt: nullable(DATE_TIME),
            }, required: ['id', 'amount', 'type', 'status'] },
          }, required: ['transaction'] },
          403: errorResponse(),
          404: errorResponse(),
        },
      },
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

      // Audit: owner approval decision (security-relevant control action).
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.PAYMENT_APPROVED,
        targetType: 'Transaction',
        targetId: approvedTransaction.id,
        metadata: { amount: approvedTransaction.amount.toString(), currency: approvedTransaction.currency },
      });

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
      schema: {
        response: {
          200: { type: 'object', properties: {
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, type: str, status: str,
            }, required: ['id', 'amount', 'type', 'status'] },
          }, required: ['transaction'] },
          403: errorResponse(),
          404: errorResponse(),
        },
      },
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

      // Audit: owner decline decision.
      await new AuditService(server.prisma).record({
        ...actorFromRequest(request),
        action: AUDIT_ACTION.PAYMENT_DECLINED,
        targetType: 'Transaction',
        targetId: declinedTransaction.id,
        metadata: { amount: declinedTransaction.amount.toString(), currency: declinedTransaction.currency },
      });

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
      // Strict tier: API-key-authenticated money movement.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireAgent,
      schema: {
        response: {
          201: { type: 'object', properties: {
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, type: str, status: str, description: nullable(str), recipientName: nullable(str), recipientAccount: str, approvalRequired: { type: 'boolean' }, createdAt: DATE_TIME,
            }, required: ['id', 'amount', 'type', 'status', 'recipientAccount', 'approvalRequired', 'createdAt'] },
          }, required: ['transaction'] },
          400: errorResponse(),
          404: errorResponse(),
        },
      },
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

        // Audit: payout to external bank account.
        // NEVER log the full routing/account numbers — only the same masked
        // form the API response uses (****last4).
        await new AuditService(server.prisma).record({
          ...actorFromRequest(request),
          action: AUDIT_ACTION.PAYMENT_SENT,
          targetType: 'Transaction',
          targetId: transaction.id,
          metadata: {
            kind: 'payout',
            amount: transaction.amount.toString(),
            currency: transaction.currency,
            recipientAccount: `****${body.accountNumber.slice(-4)}`,
            recipientName: transaction.merchantName,
            approvalRequired: transaction.approvalRequired,
          },
        });

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

  /**
   * POST /payments/paypal/orders - Create a PayPal checkout order (Phase 5).
   * Returns the PayPal approval URL that the payer must visit. The MoltMoney
   * transaction stays PENDING until the payer approves and the order is
   * captured (Phase 6 state machine).
   */
  server.post(
    '/payments/paypal/orders',
    {
      // Strict tier: API-key-authenticated money movement.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireAgent,
      schema: {
        response: {
          201: { type: 'object', properties: {
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, currency: str, type: str, status: str, approvalRequired: { type: 'boolean' }, providerName: nullable(str), providerRefId: nullable(str), createdAt: DATE_TIME,
            }, required: ['id', 'amount', 'currency', 'type', 'status', 'approvalRequired', 'createdAt'] },
            orderId: str,
            approvalUrl: str,
            state: str,
          }, required: ['transaction', 'orderId', 'approvalUrl', 'state'] },
          400: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createPayPalOrderSchema.parse(request.body);
      const agent = (request as any).agent;

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

      try {
        const { transaction, approvalUrl, orderId } = await paymentService.createCheckoutOrder(
          account.id,
          new Decimal(body.amount),
          {
            merchantName: body.merchantName,
            merchantCategory: body.merchantCategory,
            description: body.description,
            returnUrl: body.returnUrl,
            cancelUrl: body.cancelUrl,
          }
        );

        // Audit: PayPal order creation (money-movement intent).
        await new AuditService(server.prisma).record({
          ...actorFromRequest(request),
          action: AUDIT_ACTION.ORDER_CREATED,
          targetType: 'Transaction',
          targetId: transaction.id,
          metadata: {
            amount: transaction.amount.toString(),
            currency: transaction.currency,
            orderId,
            merchantName: body.merchantName,
            merchantCategory: body.merchantCategory,
          },
        });

        return reply.status(201).send({
          transaction: {
            id: transaction.id,
            amount: transaction.amount.toString(),
            currency: transaction.currency,
            type: transaction.type,
            status: transaction.status,
            approvalRequired: transaction.approvalRequired,
            providerName: transaction.providerName,
            providerRefId: transaction.providerRefId,
            createdAt: transaction.createdAt,
          },
          orderId,
          approvalUrl,
          state: 'WAITING_FOR_PAYER_APPROVAL',
        });
      } catch (error: any) {
        const errorMessage = error.message || 'PayPal order creation failed';
        let errorCode = 'PAYPAL_ORDER_FAILED';

        if (errorMessage.includes('Insufficient balance')) {
          errorCode = 'INSUFFICIENT_BALANCE';
        } else if (errorMessage.includes('frozen')) {
          errorCode = 'ACCOUNT_FROZEN';
        } else if (errorMessage.includes('Spending rule violation')) {
          errorCode = 'SPENDING_RULE_VIOLATION';
        } else if (errorMessage.includes('not found')) {
          errorCode = 'ACCOUNT_NOT_FOUND';
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

  /**
   * POST /payments/paypal/orders/:orderId/capture - Capture an approved
   * PayPal order (Phase 6). Only succeeds after the payer approved on
   * PayPal (PayPal rejects captures of non-approved orders).
   */
  server.post(
    '/payments/paypal/orders/:orderId/capture',
    {
      // Strict tier: API-key-authenticated money movement.
      config: { rateLimit: MONEY_RATE_LIMIT_CONFIG },
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: {
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, type: str, status: str, providerName: nullable(str), providerRefId: nullable(str), createdAt: DATE_TIME,
            }, required: ['id', 'amount', 'type', 'status', 'createdAt'] },
          }, required: ['transaction'] },
          400: errorResponse(),
          403: errorResponse(),
          404: errorResponse(),
          409: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = request.params as { orderId: string };
      const owner = (request as any).owner;
      const agent = (request as any).agent;

      const transaction = await server.prisma.transaction.findFirst({
        where: {
          OR: [{ id: orderId }, { providerRefId: orderId }],
        },
        include: {
          Account_Transaction_fromAccountIdToAccount: {
            include: { Agent: true },
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

      // Authorization: the agent that created the order, or its owner.
      const fromAccount = transaction.Account_Transaction_fromAccountIdToAccount;
      if (agent) {
        if (!fromAccount.Agent || fromAccount.Agent.id !== agent.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to capture this payment',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else if (owner) {
        if (!fromAccount.Agent || fromAccount.Agent.ownerId !== owner.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to capture this payment',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      try {
        const completedTx = await paymentService.captureCheckoutOrder(orderId);

        // Audit: capture is the moment funds actually move provider-side.
        await new AuditService(server.prisma).record({
          ...actorFromRequest(request),
          action: AUDIT_ACTION.ORDER_CAPTURED,
          targetType: 'Transaction',
          targetId: completedTx.id,
          metadata: {
            amount: completedTx.amount.toString(),
            currency: completedTx.currency,
            orderId: completedTx.providerRefId,
            status: completedTx.status,
          },
        });

        return reply.send({
          transaction: {
            id: completedTx.id,
            amount: completedTx.amount.toString(),
            type: completedTx.type,
            status: completedTx.status,
            providerName: completedTx.providerName,
            providerRefId: completedTx.providerRefId,
            createdAt: completedTx.createdAt,
          },
        });
      } catch (error: any) {
        const errorMessage = error.message || 'PayPal capture failed';
        let errorCode = 'PAYPAL_CAPTURE_FAILED';
        let statusCode = 400;

        if (errorMessage.includes('Owner approval is required')) {
          errorCode = 'OWNER_APPROVAL_REQUIRED';
          statusCode = 403;
        } else if (errorMessage.includes('Spending rule violation')) {
          errorCode = 'SPENDING_RULE_VIOLATION';
          statusCode = 403;
        } else if (errorMessage.includes('Insufficient balance')) {
          errorCode = 'INSUFFICIENT_BALANCE';
        } else if (errorMessage.includes('Cannot capture transaction in')) {
          errorCode = 'INVALID_TRANSACTION_STATE';
          statusCode = 409;
        } else if (errorMessage.includes('not found')) {
          errorCode = 'TRANSACTION_NOT_FOUND';
          statusCode = 404;
        }

        return reply.status(statusCode).send({
          error: {
            code: errorCode,
            message: errorMessage,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  );

  /**
   * POST /payments/transactions/:id/refund - Refund a completed transaction
   * against the provider capture (Phase 10). Omit `amount` for a full
   * refund; pass an amount for a partial refund.
   */
  server.post(
    '/payments/transactions/:id/refund',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          201: { type: 'object', properties: {
            refundId: str,
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, currency: str, type: str, status: str, providerName: nullable(str), providerRefId: nullable(str), originalTransactionId: str, createdAt: DATE_TIME,
            }, required: ['id', 'amount', 'currency', 'type', 'status', 'originalTransactionId', 'createdAt'] },
          }, required: ['refundId', 'transaction'] },
          400: errorResponse(),
          403: errorResponse(),
          404: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;
      const body = refundSchema.parse(request.body);

      const transaction = await server.prisma.transaction.findUnique({
        where: { id },
        include: {
          Account_Transaction_fromAccountIdToAccount: {
            include: { Agent: true },
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

      if (transaction.Account_Transaction_fromAccountIdToAccount.Agent?.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to refund this transaction',
            timestamp: new Date().toISOString(),
          },
        });
      }

      try {
        const { transaction: refundTx, refundId } = await paymentService.refundTransaction(
          id,
          body.amount ? new Decimal(body.amount) : undefined
        );

        return reply.status(201).send({
          refundId,
          transaction: {
            id: refundTx.id,
            amount: refundTx.amount.toString(),
            currency: refundTx.currency,
            type: refundTx.type,
            status: refundTx.status,
            providerName: refundTx.providerName,
            providerRefId: refundTx.providerRefId,
            originalTransactionId: id,
            createdAt: refundTx.createdAt,
          },
        });
      } catch (error: any) {
        const errorMessage = error.message || 'Refund failed';
        let errorCode = 'REFUND_FAILED';

        if (errorMessage.includes('not found')) {
          errorCode = 'TRANSACTION_NOT_FOUND';
        } else if (errorMessage.includes('exceeds the original')) {
          errorCode = 'REFUND_EXCEEDS_ORIGINAL';
        } else if (errorMessage.includes('non-completed')) {
          errorCode = 'INVALID_TRANSACTION_STATE';
        } else if (errorMessage.includes('No provider capture reference')) {
          errorCode = 'NO_PROVIDER_CAPTURE';
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
