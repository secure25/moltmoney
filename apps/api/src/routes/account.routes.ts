import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AccountService } from '../services/account/account.service';
import { buildSpendingPolicyResponse } from '../services/payment/spending-policy';
import { toPublicAgent } from '../services/agent/agent-public';
import { requireOwner, requireOwnerOrAgent } from '../middleware/auth.middleware';
import {
  errorResponse,
  DATE_TIME,
  decStr,
  str,
  nullable,
  spendingRules,
} from '../lib/serialize';
import Decimal from 'decimal.js';

/** Shared account summary shape for fund/freeze/unfreeze/close responses. */
const accountStatus = (withBalance: boolean) => ({
  type: 'object',
  properties: {
    id: str,
    ...(withBalance ? { balance: decStr } : {}),
    currency: nullable(str),
    status: str,
  },
  required: withBalance ? ['id', 'balance', 'status'] : ['id', 'status'],
});

// Request schemas
const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.string().min(1).max(50),
});

const fundAccountSchema = z.object({
  amount: z.string().refine((val) => {
    const num = new Decimal(val);
    return num.gt(0);
  }, 'Amount must be greater than 0'),
});

const decimalStringOptional = z
  .coerce
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid amount with up to 2 decimal places')
  .refine(
    (val) => {
      try {
        return new Decimal(val).gt(0);
      } catch {
        return false;
      }
    },
    { message: 'Must be greater than 0' }
  )
  .optional();

const updateRulesSchema = z.object({
  dailyLimit: decimalStringOptional,
  perTransactionLimit: decimalStringOptional,
  blockedCategories: z.array(z.string()).optional(),
  requireApprovalAbove: decimalStringOptional,
  allowedMerchants: z.array(z.string()).optional(),
});

export async function accountRoutes(server: FastifyInstance) {
  const encryptionSecret = process.env.CARD_ENCRYPTION_SECRET || 'development-secret-change-in-production';
  const accountService = new AccountService(server.prisma, server.wsServer, encryptionSecret);

  /**
   * GET /accounts - List all accounts for owner
   * Requirements: 2.6
   */
  server.get(
    '/accounts',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'array', items: {
            type: 'object',
            properties: {
              id: str,
              balance: decStr,
              currency: str,
              status: str,
              agent: { type: 'object', properties: { id: str, name: str, platform: str }, required: ['id', 'name', 'platform'] },
            },
            required: ['id', 'balance', 'currency', 'status', 'agent'],
          } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const owner = (request as any).owner;

      // Get all agents for this owner
      const agents = await server.prisma.agent.findMany({
        where: { ownerId: owner.id },
        include: {
          Account: true,
        },
      });

      const accounts = agents
        .filter((agent) => agent.Account)
        .map((agent) => ({
          id: agent.Account!.id,
          balance: agent.Account!.balance.toString(),
          currency: agent.Account!.currency,
          status: agent.Account!.status,
          agent: toPublicAgent(agent),
        }));

      return reply.send(accounts);
    }
  );

  /**
   * POST /accounts - Create agent account
   * Requirements: 2.1
   */
  server.post(
    '/accounts',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          201: { type: 'object', properties: {
            // The PLAIN apiKey is intentionally declared here: this is its
            // single show-once appearance. The serializer guarantees it can
            // never appear on any other route — which is the invariant 
            // enforced by the security suite + schema walk.
            agent: { type: 'object', properties: {
              id: str, name: str, platform: str, apiKey: str,
            }, required: ['id', 'name', 'platform', 'apiKey'] },
            account: { type: 'object', properties: {
              id: str, accountNumber: str, balance: decStr, currency: str, status: str,
            }, required: ['id', 'accountNumber', 'balance', 'currency', 'status'] },
            virtualCard: nullable({ type: 'object', properties: {
              id: str, cardNumber: str, cvv: str, expiryMonth: { type: 'integer' }, expiryYear: { type: 'integer' }, status: str,
            }, required: ['id', 'cardNumber', 'cvv', 'expiryMonth', 'expiryYear', 'status'] }),
            message: str,
          }, required: ['agent', 'account', 'message'] },
          400: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createAccountSchema.parse(request.body);
      const owner = (request as any).owner;

      const { agent, account, virtualCard } = await accountService.createAgentAccount(
        owner.id,
        body.name,
        body.platform
      );

      return reply.status(201).send({
        agent: {
          id: agent.id,
          name: agent.name,
          platform: agent.platform,
          apiKey: agent.apiKey, // Only shown once!
        },
        account: {
          id: account.id,
          accountNumber: account.accountNumber,
          balance: account.balance.toString(),
          currency: account.currency,
          status: account.status,
        },
        virtualCard: virtualCard ? {
          id: virtualCard.id,
          cardNumber: virtualCard.cardNumber,
          cvv: virtualCard.cvv,
          expiryMonth: virtualCard.expiryMonth,
          expiryYear: virtualCard.expiryYear,
          status: virtualCard.status,
        } : undefined,
        message: 'IMPORTANT: Save your API key now - it will not be shown again!',
      });
    }
  );

  /**
   * GET /accounts/:id - Get account details
   * Requirements: 2.6
   */
  server.get(
    '/accounts/:id',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: {
            id: str,
            type: str,
            balance: decStr,
            currency: str,
            status: str,
            spendingRules: nullable(spendingRules),
            accountNumber: nullable(str),
            agentId: nullable(str),
            createdAt: DATE_TIME,
          }, required: ['id', 'type', 'balance', 'currency', 'status', 'createdAt'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).owner || (request as any).agent;

      const account = await accountService.getAccount(id);

      // Authorization check
      if ((request as any).owner) {
        // Owner must own the agent
        const agent = await server.prisma.agent.findUnique({
          where: { id: account.agentId! },
        });
        if (!agent || agent.ownerId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to access this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        // Agent must own the account
        if (account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to access this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      return reply.send({
        id: account.id,
        type: account.type,
        balance: account.balance.toString(),
        currency: account.currency,
        status: account.status,
        spendingRules: account.spendingRules,
        accountNumber: account.accountNumber,
        agentId: account.agentId,
        createdAt: account.createdAt,
      });
    }
  );

  /**
   * GET /accounts/:id/spending-policy - Authoritative spending-policy view.
   * Returns the account's rules plus server-computed spentToday,
   * remainingToday and serverTime so agents never have to derive daily
   * usage themselves. spentToday uses the SAME shared aggregation as
   * evaluateSpendingRules (services/payment/spending-policy.ts) — one
   * definition of "spent today". Same authorization/scoping as
   * GET /accounts/:id (owner of the agent, or the agent itself).
   */
  server.get(
    '/accounts/:id/spending-policy',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: {
            accountId: str,
            currency: str,
            rules: nullable(spendingRules),
            spentToday: decStr,
            remainingToday: nullable(decStr),
            serverTime: DATE_TIME,
          }, required: ['accountId', 'currency', 'rules', 'spentToday', 'remainingToday', 'serverTime'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).owner || (request as any).agent;

      const account = await accountService.getAccount(id);

      // Authorization check (identical to GET /accounts/:id)
      if ((request as any).owner) {
        // Owner must own the agent
        const agent = await server.prisma.agent.findUnique({
          where: { id: account.agentId! },
        });
        if (!agent || agent.ownerId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to access this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        // Agent must own the account
        if (account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to access this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      const policy = await buildSpendingPolicyResponse(server.prisma, account);

      return reply.send(policy);
    }
  );

  /**
   * GET /accounts/:id/balance - Check balance
   * Requirements: 4.1
   */
  server.get(
    '/accounts/:id/balance',
    {
      preHandler: requireOwnerOrAgent,
      schema: {
        response: {
          200: { type: 'object', properties: {
            accountId: str,
            balance: decStr,
            currency: str,
            status: str,
          }, required: ['accountId', 'balance', 'currency', 'status'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).owner || (request as any).agent;

      const account = await accountService.getAccount(id);

      // Authorization check
      if ((request as any).owner) {
        const agent = await server.prisma.agent.findUnique({
          where: { id: account.agentId! },
        });
        if (!agent || agent.ownerId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to access this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        if (account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to access this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      const balance = await accountService.getBalance(id);

      return reply.send({
        accountId: id,
        balance: balance.toFixed(2),
        currency: account.currency,
        status: account.status,
      });
    }
  );

  /**
   * PATCH /accounts/:id/rules - Update spending rules
   * Requirements: 6.1
   */
  server.patch(
    '/accounts/:id/rules',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: {
            account: { type: 'object', properties: { id: str, spendingRules: nullable(spendingRules) }, required: ['id', 'spendingRules'] },
          }, required: ['account'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = updateRulesSchema.parse(request.body);
      const owner = (request as any).owner;

      const account = await accountService.getAccount(id);

      // Verify owner owns the agent
      const agent = await server.prisma.agent.findUnique({
        where: { id: account.agentId! },
      });
      if (!agent || agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to update this account',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Convert string amounts to Decimal
      const rules: any = {};
      if (body.dailyLimit) rules.dailyLimit = new Decimal(body.dailyLimit);
      if (body.perTransactionLimit) rules.perTransactionLimit = new Decimal(body.perTransactionLimit);
      if (body.requireApprovalAbove) rules.requireApprovalAbove = new Decimal(body.requireApprovalAbove);
      if (body.blockedCategories) rules.blockedCategories = body.blockedCategories;
      if (body.allowedMerchants) rules.allowedMerchants = body.allowedMerchants;

      const updatedAccount = await accountService.updateSpendingRules(id, rules);

      return reply.send({
        account: {
          id: updatedAccount.id,
          spendingRules: updatedAccount.spendingRules,
        },
      });
    }
  );

  /**
   * POST /accounts/:id/freeze - Freeze account
   * Requirements: 13.1
   */
  server.post(
    '/accounts/:id/freeze',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { account: accountStatus(false) }, required: ['account'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      const account = await accountService.getAccount(id);

      // Verify owner owns the agent
      const agent = await server.prisma.agent.findUnique({
        where: { id: account.agentId! },
      });
      if (!agent || agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to freeze this account',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const frozenAccount = await accountService.freezeAccount(id);

      return reply.send({
        account: {
          id: frozenAccount.id,
          status: frozenAccount.status,
        },
      });
    }
  );

  /**
   * POST /accounts/:id/unfreeze - Unfreeze account
   * Requirements: 13.3
   */
  server.post(
    '/accounts/:id/unfreeze',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { account: accountStatus(false) }, required: ['account'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      const account = await accountService.getAccount(id);

      // Verify owner owns the agent
      const agent = await server.prisma.agent.findUnique({
        where: { id: account.agentId! },
      });
      if (!agent || agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to unfreeze this account',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const unfrozenAccount = await accountService.unfreezeAccount(id);

      return reply.send({
        account: {
          id: unfrozenAccount.id,
          status: unfrozenAccount.status,
        },
      });
    }
  );

  /**
   * POST /accounts/:id/close - Close account
   * Requirements: 13.4
   */
  server.post(
    '/accounts/:id/close',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: { account: accountStatus(false) }, required: ['account'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const owner = (request as any).owner;

      const account = await accountService.getAccount(id);

      // Verify owner owns the agent
      const agent = await server.prisma.agent.findUnique({
        where: { id: account.agentId! },
      });
      if (!agent || agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to close this account',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const closedAccount = await accountService.closeAccount(id);

      return reply.send({
        account: {
          id: closedAccount.id,
          status: closedAccount.status,
        },
      });
    }
  );

  /**
   * POST /accounts/:id/fund - Fund account
   * Requirements: 3.1
   */
  server.post(
    '/accounts/:id/fund',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: { type: 'object', properties: {
            account: accountStatus(true),
            transaction: { type: 'object', properties: {
              id: str, amount: decStr, type: str, status: str,
            }, required: ['id', 'amount', 'type', 'status'] },
          }, required: ['account', 'transaction'] },
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = fundAccountSchema.parse(request.body);
      const owner = (request as any).owner;

      const account = await accountService.getAccount(id);

      // Verify owner owns the agent
      const agent = await server.prisma.agent.findUnique({
        where: { id: account.agentId! },
      });
      if (!agent || agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to fund this account',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const amount = new Decimal(body.amount);
      const transaction = await accountService.fundAccount(id, amount);

      const updatedAccount = await accountService.getAccount(id);

      return reply.send({
        account: {
          id: updatedAccount.id,
          balance: updatedAccount.balance.toString(),
          currency: updatedAccount.currency,
        },
        transaction: {
          id: transaction.id,
          amount: transaction.amount.toString(),
          type: transaction.type,
          status: transaction.status,
        },
      });
    }
  );
}
