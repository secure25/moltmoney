import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TransactionService } from '../services/transaction/transaction.service';
import { requireOwnerOrAgent } from '../middleware/auth.middleware';
import Decimal from 'decimal.js';

// Query schemas
const listTransactionsSchema = z.object({
  accountId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.enum(['INTERNAL', 'INBOUND', 'OUTBOUND', 'PAYOUT']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'DECLINED', 'FAILED']).optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  merchantName: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  approvalRequired: z.string().optional(),
});

const exportTransactionsSchema = z.object({
  accountId: z.string().uuid(),
  format: z.enum(['csv', 'json']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.enum(['INTERNAL', 'INBOUND', 'OUTBOUND', 'PAYOUT']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'DECLINED', 'FAILED']).optional(),
});

export async function transactionRoutes(server: FastifyInstance) {
  const transactionService = new TransactionService(server.prisma);

  /**
   * GET /transactions - List transactions with filters
   * Requirements: 12.1, 12.2
   */
  server.get(
    '/transactions',
    {
      preHandler: requireOwnerOrAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listTransactionsSchema.parse(request.query);
      const user = (request as any).owner || (request as any).agent;
      const isOwner = !!(request as any).owner;

      // If no accountId provided and user is owner, get all their accounts
      let accountIds: string[] = [];
      
      if (!query.accountId) {
        if (!isOwner) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'accountId is required for agent requests',
              timestamp: new Date().toISOString(),
            },
          });
        }
        
        // Get all accounts for this owner
        const agents = await server.prisma.agent.findMany({
          where: { ownerId: user.id },
          include: { Account: true },
        });
        
        accountIds = agents
          .filter((agent) => agent.Account)
          .map((agent) => agent.Account!.id);
          
        if (accountIds.length === 0) {
          return reply.send({
            data: [],
            total: 0,
            page: 1,
            pageSize: parseInt(query.pageSize || '20', 10),
            hasMore: false,
          });
        }
      } else {
        // Verify user has access to the specific account
        const account = await server.prisma.account.findUnique({
          where: { id: query.accountId },
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
        if (isOwner) {
          if (!account.Agent || account.Agent.ownerId !== user.id) {
            return reply.status(403).send({
              error: {
                code: 'AUTHORIZATION_ERROR',
                message: 'You do not have permission to view transactions for this account',
                timestamp: new Date().toISOString(),
              },
            });
          }
        } else {
          if (account.agentId !== user.id) {
            return reply.status(403).send({
              error: {
                code: 'AUTHORIZATION_ERROR',
                message: 'You do not have permission to view transactions for this account',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
        
        accountIds = [query.accountId];
      }

      // Build filters
      const filters: any = {};
      if (query.startDate) filters.startDate = new Date(query.startDate);
      if (query.endDate) filters.endDate = new Date(query.endDate);
      if (query.type) filters.type = query.type;
      if (query.status) filters.status = query.status;
      if (query.minAmount) filters.minAmount = new Decimal(query.minAmount);
      if (query.maxAmount) filters.maxAmount = new Decimal(query.maxAmount);
      if (query.merchantName) filters.merchantName = query.merchantName;
      if (query.page) filters.page = parseInt(query.page, 10);
      if (query.pageSize) filters.pageSize = parseInt(query.pageSize, 10);
      if (query.approvalRequired === 'true') filters.approvalRequired = true;

      // Fetch transactions across all relevant accounts
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const where: any = {
        OR: [
          { fromAccountId: { in: accountIds } },
          { toAccountId: { in: accountIds } },
        ],
      };

      if (filters.startDate) where.createdAt = { ...where.createdAt, gte: filters.startDate };
      if (filters.endDate) where.createdAt = { ...where.createdAt, lte: filters.endDate };
      if (filters.type) where.type = filters.type;
      if (filters.status) where.status = filters.status;
      if (filters.merchantName) where.merchantName = { contains: filters.merchantName };
      if (filters.approvalRequired !== undefined) where.approvalRequired = filters.approvalRequired;

      const [transactions, total] = await Promise.all([
        server.prisma.transaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: {
            Account_Transaction_fromAccountIdToAccount: { include: { Agent: true } },
            Account_Transaction_toAccountIdToAccount: { include: { Agent: true } },
          },
        }),
        server.prisma.transaction.count({ where }),
      ]);

      return reply.send({
        data: transactions.map((tx) => ({
          id: tx.id,
          amount: tx.amount.toString(),
          currency: tx.currency,
          type: tx.type,
          status: tx.status,
          description: tx.description,
          merchantName: tx.merchantName,
          fromAccountId: tx.fromAccountId,
          toAccountId: tx.toAccountId,
          fromAccount: tx.Account_Transaction_fromAccountIdToAccount,
          toAccount: tx.Account_Transaction_toAccountIdToAccount,
          approvalRequired: tx.approvalRequired,
          approvedAt: tx.approvedAt,
          createdAt: tx.createdAt,
        })),
        total,
        page,
        pageSize,
        hasMore: skip + transactions.length < total,
      });
    }
  );

  /**
   * GET /transactions/:id - Transaction details
   * Requirements: 12.3
   */
  server.get(
    '/transactions/:id',
    {
      preHandler: requireOwnerOrAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).owner || (request as any).agent;

      const transaction = await transactionService.getTransaction(id);

      // Verify user has access to transaction
      const fromAccount = await server.prisma.account.findUnique({
        where: { id: transaction.fromAccountId },
        include: { Agent: true },
      });

      if (!fromAccount) {
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
        if (!fromAccount.Agent || fromAccount.Agent.ownerId !== user.id) {
          // Check if user owns the recipient account
          if (transaction.toAccountId) {
            const toAccount = await server.prisma.account.findUnique({
              where: { id: transaction.toAccountId },
              include: { Agent: true },
            });
            if (!toAccount || !toAccount.Agent || toAccount.Agent.ownerId !== user.id) {
              return reply.status(403).send({
                error: {
                  code: 'AUTHORIZATION_ERROR',
                  message: 'You do not have permission to view this transaction',
                  timestamp: new Date().toISOString(),
                },
              });
            }
          } else {
            return reply.status(403).send({
              error: {
                code: 'AUTHORIZATION_ERROR',
                message: 'You do not have permission to view this transaction',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } else {
        if (fromAccount.agentId !== user.id) {
          // Check if agent owns the recipient account
          if (transaction.toAccountId) {
            const toAccount = await server.prisma.account.findUnique({
              where: { id: transaction.toAccountId },
            });
            if (!toAccount || toAccount.agentId !== user.id) {
              return reply.status(403).send({
                error: {
                  code: 'AUTHORIZATION_ERROR',
                  message: 'You do not have permission to view this transaction',
                  timestamp: new Date().toISOString(),
                },
              });
            }
          } else {
            return reply.status(403).send({
              error: {
                code: 'AUTHORIZATION_ERROR',
                message: 'You do not have permission to view this transaction',
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }

      return reply.send({
        id: transaction.id,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        type: transaction.type,
        status: transaction.status,
        description: transaction.description,
        merchantName: transaction.merchantName,
        fromAccountId: transaction.fromAccountId,
        toAccountId: transaction.toAccountId,
        approvalRequired: transaction.approvalRequired,
        approvedAt: transaction.approvedAt,
        createdAt: transaction.createdAt,
      });
    }
  );

  /**
   * GET /transactions/export - Export transactions
   * Requirements: 12.3
   */
  server.get(
    '/transactions/export',
    {
      preHandler: requireOwnerOrAgent,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = exportTransactionsSchema.parse(request.query);
      const user = (request as any).owner || (request as any).agent;

      // Verify user has access to account
      const account = await server.prisma.account.findUnique({
        where: { id: query.accountId },
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
              message: 'You do not have permission to export transactions for this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      } else {
        if (account.agentId !== user.id) {
          return reply.status(403).send({
            error: {
              code: 'AUTHORIZATION_ERROR',
              message: 'You do not have permission to export transactions for this account',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Build filters
      const filters: any = {};
      if (query.startDate) filters.startDate = new Date(query.startDate);
      if (query.endDate) filters.endDate = new Date(query.endDate);
      if (query.type) filters.type = query.type;
      if (query.status) filters.status = query.status;

      const exportData = await transactionService.exportTransactions(
        query.accountId,
        filters,
        query.format
      );

      // Set appropriate content type
      if (query.format === 'csv') {
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="transactions-${query.accountId}.csv"`);
      } else {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="transactions-${query.accountId}.json"`);
      }

      return reply.send(exportData);
    }
  );
}
