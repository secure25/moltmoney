import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AccountService } from '../services/account/account.service';
import { requireOwner, requireOwnerOrAgent } from '../middleware/auth.middleware';
import Decimal from 'decimal.js';

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

const updateRulesSchema = z.object({
  dailyLimit: z.string().optional(),
  perTransactionLimit: z.string().optional(),
  blockedCategories: z.array(z.string()).optional(),
  requireApprovalAbove: z.string().optional(),
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
          agent: {
            id: agent.id,
            name: agent.name,
            platform: agent.platform,
          },
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
   * GET /accounts/:id/balance - Check balance
   * Requirements: 4.1
   */
  server.get(
    '/accounts/:id/balance',
    {
      preHandler: requireOwnerOrAgent,
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
