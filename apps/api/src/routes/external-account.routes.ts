import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ExternalBankAccountService } from '../services/external-bank-account/external-bank-account.service';
import { requireOwner } from '../middleware/auth.middleware';
import { errorResponse, DATE_TIME, decStr, str } from '../lib/serialize';
import Decimal from 'decimal.js';

/** Masked external-account shape (account number shows last 4 only). */
const maskedExternalAccount = {
  type: 'object',
  properties: {
    id: str,
    routingNumber: str,
    accountNumber: str, // masked (****1234) by the handler
    accountHolder: str,
    accountType: str,
    balance: decStr,
    status: str,
    createdAt: DATE_TIME, // declared optional: create doesn't return it, list does
  },
  required: ['id', 'routingNumber', 'accountNumber', 'accountHolder', 'accountType', 'balance', 'status'],
} as const;
// Request schemas
const createMockAccountSchema = z.object({
  routingNumber: z.string().regex(/^[0-9]{9}$/, 'Routing number must be exactly 9 digits'),
  accountNumber: z.string().regex(/^[0-9]{8,17}$/, 'Account number must be 8-17 digits'),
  accountHolder: z.string().min(2, 'Account holder name must be at least 2 characters').max(100, 'Account holder name must not exceed 100 characters'),
  accountType: z.enum(['CHECKING', 'SAVINGS']),
  initialBalance: z.string().optional().refine((val) => {
    if (!val) return true;
    const num = new Decimal(val);
    return num.gte(0);
  }, 'Initial balance must be non-negative'),
});

export async function externalAccountRoutes(server: FastifyInstance) {
  const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
  const externalAccountService = new ExternalBankAccountService(server.prisma, encryptionSecret);

  /**
   * POST /external-accounts - Create mock external bank account
   * Requirements: 3.1, 3.5
   * For testing purposes only
   */
  server.post(
    '/external-accounts',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          201: maskedExternalAccount,
          400: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createMockAccountSchema.parse(request.body);

      const initialBalance = body.initialBalance ? new Decimal(body.initialBalance) : new Decimal(0);

      try {
        const account = await externalAccountService.createMockAccount(
          body.routingNumber,
          body.accountNumber,
          body.accountHolder,
          body.accountType,
          initialBalance
        );

        // Mask account number in response (show last 4 digits only)
        const maskedAccountNumber = '****' + account.accountNumber.slice(-4);

        return reply.status(201).send({
          id: account.id,
          routingNumber: account.routingNumber,
          accountNumber: maskedAccountNumber,
          accountHolder: account.accountHolder,
          accountType: account.accountType,
          balance: account.balance.toString(),
          status: account.status,
        });
      } catch (error) {
        if (error instanceof Error) {
          // Handle duplicate account error
          if ((error as any).code === 'P2002') {
            return reply.status(400).send({
              error: {
                code: 'DUPLICATE_ACCOUNT',
                message: 'An account with this routing and account number already exists',
                timestamp: new Date().toISOString(),
              },
            });
          }

          // Handle validation errors
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.message,
              timestamp: new Date().toISOString(),
            },
          });
        }

        throw error;
      }
    }
  );

  /**
   * GET /external-accounts - List all external bank accounts
   * Requirements: 3.1
   * For testing purposes only
   */
  server.get(
    '/external-accounts',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { accounts: { type: 'array', items: maskedExternalAccount } }, required: ['accounts'] },
          400: errorResponse(),
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const accounts = await externalAccountService.listAccounts();

        // Mask account numbers in response (show last 4 digits only)
        const maskedAccounts = accounts.map((account) => ({
          id: account.id,
          routingNumber: account.routingNumber,
          accountNumber: '****' + account.accountNumber.slice(-4),
          accountHolder: account.accountHolder,
          accountType: account.accountType,
          balance: account.balance.toString(),
          status: account.status,
          createdAt: account.createdAt.toISOString(),
        }));

        return reply.send({
          accounts: maskedAccounts,
        });
      } catch (error) {
        if (error instanceof Error) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.message,
              timestamp: new Date().toISOString(),
            },
          });
        }

        throw error;
      }
    }
  );

  /**
   * GET /external-accounts/:routingNumber/:accountNumber - Verify external bank account
   * Requirements: 3.2
   * For testing purposes only
   */
  server.get(
    '/external-accounts/:routingNumber/:accountNumber',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: {
            exists: { type: 'boolean' },
            accountHolder: str,
            accountType: str,
            status: str,
          }, required: ['exists'] },
          400: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { routingNumber, accountNumber } = request.params as {
        routingNumber: string;
        accountNumber: string;
      };

      try {
        const account = await externalAccountService.getAccount(routingNumber, accountNumber);

        if (!account) {
          return reply.send({
            exists: false,
          });
        }

        return reply.send({
          exists: true,
          accountHolder: account.accountHolder,
          accountType: account.accountType,
          status: account.status,
        });
      } catch (error) {
        if (error instanceof Error) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: error.message,
              timestamp: new Date().toISOString(),
            },
          });
        }

        throw error;
      }
    }
  );
}
